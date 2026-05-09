/**
 * API Layer: Agent Sam Reasoning Engine
 * Handles all /api/agent/* routes.
 *
 * Key notes:
 *  - Canonical production catalog: D1 agentsam_ai only (routing, picker metadata, pricing, dispatch).
 *  - agent_model_registry is legacy/staging/enrichment — never used for chat routing or billing math here.
 *  - No hardcoded model strings — always resolved from DB
 *  - Tool definitions loaded per-request via classifyIntent + loadToolsForRequest
 *  - Approval gate wired for high-risk tool calls
 *  - Telemetry written per request via writeTelemetry
 *  - Tool execution delegated to src/tools/ai-dispatch.js
 */
import { chatWithAnthropic }                            from '../integrations/anthropic.js';
import { dispatchStream, OLLAMA_SKIP_MESSAGE }         from '../core/provider.js';
import { unifiedRagSearch, handleAgentMemorySync }      from './rag.js';
import { loadAgentMemoryForPrompt }                     from '../core/memory.js';
import { writeTelemetry }                               from './telemetry.js';
import { jsonResponse }                                 from '../core/responses.js';
import { getAuthUser, getSession,
         isIngestSecretAuthorized,
         fetchAuthUserTenantId,
         authUserIsSuperadmin,
         platformTenantIdFromEnv }    from '../core/auth.js';
import { resolveGitHubToken } from '../core/github-token.js';
import { resolveIdentity, resolveIamActorContext } from '../core/identity.js';
import { selectAgentsamMcpToolRow, selectAgentsamMcpToolsList } from '../core/agentsam-mcp-tools.js';
import { resolveEffectiveWorkspaceId } from '../core/bootstrap.js';
import {
  loadAgentSamUserPolicy,
  isToolAllowedByAllowlist,
  isToolAllowedByPolicyRisk,
  isSubagentToolName,
  collectAllowlistToolKeysForScope,
} from '../core/agent-policy.js';
import { aggregateAnthropicUsageTokens, scheduleInsertAgentCost } from '../core/agent-costs.js';
import { evaluateGuardrails } from '../core/guardrails.js';
import { scheduleAgentsamErrorLog } from '../core/agentsam-error-log.js';
import {
  scheduleRecordMcpToolExecution,
  recordMcpToolOtlpSpan,
  tryReadAgentsamToolCache,
  writeAgentsamToolCacheAfterSuccess,
} from '../core/mcp-tool-execution.js';
import { recordSpan } from '../core/tracer.js';
import { scheduleAgentsamChatAgentRunInsert } from '../core/agent-run-routing.js';
import { pragmaTableInfo } from '../core/retention.js';
import { formatRelativeCheckedAgo, toUnixSeconds }     from './workspaces.js';
import { notifySam }                                    from '../core/notifications.js';
import { getAgentMetadata, logSkillInvocation,
         getActivePromptByWeight, getPromptMetadata }   from './agentsam.js';
import { runBuiltinTool }                               from '../tools/ai-dispatch.js';
import {
  getDefaultModelForTask,
  scheduleRoutingArmBanditUpdate,
  scheduleRoutingArmQualityUpdate,
  applyRoutingArmUsageFeedback,
  loadChatRoutingArmsModelKeyOrder,
  resolveRoutingTaskType,
  CHAT_ROUTING_STATIC_FALLBACK_KEYS,
} from '../core/routing.js';
import {
  scheduleAgentsamCommandRunInsert,
  fireForgetAgentToolChainRow,
  resolveAgentCommand,
} from './command-run-telemetry.js';
import { resolveCanonicalUserId } from './auth.js';
import { estimateCostUsdFromCatalog } from '../core/model-catalog-cost.js';

const WRITE_LIKE_PREFIXES = ['d1_', 'worker_', 'resend_', 'meshyai_'];
const TERM_WRITE_TOOLS = new Set(['terminal_execute', 'run_command', 'bash']);

/** Registry ids in `agentsam_prompt_versions.id` — content always loaded from D1. */
const AP_SYS = {
  core: 'ap_core_agent_sam_system_v1',
  dbSafety: 'ap_core_db_safety_system_v1',
  security: 'ap_core_security_system_v1',
  deploy: 'ap_core_deploy_safety_system_v1',
  billing: 'ap_core_billing_system_v1',
  learning: 'ap_core_learning_system_v1',
  shinshu: 'ap_core_shinshu_system_v1',
  client: 'ap_core_client_work_system_v1',
};
const TENANT_KNOWLEDGE_PLATFORM = 'tenant_knowledge_platform';
const TENANT_SHINSHU = 'tenant_jake_waalk';

/**
 * Effective workspace_id via resolveEffectiveWorkspaceId (header/session/tenant/membership).
 * @param {any} env
 * @param {Request} request
 * @param {string|null|undefined} userId
 * @param {Record<string, unknown>} [cache]
 */
/** Derives cost tier label from agentsam_ai.features_json for workspace tier gating. */
function modelCostTierFromRow(row) {
  const meta = parseJsonSafe(row?.features_json ?? row?.metadata_json, {}) || {};
  const t = meta.cost_tier;
  if (t != null && String(t).trim() !== '') return String(t).trim();
  return 'free';
}

/**
 * Restricts the candidate model chain to tiers allowed for this workspace (agentsam_model_tier).
 */
async function filterWorkspaceModelTierPool(env, workspaceId, chainRows) {
  if (!env?.DB || !workspaceId || !chainRows?.length) return chainRows || [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT cost_tier FROM agentsam_model_tier
       WHERE workspace_id = ? AND is_active = 1
       ORDER BY tier_level ASC`,
    )
      .bind(String(workspaceId).trim())
      .all();
    const rows = results || [];
    if (!rows.length) return chainRows;
    const allowed = new Set(
      rows
        .map((r) => r?.cost_tier)
        .filter((t) => t != null && String(t).trim() !== '')
        .map((t) => String(t).trim()),
    );
    if (!allowed.size) return chainRows;
    return chainRows.filter((r) => allowed.has(modelCostTierFromRow(r)));
  } catch (e) {
    console.warn('[agent] model tier filter', e?.message ?? e);
    return chainRows;
  }
}

/**
 * Appends active skills + rules to the system prompt; records skill invocations (waitUntil).
 */
async function appendSkillsAndRulesToSystemPrompt(env, ctx, systemPrompt, opts) {
  const {
    userId, workspaceId, conversationId,
  } = opts;
  if (!env?.DB) return systemPrompt;
  const uid = userId != null ? String(userId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!uid || !ws) return systemPrompt;
  let extra = '';
  let skillRows = [];
  try {
    const sRes = await env.DB.prepare(
      `SELECT id, name, content_markdown FROM agentsam_skill
       WHERE user_id = ? AND is_active = 1
         AND (workspace_id = ? OR workspace_id IS NULL OR TRIM(COALESCE(workspace_id, '')) = '')
       ORDER BY sort_order ASC`,
    )
      .bind(uid, ws)
      .all();
    skillRows = sRes.results || [];
    if (skillRows.length) {
      const blocks = skillRows.map((r) => {
        const title = String(r.name || r.id || 'skill');
        const body = String(r.content_markdown || '');
        return `### ${title}\n${body}`;
      });
      extra += `\n## Skills\n${blocks.join('\n\n')}\n`;
    }
  } catch (e) {
    console.warn('[agent] skills prompt query', e?.message ?? e);
  }

  try {
    const rRes = await env.DB.prepare(
      `SELECT title, body_markdown FROM agentsam_rules_document
       WHERE is_active = 1
         AND (workspace_id = ? OR workspace_id IS NULL OR TRIM(COALESCE(workspace_id, '')) = '')
       ORDER BY updated_at DESC`,
    )
      .bind(ws)
      .all();
    const rules = rRes.results || [];
    if (rules.length) {
      const blocks = rules.map((r) => {
        const title = String(r.title || 'Rule');
        const body = String(r.body_markdown || '');
        return `### ${title}\n${body}`;
      });
      extra += `\n## Rules\n${blocks.join('\n\n')}\n`;
    }
  } catch (e) {
    console.warn('[agent] rules prompt query', e?.message ?? e);
  }

  if (skillRows.length && ctx?.waitUntil) {
    const conv = conversationId != null ? String(conversationId) : null;
    ctx.waitUntil(
      Promise.all(
        skillRows.map((row) =>
          env.DB.prepare(
            `INSERT INTO agentsam_skill_invocation
             (skill_id, user_id, workspace_id, conversation_id, trigger_method, success)
             VALUES (?, ?, ?, ?, 'auto', 1)`,
          )
            .bind(String(row.id), uid, ws, conv)
            .run()
            .catch((e) => console.warn('[agentsam_skill_invocation]', e?.message ?? e)),
        ),
      ).catch(() => {}),
    );
  }

  return extra ? `${systemPrompt}${extra}` : systemPrompt;
}

function inferArtifactFromAssistantText(text) {
  if (!text || typeof text !== 'string' || !text.includes('```')) return null;
  const m = text.match(/```([\w+#.-]*)/);
  const rawLang = m && m[1] ? String(m[1]).toLowerCase().replace(/^language-/, '') : '';
  let artifact_type = 'other';
  if (rawLang.includes('html')) artifact_type = 'html';
  else if (rawLang === 'js' || rawLang === 'javascript') artifact_type = 'js';
  else if (rawLang === 'ts' || rawLang === 'typescript') artifact_type = 'ts';
  else if (rawLang === 'css') artifact_type = 'css';
  else if (rawLang === 'json') artifact_type = 'json';
  else if (rawLang === 'sql') artifact_type = 'sql';
  const name =
    rawLang && rawLang.length > 0 && rawLang.length < 80 ? rawLang : 'untitled';
  return { artifact_type, name };
}

function scheduleAgentsamArtifactFromChatOutput(env, ctx, opts) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const { outputText, userId, tenantId, workspaceId } = opts;
  const meta = inferArtifactFromAssistantText(outputText || '');
  if (!meta) return;
  const uid = userId != null ? String(userId).trim() : '';
  const tid = tenantId != null ? String(tenantId).trim() : '';
  if (!uid || !tid) return;
  const ws = workspaceId != null ? String(workspaceId).trim() : null;
  ctx.waitUntil(
    env.DB
      .prepare(
        `INSERT INTO agentsam_artifacts
         (user_id, tenant_id, workspace_id, name, artifact_type, r2_key, source)
         VALUES (?, ?, ?, ?, ?, '', 'agent_response')`,
      )
      .bind(uid, tid, ws, meta.name, meta.artifact_type)
      .run()
      .catch((e) => console.warn('[agentsam_artifacts]', e?.message ?? e)),
  );
}

function scheduleAgentsamToolCallLog(env, ctx, fields) {
  if (!env?.DB) return;
  const {
    tenantId,
    sessionId,
    toolName,
    status,
    durationMs,
    costUsd,
    inputTokens,
    outputTokens,
    userId,
    workspaceId,
    errorMessage,
    inputSummary,
  } = fields;
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : '';
  const ws =
    workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
  if (!tid || !ws) return;
  let stat = 'success';
  if (status === 'error') stat = 'error';
  else if (status === 'blocked') stat = 'blocked';
  else if (status === 'pending') stat = 'pending';
  const summary = String(inputSummary ?? '').slice(0, 200);
  const errMsg = errorMessage != null ? String(errorMessage).slice(0, 8000) : null;
  const correlationId = `tcl_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const p = env.DB
    .prepare(
      `INSERT INTO agentsam_tool_call_log
       (tenant_id, session_id, tool_name, status, duration_ms, cost_usd, input_tokens, output_tokens, user_id, workspace_id, error_message, input_summary)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      tid,
      sessionId ?? null,
      String(toolName || 'unknown'),
      stat,
      Math.max(0, Math.floor(Number(durationMs) || 0)),
      Number(costUsd) || 0,
      Math.max(0, Math.floor(Number(inputTokens) || 0)),
      Math.max(0, Math.floor(Number(outputTokens) || 0)),
      userId ?? null,
      ws,
      errMsg,
      summary,
    )
    .run()
    .catch((e) => console.warn('[agentsam_tool_call_log]', e?.message ?? e));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p;
  if (stat === 'error' && errMsg && ctx?.waitUntil) {
    scheduleAgentsamErrorLog(env, ctx, {
      workspaceId: ws,
      tenantId: tid,
      sessionId: sessionId ?? null,
      errorCode: 'tool_call_log_error',
      errorType: 'tool_execution',
      errorMessage: errMsg,
      source: 'tool_call_log',
      sourceId: correlationId,
      contextJson: JSON.stringify({ tool_name: toolName, input_summary: summary, correlation_id: correlationId }),
    });
  }
}

async function resolveBootstrapWorkspaceIdForAgentApi(env, request, userId, cache) {
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid || !env?.DB || !request) return null;
  if (cache && cache.__iamBootWs != null) return cache.__iamBootWs;
  try {
    const authUser = await getAuthUser(request, env).catch(() => null);
    const wr = await resolveEffectiveWorkspaceId(env, request, authUser, cache || {});
    const ws =
      wr.workspaceId != null && String(wr.workspaceId).trim() !== ''
        ? String(wr.workspaceId).trim()
        : null;
    if (cache && typeof cache === 'object') cache.__iamBootWs = ws;
    return ws;
  } catch {
    return null;
  }
}

/** Minimal fallback if D1 has no core row (same intent as legacy single-line base). */
const FALLBACK_CORE_SYSTEM = 'You are Agent Sam, an autonomous AI coding and operations assistant for Inner Animal Media.';

/** Appended in buildSystemPrompt — Python + parallel tool use (Anthropic guidance). */
const AGENT_SAM_PYTHON_PARALLEL_BLOCK = `You are a Python professional. When a task involves data processing, scripting, automation, analysis, or any computation that Python handles well, use python_execute without being asked. You write clean, well-commented Python — proper imports at the top, error handling with try/except, f-strings for formatting, and type hints for function signatures. You know the standard library deeply (pathlib, json, csv, datetime, itertools, collections) and reach for pandas, requests, or other packages when they make the solution cleaner. You never apologize for using Python — you use it because it is the right tool.

For maximum efficiency, whenever you perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially. When reading multiple files, checking multiple endpoints, or running independent lookups, call all tools in parallel. Err on the side of more parallel tool calls rather than fewer sequential ones.`;

/**
 * Match `agentsam_prompt_routes` to mode / intent (intent_labels JSON array + tenant priority).
 * @param {any} env
 * @param {string|null|undefined} tenantId
 * @param {string} modeSlug
 * @param {string} intentSlug
 */
async function resolveAgentsamPromptRoute(env, tenantId, modeSlug, intentSlug) {
  if (!env?.DB) return null;
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const mode = String(modeSlug || '').trim();
  const intent = String(intentSlug || '').trim();
  try {
    const row = await env.DB.prepare(
      `
      SELECT r.*
      FROM agentsam_prompt_routes r
      WHERE r.is_active = 1
        AND (r.tenant_id IS NULL OR r.tenant_id = ?)
        AND (
          EXISTS (
            SELECT 1 FROM json_each(COALESCE(NULLIF(trim(r.intent_labels), ''), '[]')) je
            WHERE je.value IN (?, ?, 'all', '*')
          )
          OR COALESCE(trim(r.intent_labels), '') = ''
          OR trim(r.intent_labels) = '[]'
        )
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM json_each(COALESCE(NULLIF(trim(r.intent_labels), ''), '[]')) je2
          WHERE je2.value IN (?, ?)
        ) THEN 0 ELSE 1 END,
        CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
        COALESCE(r.priority, 0) DESC
      LIMIT 1
    `,
    )
      .bind(tid, mode, intent, mode, intent)
      .first();
    return row || null;
  } catch (e) {
    console.warn('[agent] prompt_route', e?.message ?? e);
    return null;
  }
}

async function buildSystemPrompt(env, tenantId, mode, contextBlock, modeConfig, _promptRouteRow = null) {
  void _promptRouteRow;
  const rows = await env.DB.prepare(`
    SELECT id, prompt_kind, body AS content
    FROM agentsam_prompt_versions
    WHERE status = 'active'
      AND prompt_kind = 'system'
      AND (tenant_id IS NULL OR tenant_id = ?)
    ORDER BY
      CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END DESC,
      id ASC
  `).bind(tenantId || '').all();

  const prompts = rows?.results || [];

  const core = prompts.find((p) => p.id === AP_SYS.core)?.content || FALLBACK_CORE_SYSTEM;
  const dbSafety = prompts.find((p) => p.id === AP_SYS.dbSafety)?.content || '';
  const security = prompts.find((p) => p.id === AP_SYS.security)?.content || '';

  const deployPrompt = ['build', 'deploy', 'agent'].includes(mode)
    ? prompts.find((p) => p.id === AP_SYS.deploy)?.content || ''
    : '';

  const billingPrompt = mode === 'billing'
    ? prompts.find((p) => p.id === AP_SYS.billing)?.content || ''
    : '';

  const learningPrompt = tenantId === TENANT_KNOWLEDGE_PLATFORM
    ? prompts.find((p) => p.id === AP_SYS.learning)?.content || ''
    : '';

  const shinshuPrompt = tenantId === TENANT_SHINSHU
    ? prompts.find((p) => p.id === AP_SYS.shinshu)?.content || ''
    : '';

  const platformTid = platformTenantIdFromEnv(env);
  const clientPrompt = platformTid && tenantId && tenantId !== platformTid
    ? prompts.find((p) => p.id === AP_SYS.client)?.content || ''
    : '';

  const modeFragment = modeConfig?.system_prompt_fragment
    ? `\n\n${modeConfig.system_prompt_fragment}`
    : '';

  return [
    core,
    dbSafety,
    security,
    deployPrompt,
    billingPrompt,
    learningPrompt,
    shinshuPrompt,
    clientPrompt,
    AGENT_SAM_PYTHON_PARALLEL_BLOCK,
    modeFragment,
    contextBlock,
  ].filter(Boolean).join('\n\n---\n\n');
}

function projectIdFromEnv(env) {
  const candidates = [env?.PROJECT_ID, env?.WORKER_NAME, env?.CLOUDFLARE_WORKER_NAME];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return 'inneranimalmedia';
}

function parseJsonSafe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeModeToolPolicy(raw) {
  const policy = parseJsonSafe(raw, {}) || {};
  const allowTools = policy.allow_tools || policy.allowlist || policy.allowed_tools || [];
  const denyTools = policy.deny_tools || policy.blocklist || policy.blocked_tools || [];
  const requireApprovalTools = policy.require_approval_tools || policy.confirmation_required_tools || [];
  return {
    allowTools: Array.isArray(allowTools) ? allowTools.map((v) => String(v)) : [],
    denyTools: Array.isArray(denyTools) ? denyTools.map((v) => String(v)) : [],
    requireApprovalTools: Array.isArray(requireApprovalTools) ? requireApprovalTools.map((v) => String(v)) : [],
  };
}

async function loadModeToolPolicy(env, modeSlug) {
  if (!env.DB) return { allowTools: [], denyTools: [], requireApprovalTools: [] };
  try {
    const row = await env.DB.prepare(
      'SELECT tool_policy_json FROM agent_mode_configs WHERE slug = ? AND is_active = 1 LIMIT 1'
    ).bind(modeSlug || 'ask').first();
    return normalizeModeToolPolicy(row?.tool_policy_json);
  } catch (_) {
    return { allowTools: [], denyTools: [], requireApprovalTools: [] };
  }
}

function inferIntentHeuristically(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { taskType: 'chat', mode: 'auto' };

  const is = (pattern) => pattern.test(t);
  const hasDeploy = is(/\b(deploy|wrangler deploy|npm run deploy|push to prod|promote|release)\b/);
  const hasSql =
    is(/\b(select|insert|update|delete|upsert|create table|drop table|alter table|migrate|from\s+\w|where\s+\w)\b/) ||
    is(/\bd1_query|sql query\b/);
  const hasShell = is(
    /\b(run|bash|zsh|terminal|shell|pm2|npm run|pnpm|yarn run|git\s|ls\b|cat\s|chmod|curl\b)\b/,
  );
  const hasCode = is(
    /\b(write|edit|fix|create file|refactor|implement|monaco|\.js\b|\.ts\b|\.jsx\b|worker\.js|function|component|class)\b/,
  );
  const hasDebug = is(/\b(debug|error|trace|why.*fail|not working|broken|exception|crash|stack trace)\b/);
  const hasPlan = is(/\b(plan|roadmap|architect|diagram|excalidraw|spec|wireframe|flowchart)\b/);
  const hasRecall = is(/\b(recall|remember|what did|history|past session|previous|last time|earlier today)\b/);
  const hasCms = is(/\b(cms|theme|page|component|liquid|shopify|content edit)\b/);
  const hasTool = is(/\b(use tool|invoke|mcp tool|call tool|run tool)\b/);
  const hasWorkflow = is(/\b(run workflow|start workflow|trigger|execute workflow|pipeline)\b/);

  if (hasWorkflow) return { taskType: 'workflow_orchestration', mode: 'agent' };
  if (hasDeploy) return { taskType: 'deploy', mode: 'agent' };
  if (hasSql && !hasCode) return { taskType: 'sql_d1_generation', mode: 'agent' };
  if (hasShell && !hasCode) return { taskType: 'terminal_execution', mode: 'agent' };
  if (hasDebug) return { taskType: 'debug', mode: 'agent' };
  if (hasPlan) return { taskType: 'plan', mode: 'agent' };
  if (hasRecall) return { taskType: 'summary', mode: 'auto' };
  if (hasCms) return { taskType: 'cms_edit', mode: 'agent' };
  if (hasTool) return { taskType: 'tool_use', mode: 'agent' };
  if (hasCode || (hasSql && hasShell)) return { taskType: 'code', mode: 'agent' };
  return { taskType: 'chat', mode: 'agent' };
}

async function classifyIntent(_env, lastMessageText) {
  const { taskType, mode } = inferIntentHeuristically(lastMessageText);
  const legacyMap = {
    sql_d1_generation: 'sql',
    terminal_execution: 'shell',
    code: 'shell',
  };
  return { intent: legacyMap[taskType] ?? 'question', taskType, mode };
}

async function loadToolsForRequest(env, modeSlug, _intent, opts = {}) {
  const lim = Math.max(1, Math.min(200, Number(opts.limit || 20) || 20));
  if (!env.DB) return { tools: [] };
  const policy = await loadModeToolPolicy(env, modeSlug);
  const mcpScope = {
    userId: opts.userId,
    tenantId: opts.tenantId,
    workspaceId: opts.workspaceId,
    personUuid: opts.personUuid,
  };
  let rows = await selectAgentsamMcpToolsList(env.DB, mcpScope, lim);
  const uid = opts.userId != null ? String(opts.userId).trim() : '';
  const wsId = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  const tid = opts.tenantId != null ? String(opts.tenantId).trim() : '';
  const pid = opts.personUuid != null ? String(opts.personUuid).trim() : '';
  if (wsId && (uid || tid || pid)) {
    try {
      const keys = await collectAllowlistToolKeysForScope(env.DB, {
        userId: uid,
        workspaceId: wsId,
        tenantId: tid,
        personUuid: pid,
      });
      if (keys.size) {
        rows = rows.filter((r) => keys.has(String(r.tool_name || '').trim()));
      }
    } catch (e) {
      console.warn('[agent] mcp allowlist', e?.message ?? e);
    }
  }
  if (policy.allowTools.length) {
    const allow = new Set(policy.allowTools);
    rows = rows.filter((r) => allow.has(String(r.tool_name)));
  }
  if (policy.denyTools.length) {
    const deny = new Set(policy.denyTools);
    rows = rows.filter((r) => !deny.has(String(r.tool_name)));
  }
  const tools = rows.map((r) => ({
    name: String(r.tool_name),
    description: String(r.description || ''),
    input_schema: parseJsonSafe(r.input_schema, { type: 'object', properties: {} }),
    tool_category: String(r.tool_category || 'builtin'),
    requires_approval: Number(r.requires_approval || 0) === 1,
  }));
  return { tools };
}

function inferRiskLevel(toolName, category = '', rowRiskLevel = '') {
  const r = String(rowRiskLevel || '').toLowerCase();
  if (r === 'critical' || r === 'high') return r;
  const t = String(toolName || '').toLowerCase();
  const c = String(category || '').toLowerCase();
  if (WRITE_LIKE_PREFIXES.some((p) => t.startsWith(p))) return 'high';
  if (TERM_WRITE_TOOLS.has(t)) return 'high';
  if (c === 'terminal' || c === 'deploy') return 'high';
  if (c === 'd1' || c === 'r2') return 'medium';
  return 'low';
}

async function validateToolCall(env, modeSlug, toolName, mcpRuntimeContext = {}, userPolicy = null) {
  const name = String(toolName || '').trim();
  if (!name) {
    return {
      allowed: false,
      reason: 'missing tool name',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
    };
  }
  const uid = mcpRuntimeContext.userId != null ? String(mcpRuntimeContext.userId).trim() : '';
  const ws =
    mcpRuntimeContext.workspaceId != null ? String(mcpRuntimeContext.workspaceId).trim() : '';
  const policyRow = userPolicy || (await loadAgentSamUserPolicy(env, uid, ws));

  if (isSubagentToolName(name) && Number(policyRow.allow_subagent_spawn ?? 1) !== 1) {
    return {
      allowed: false,
      reason: 'subagent spawn disabled by policy',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
    };
  }

  const policy = await loadModeToolPolicy(env, modeSlug);
  if (policy.denyTools.includes(name)) {
    return {
      allowed: false,
      reason: 'blocked by mode policy',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
    };
  }
  if (policy.allowTools.length && !policy.allowTools.includes(name)) {
    return {
      allowed: false,
      reason: 'not in mode allowlist',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: null,
    };
  }
  let row = null;
  if (env.DB) {
    const scope = {
      userId: mcpRuntimeContext.userId,
      tenantId: mcpRuntimeContext.tenantId,
      workspaceId: mcpRuntimeContext.workspaceId,
      personUuid: mcpRuntimeContext.personUuid,
    };
    row = await selectAgentsamMcpToolRow(env.DB, scope, name);
    if (row && Number(row.enabled || 0) !== 1) {
      return {
        allowed: false,
        reason: 'tool disabled',
        riskLevel: 'blocked',
        requiresConfirmation: false,
        mcpToolId: row?.id ?? null,
      };
    }
  }

  const allowRes = await isToolAllowedByAllowlist(
    env,
    policyRow,
    {
      userId: mcpRuntimeContext.userId,
      workspaceId: mcpRuntimeContext.workspaceId,
      tenantId: mcpRuntimeContext.tenantId,
      personUuid: mcpRuntimeContext.personUuid,
      isSuperadmin: !!mcpRuntimeContext.isSuperadmin,
    },
    name,
    row,
  );
  if (!allowRes.allowed) {
    return {
      allowed: false,
      reason: allowRes.reason || 'tool not in allowlist',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: row?.id ?? null,
    };
  }

  const riskLevel = inferRiskLevel(name, row?.tool_category, row?.risk_level);
  if (!isToolAllowedByPolicyRisk(policyRow, riskLevel)) {
    return {
      allowed: false,
      reason: 'blocked by tool_risk_level_max',
      riskLevel: 'blocked',
      requiresConfirmation: false,
      mcpToolId: row?.id ?? null,
    };
  }

  let registryRequiresApproval = false;
  if (env.DB && ws) {
    const appr = await env.DB.prepare(
      `SELECT requires_approval FROM agentsam_mcp_tools
       WHERE tool_key = ? AND workspace_id = ? AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(name, ws)
      .first()
      .catch(() => null);
    registryRequiresApproval = Number(appr?.requires_approval || 0) === 1;
  }

  const requiresConfirmation = registryRequiresApproval || policy.requireApprovalTools.includes(name);
  return {
    allowed: true,
    reason: 'allowed',
    riskLevel,
    requiresConfirmation,
    mcpToolId: row?.id ?? null,
  };
}

async function dispatchToolCall(env, toolName, input, context = {}) {
  const t0 = Date.now();
  const cached = await tryReadAgentsamToolCache(env, {
    workspaceId: context.workspaceId,
    tenantId: context.tenantId,
    toolName,
    toolInput: input,
  });
  if (cached.hit) return cached.value;

  const sess = {
    user_id: context.userId,
    workspace_id: context.workspaceId,
    workspaceId: context.workspaceId,
    tenant_id: context.tenantId,
    session_id: context.sessionId,
    person_uuid: context.personUuid,
    is_superadmin: context.isSuperadmin,
  };
  const params = {
    ...(input && typeof input === 'object' ? input : {}),
    session: sess,
    session_id: context.sessionId || input?.session_id || null,
    tenant_id: context.tenantId || input?.tenant_id || null,
    user_id: context.userId || input?.user_id || null,
    workspace_id: context.workspaceId ?? input?.workspace_id ?? null,
    person_uuid: context.personUuid ?? input?.person_uuid ?? null,
    request: context.request || null,
  };
  const out = await runBuiltinTool(env, toolName, params);
  if (out && typeof out === 'object' && out.error) {
    throw new Error(typeof out.error === 'string' ? out.error : JSON.stringify(out.error));
  }
  await writeAgentsamToolCacheAfterSuccess(env, {
    workspaceId: context.workspaceId,
    tenantId: context.tenantId,
    toolName,
    toolInput: input,
    toolOutput: out,
    durationMs: Date.now() - t0,
    execErr: null,
  });
  return out;
}

// ─── Request-scoped Context Loaders ──────────────────────────────────────────

async function loadModeConfig(env, modeSlug) {
  const slug = (modeSlug || 'auto').toLowerCase();
  const defaults = {
    slug,
    temperature: 0.7,
    auto_run: 0,
    max_tool_calls: 15,
    system_prompt_fragment: null,
    context_strategy: 'standard',
    tool_policy_json: null,
    gate_model: null,
    gate_reasoning_effort: null,
    model_preference: null,
    escalation_model: null,
    escalation_threshold: 0,
  };
  if (!env.DB) return defaults;

  try {
    const row = await env.DB.prepare(
      `SELECT gate_model, gate_reasoning_effort, model_preference,
              escalation_model, escalation_threshold, tool_policy_json, system_prompt_fragment
       FROM agent_mode_configs WHERE slug = ? AND is_active = 1 LIMIT 1`
    ).bind(slug).first();
    const cfg = row || {};
    return { ...defaults, ...cfg, slug };
  } catch (_) { return defaults; }
}

async function resolveDefaultModel(env, tenantId) {
  if (!env.DB || !tenantId || String(tenantId).trim() === '') return null;
  try {
    const row = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND COALESCE(supports_tools, 0) = 1
         AND LOWER(COALESCE(api_platform, '')) != 'workers_ai'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    ).bind(tenantId).first();
    if (row?.model_key) return row.model_key;
    const fb = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND COALESCE(supports_tools, 0) = 1
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC LIMIT 1`,
    ).bind(tenantId).first();
    return fb?.model_key || null;
  } catch (_) {
    return null;
  }
}

const AI_MODEL_ROW_SQL = `id, name, provider, model_key, api_platform,
  secret_key_name, supports_tools, supports_vision,
  supports_cache, context_max_tokens, output_max_tokens,
  input_rate_per_mtok, output_rate_per_mtok,
  cache_write_rate_per_mtok, cache_read_rate_per_mtok,
  size_class, sort_order, tool_invocation_style,
  thinking_mode, effort, system_prompt,
  features_json, picker_group, is_global,
  allowed_tenants_json`;

async function resolveAiModelRowById(env, id, tenantIdOpt) {
  if (!env.DB || id == null || id === '') return null;
  const tenantId =
    tenantIdOpt != null && String(tenantIdOpt).trim() !== ''
      ? String(tenantIdOpt).trim()
      : null;
  if (!tenantId) return null;
  try {
    return await env.DB.prepare(
      `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE id = ?
         AND mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       LIMIT 1`,
    ).bind(id, tenantId).first();
  } catch (_) {
    return null;
  }
}

function metadataObject(row) {
  return parseJsonSafe(row?.features_json ?? row?.metadata_json, {}) || {};
}

function rowIsGranite(row) {
  const mk = String(row?.model_key || '').toLowerCase();
  if (mk.includes('granite')) return true;
  const meta = metadataObject(row);
  if (meta.fallback_only === true) return true;
  return false;
}

/** External paid/cloud APIs — excludes Workers AI / Cloudflare-hosted chat fallbacks. */
function rowIsExternalProvider(row) {
  const plat = String(row?.api_platform || '').toLowerCase();
  const prov = String(row?.provider || '').toLowerCase();
  if (plat === 'workers_ai' || prov === 'cloudflare') return false;
  return true;
}

async function resolveAiModelFromRequest(env, body, tenantIdCtx) {
  const tenantId =
    tenantIdCtx != null && String(tenantIdCtx).trim() !== ''
      ? String(tenantIdCtx).trim()
      : body?.tenant_id != null && String(body.tenant_id).trim() !== ''
        ? String(body.tenant_id).trim()
        : null;
  if (!tenantId) {
    return { row: null, rawRequestedKey: null, rawRequestedId: null };
  }
  const rawId =
    body?.model_id != null && String(body.model_id).trim() !== ''
      ? String(body.model_id).trim()
      : body?.modelId != null && String(body.modelId).trim() !== ''
        ? String(body.modelId).trim()
        : '';
  let rawKey =
    body?.model != null && String(body.model).trim() !== ''
      ? String(body.model).trim()
      : body?.model_key != null && String(body.model_key).trim() !== ''
        ? String(body.model_key).trim()
        : body?.modelKey != null && String(body.modelKey).trim() !== ''
          ? String(body.modelKey).trim()
          : '';
  if (/^auto$/i.test(rawKey)) rawKey = '';
  if (!env.DB) {
    return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
  }
  try {
    if (rawId || rawKey) {
      const needle = rawId || rawKey;
      const row = await env.DB.prepare(
        `SELECT ${AI_MODEL_ROW_SQL}
         FROM agentsam_ai
         WHERE (id = ? OR model_key = ?)
           AND mode = 'model' AND status = 'active'
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         LIMIT 1`,
      )
        .bind(needle, needle, tenantId)
        .first();
      if (row) {
        if (rawId) {
          return { row, rawRequestedKey: rawKey || row.model_key, rawRequestedId: rawId };
        }
        return { row, rawRequestedKey: rawKey, rawRequestedId: rawId || null };
      }
    }
  } catch (_) {
    /* fallthrough */
  }
  return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
}

function normalizeGateParseFailure(originalMessage) {
  return { intent: 'auto', rewritten_query: originalMessage, confidence: 0 };
}

async function gateRewriteAndClassify(env, modeConfig, message, tenantId) {
  if (!tenantId || String(tenantId).trim() === '') return normalizeGateParseFailure(message);
  const gateId = modeConfig?.gate_model ?? null;
  const gateMeta = await resolveAiModelRowById(env, gateId, tenantId);
  if (!gateMeta?.model_key) return normalizeGateParseFailure(message);

  const gatePrompt =
    "Classify the intent of this message into one word (sql/shell/question/deploy/github/file/kv/infra/search/mixed) and rewrite it as a precise technical query. Respond JSON: {intent, rewritten_query, confidence}";

  try {
    const res = await dispatchComplete(env, {
      modelKey: gateMeta.model_key,
      systemPrompt: gatePrompt,
      messages: [{ role: 'user', content: message }],
      tools: [],
      options: { reasoningEffort: modeConfig?.gate_reasoning_effort || 'none' },
    });
    const text = typeof res === 'string'
      ? res
      : (typeof res?.text === 'string' ? res.text : JSON.stringify(res));
    const parsed = parseJsonSafe(text, null);
    const intent = typeof parsed?.intent === 'string' ? parsed.intent : 'auto';
    const rewritten_query =
      typeof parsed?.rewritten_query === 'string' && parsed.rewritten_query.trim()
        ? parsed.rewritten_query.trim()
        : message;
    const confidence = Number(parsed?.confidence);
    return { intent, rewritten_query, confidence: Number.isFinite(confidence) ? confidence : 0 };
  } catch (_) {
    return normalizeGateParseFailure(message);
  }
}

async function selectThompsonArm(env, taskType, mode, workspaceId) {
  if (!env.DB || !taskType) return null;
  try {
    const arm = await env.DB.prepare(
      `SELECT ra.id as arm_id, ra.model_key, ra.provider,
             ra.tools_json, ra.workflow_agent, ra.reasoning_effort,
             ai.id as ai_model_id, ai.api_platform
      FROM agentsam_routing_arms ra
      LEFT JOIN agentsam_ai ai
             ON ai.model_key = ra.model_key AND ai.status = 'active'
      WHERE ra.task_type = ?
        AND ra.mode = ?
        AND ra.is_active = 1
        AND ra.is_eligible = 1
        AND ra.is_paused = 0
        AND ra.budget_exhausted = 0
        AND ra.workspace_id = ?
      ORDER BY ra.decayed_score DESC
      LIMIT 1`,
    )
      .bind(taskType, mode, workspaceId)
      .first();
    if (!arm) return null;
    return {
      source: 'thompson',
      modelId: arm.ai_model_id || arm.model_key,
      armId: arm.arm_id,
      toolsJson: arm.tools_json,
      workflowAgent: arm.workflow_agent,
      reasoningEffort: arm.reasoning_effort || 'medium',
    };
  } catch (e) {
    console.warn('[routing] selectThompsonArm failed:', e?.message);
    return null;
  }
}

async function recordArmOutcome(env, armId, success) {
  if (!env.DB || !armId) return;
  try {
    await env.DB.prepare(
      `UPDATE agentsam_routing_arms SET
        total_executions = total_executions + 1,
        success_alpha = success_alpha + CASE WHEN ? THEN 0.5 ELSE 0 END,
        success_beta  = success_beta  + CASE WHEN ? THEN 0 ELSE 0.5 END,
        decayed_score = (success_alpha + CASE WHEN ? THEN 0.5 ELSE 0 END) /
          (success_alpha + success_beta + 1.0) *
          pow(0.995, CAST((unixepoch() - last_decay_at) AS REAL) / 86400.0),
        last_decay_at = unixepoch(),
        updated_at = unixepoch()
      WHERE id = ?`,
    )
      .bind(success ? 1 : 0, success ? 1 : 0, success ? 1 : 0, armId)
      .run();
  } catch (e) {
    console.warn('[routing] recordArmOutcome failed:', e?.message);
  }
}

async function loadSkillsForTaskType(env, taskType, workspaceId) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, content_markdown
      FROM agentsam_skill
      WHERE is_active = 1
        AND (always_apply = 1
             OR route_keys_json LIKE ?
             OR task_types_json LIKE ?)
        AND (workspace_id = ? OR workspace_id IS NULL OR trim(COALESCE(workspace_id,'')) = '')
      ORDER BY always_apply DESC, sort_order ASC
      LIMIT 6`,
    )
      .bind(`%"${taskType}"%`, `%"${taskType}"%`, workspaceId)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

async function shouldIncludeRag(env, taskType, tenantId) {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT include_rag FROM agentsam_prompt_routes
      WHERE is_active = 1
        AND (route_key = ? OR intent_labels LIKE ?)
        AND (tenant_id IS NULL OR tenant_id = ? OR trim(COALESCE(tenant_id,'')) = '')
      ORDER BY priority ASC
      LIMIT 1`,
    )
      .bind(taskType, `%"${taskType}"%`, tenantId ?? '')
      .first();
    return row?.include_rag === 1;
  } catch {
    return false;
  }
}

async function resolveWorkflowForMessage(env, taskType, message, workspaceId) {
  if (!env.DB) return null;
  const t = String(message || '').toLowerCase();
  const keywordMap = [
    [/\b(monaco|edit file|write to file|open file)\b/, 'i-am-builder-monaco'],
    [/\b(excalidraw|draw|diagram|wireframe|flowchart)\b/, 'i-am-architect-excalidraw'],
    [/\b(architect|plan|design spec)\b/, 'i-am-architect-plan'],
    [/\b(playwright|screenshot|browser test|e2e)\b/, 'i-am-inspector-playwright'],
    [/\b(qa|smoke test|test suite|run tests)\b/, 'i-am-inspector-qa'],
    [/\b(deploy to cloudflare|wrangler deploy|cf deploy)\b/, 'i-am-operator-deploy'],
    [/\b(build on github|push to github|git commit)\b/, 'i-am-builder-github'],
  ];
  for (const [pattern, wfKey] of keywordMap) {
    if (pattern.test(t)) {
      try {
        const wf = await env.DB.prepare(
          `SELECT id, workflow_key, display_name, default_task_type,
                  risk_level, requires_approval
           FROM agentsam_workflows
           WHERE workflow_key = ? AND is_active = 1 LIMIT 1`,
        )
          .bind(wfKey)
          .first();
        if (wf) return wf;
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

async function loadIntentPattern(env, intentSlug) {
  if (!env.DB || !intentSlug) return null;
  try {
    return await env.DB.prepare(
      `SELECT workflow_agent, tools_json FROM agentsam_routing_arms
       WHERE intent_slug = ? AND is_active = 1 LIMIT 1`
    ).bind(String(intentSlug).trim().toLowerCase()).first();
  } catch (_) {
    return null;
  }
}

function dedupeModelsByKey(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const k = r?.model_key;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** DB-driven tool-capable fallback chain (canonical agentsam_ai only). */
async function loadToolFallbackChain(env, opts = {}) {
  if (!env.DB) return [];
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : '';
  if (!tenantId) return [];
  const excludeModelKeys = Array.isArray(opts.excludeModelKeys)
    ? [...new Set(opts.excludeModelKeys.map((k) => String(k || '').trim()).filter(Boolean))]
    : [];
  const limRaw = Number(opts.limit);
  const lim = Number.isFinite(limRaw) && limRaw > 0 ? Math.min(Math.floor(limRaw), 50) : 3;
  try {
    let sql = `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND supports_tools = 1
         AND model_key IS NOT NULL
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         AND api_platform NOT IN ('workers_ai', 'ollama')`;
    const binds = [tenantId];
    if (excludeModelKeys.length) {
      sql += ` AND model_key NOT IN (${excludeModelKeys.map(() => '?').join(',')})`;
      binds.push(...excludeModelKeys);
    }
    sql += ` ORDER BY COALESCE(sort_order, 999999) ASC LIMIT ?`;
    binds.push(lim);
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return results || [];
  } catch (_) {
    return [];
  }
}

async function resolveAgentsamAiRowByModelKey(env, tenantId, modelKey) {
  if (!env.DB || !tenantId || !modelKey) return null;
  const mk = String(modelKey).trim();
  if (!mk) return null;
  try {
    return await env.DB.prepare(
      `SELECT ${AI_MODEL_ROW_SQL}
       FROM agentsam_ai
       WHERE model_key = ?
         AND mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
       LIMIT 1`,
    ).bind(mk, tenantId).first();
  } catch (_) {
    return null;
  }
}

/**
 * Chat SSE tail of the model chain: `agentsam_routing_arms` (chat + mode + is_eligible, decayed_score),
 * resolved to `agentsam_ai` rows; falls back to static keys if D1 yields no resolvable rows.
 */
async function loadChatRoutingFallbackRows(env, opts = {}) {
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : '';
  if (!tenantId) return [];
  const mode = opts.mode;
  const excludeModelKeys = Array.isArray(opts.excludeModelKeys)
    ? opts.excludeModelKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : [];
  const excludeSet = new Set(excludeModelKeys);
  const requireTools = !!opts.requireTools;

  const ws =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : '';
  let keyOrder = await loadChatRoutingArmsModelKeyOrder(env, mode, ws, {
    toolRequired: requireTools,
  });
  keyOrder = keyOrder.filter((k) => !excludeSet.has(k));

  const rows = [];
  const seen = new Set();
  for (const mk of keyOrder) {
    const r = await resolveAgentsamAiRowByModelKey(env, tenantId, mk);
    if (r?.model_key && !seen.has(r.model_key)) {
      seen.add(r.model_key);
      rows.push(r);
    }
  }

  if (!rows.length) {
    for (const mk of CHAT_ROUTING_STATIC_FALLBACK_KEYS) {
      if (excludeSet.has(mk)) continue;
      const r = await resolveAgentsamAiRowByModelKey(env, tenantId, mk);
      if (r?.model_key && !seen.has(r.model_key)) {
        seen.add(r.model_key);
        rows.push(r);
      }
    }
  }

  return filterChainToolPolicy(rows, requireTools);
}

function filterChainToolPolicy(rows, requireTools) {
  if (!requireTools || !rows?.length) return rows || [];
  return rows.filter((r) => Number(r.supports_tools) === 1);
}

/** AUTO routing: drop Granite when any non-Granite external provider is available in the pool. */
function filterGraniteAutoChain(rows, externalNonGraniteExists) {
  if (!rows?.length) return [];
  if (!externalNonGraniteExists) return rows;
  return rows.filter((r) => !rowIsGranite(r));
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`timeout_after_${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

let modelTierMigrationStarted = false;
async function runModelTierMigration(env) {
  // No-op: model tiers are managed and seeded in D1 (agentsam_model_tier).
  // Kept to avoid breaking older code paths that still call this function.
  void env;
}

function kickoffModelTierMigration(env, ctx) {
  if (modelTierMigrationStarted) return;
  modelTierMigrationStarted = true;
  try {
    const p = runModelTierMigration(env).catch((e) => {
      console.warn('[agent] model tier migration failed:', e?.message);
    });
    ctx?.waitUntil?.(p);
  } catch (e) {
    console.warn('[agent] model tier migration kickoff failed:', e?.message);
  }
}

// ─── Approval Gate ────────────────────────────────────────────────────────────

function needsApproval(validationResult, modeConfig, userPolicy) {
  if (!validationResult.allowed) return false;
  if (!validationResult.requiresConfirmation) return false;
  if (modeConfig.auto_run === 1 && userPolicy.auto_run_mode === 'auto') return false;
  return true;
}

async function createApprovalRequest(env, ctx, opts) {
  const { tenantId, sessionId, userId, workspaceId, personUuid, toolName, toolArgs, toolCallId, riskLevel, rationale } = opts;
  const proposalId  = 'prop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now         = Math.floor(Date.now() / 1000);
  const expiresAt   = now + 3600;
  if (!env.DB) return proposalId;
  const argsStr = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs || {});
  if (!workspaceId) {
    throw new Error('WORKSPACE_CONTEXT_MISSING');
  }
  try {
    const uid = userId != null && String(userId).trim() !== '' ? String(userId).trim() : 'iam_agent';
    const summary = rationale || `Tool call requires approval: ${toolName}`;
    const inputJson = JSON.stringify({
      command_text: `${toolName}(${argsStr.slice(0, 500)})`,
      filled_template: argsStr,
      command_source: 'agent_generated',
      tool: toolName,
    });
    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
       (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
        risk_level, input_json, expires_at, status, approval_type, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      proposalId,
      tenantId,
      workspaceId,
      uid,
      sessionId || null,
      toolName,
      summary,
      riskLevel || 'medium',
      inputJson,
      expiresAt,
      'pending',
      'tool',
      now,
    ).run();
    scheduleRecordMcpToolExecution(env, ctx, {
      tenant_id: tenantId,
      workspace_id: workspaceId,
      user_id: userId,
      person_uuid: personUuid,
      session_id: sessionId,
      tool_name: toolName,
      input_json: argsStr.slice(0, 10000),
      output_json: '',
      success: false,
      status: 'awaiting_approval',
      requires_approval: 1,
      error_message: null,
    });
    scheduleAgentsamToolCallLog(env, ctx, {
      tenantId,
      sessionId,
      toolName,
      status: 'pending',
      durationMs: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      userId,
      workspaceId,
      errorMessage: null,
      inputSummary: argsStr.slice(0, 200),
    });
  } catch (e) { console.warn('[agent] createApprovalRequest:', e?.message); }
  return proposalId;
}

/** Pending row in agentsam_approval_queue blocks duplicate execution until approved/denied. */
async function checkApprovalGate(env, userId, toolName) {
  if (!env?.DB || !userId || !toolName) return null;
  return env.DB.prepare(
    `SELECT id, status, expires_at FROM agentsam_approval_queue
     WHERE user_id = ? AND tool_name = ? AND status = 'pending'
       AND expires_at > unixepoch()
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(userId, toolName)
    .first()
    .catch(() => null);
}

async function auditToolDecision(env, opts) {
  if (!env.DB) return;
  const tid = opts.tenantId != null && String(opts.tenantId).trim() !== '' ? String(opts.tenantId).trim() : '';
  if (!tid) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_hook_execution (id, tenant_id, actor_role_id, event_type, message, metadata_json)
       VALUES (?, ?, 'iam_agent', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), tid, opts.eventType, opts.message,
      JSON.stringify({ tool: opts.toolName, reason: opts.reason, risk: opts.riskLevel })
    ).run();
  } catch (_) {}
}

/** Dedup key pairs with UNIQUE(ref_table, ref_id) on agentsam_usage_events. */
function scheduleAgentsamUsageEventFromChat(env, ctx, opts) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const {
    tenantId,
    workspaceId,
    userId,
    conversationId,
    resolvedProvider,
    modelKey,
    inputTokens,
    outputTokens,
    costUsd,
    streamFailed,
    refId,
    routingArmId,
  } = opts;
  if (!tenantId || !workspaceId) return;
  ctx.waitUntil(
    (async () => {
      const cols = await pragmaTableInfo(env.DB, 'agentsam_usage_events');
      const arm = routingArmId != null ? String(routingArmId).trim().slice(0, 120) : '';
      const withArm = arm && cols.has('routing_arm_id');
      const mk = modelKey ?? 'unknown';
      const tin = Math.floor(Number(inputTokens) || 0);
      const tout = Math.floor(Number(outputTokens) || 0);
      let computedCost = Number(costUsd) || 0;
      if (!computedCost && (tin > 0 || tout > 0)) {
        computedCost = await estimateCostUsdFromCatalog(env.DB, mk, tin, tout);
      }
      const hasMk = cols.has('model_key');
      const hasTot = cols.has('total_tokens');
      const hasEv = cols.has('event_type');
      const midExtra = hasMk ? ', model_key' : '';
      const midExtraPh = hasMk ? ',?' : '';
      const tokExtra = hasTot ? ', total_tokens' : '';
      const tokExtraPh = hasTot ? ',?' : '';
      const postStatus = hasEv ? ', event_type' : '';
      const postStatusPh = hasEv ? ',?' : '';
      try {
        if (withArm) {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO agentsam_usage_events
              (id, tenant_id, workspace_id, user_id, session_id,
               agent_name, provider, model${midExtra}, tokens_in, tokens_out${tokExtra},
               cost_usd, status${postStatus}, ref_table, ref_id, routing_arm_id, created_at)
            VALUES
              ('ue_' || lower(hex(randomblob(8))),?,?,?,?,
               'iam_agent',?,?,?${midExtraPh},?,?,?${tokExtraPh},
               ?,?${postStatusPh}, 'agent_chat_sse', ?, ?, unixepoch())
          `).bind(
            tenantId,
            workspaceId,
            userId ?? null,
            conversationId ?? null,
            resolvedProvider ?? 'unknown',
            mk,
            ...(hasMk ? [mk] : []),
            tin,
            tout,
            ...(hasTot ? [tin + tout] : []),
            computedCost,
            streamFailed ? 'error' : 'ok',
            ...(hasEv ? ['agent_chat_sse'] : []),
            refId ?? 'na',
            arm,
          ).run();
        } else {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO agentsam_usage_events
              (id, tenant_id, workspace_id, user_id, session_id,
               agent_name, provider, model${midExtra}, tokens_in, tokens_out${tokExtra},
               cost_usd, status${postStatus}, ref_table, ref_id, created_at)
            VALUES
              ('ue_' || lower(hex(randomblob(8))),?,?,?,?,
               'iam_agent',?,?,?${midExtraPh},?,?,?${tokExtraPh},
               ?,?${postStatusPh}, 'agent_chat_sse', ?, unixepoch())
          `).bind(
            tenantId,
            workspaceId,
            userId ?? null,
            conversationId ?? null,
            resolvedProvider ?? 'unknown',
            mk,
            ...(hasMk ? [mk] : []),
            tin,
            tout,
            ...(hasTot ? [tin + tout] : []),
            computedCost,
            streamFailed ? 'error' : 'ok',
            ...(hasEv ? ['agent_chat_sse'] : []),
            refId ?? 'na',
          ).run();
        }
      } catch (_) {}
    })(),
  );
}

// ─── SSE Tool Loop ────────────────────────────────────────────────────────────

async function runAgentToolLoop(env, ctx, emit, params) {
  const {
    request,
    messages, tools, systemPrompt, modelKey,
    temperature, maxToolCalls,
    mode, modeConfig, userPolicy,
    sessionId, tenantId, userId,
    workspaceId,
    routingTaskType,
    qualityScore,
    mcpRuntimeContext,
    routingArmId: routingArmIdParam,
    thompsonModelKey: thompsonModelKeyParam,
  } = params;
  const routingWs = workspaceId != null ? String(workspaceId).trim() : '';
  const loopT0 = Date.now();
  const routingArmIdStr = routingArmIdParam != null ? String(routingArmIdParam).trim() : '';
  const thompsonMkStr = thompsonModelKeyParam != null ? String(thompsonModelKeyParam).trim() : '';

  const attributedRoutingArmId = () =>
    routingArmIdStr && thompsonMkStr && String(modelKey) === thompsonMkStr ? routingArmIdStr : null;

  const routeArmOutcome = (success) => {
    const aid = attributedRoutingArmId();
    if (aid) {
      ctx.waitUntil?.(
        applyRoutingArmUsageFeedback(env, {
          armId: aid,
          success,
          costUsd: 0,
          durationMs: Math.max(0, Date.now() - loopT0),
        }),
      );
    } else if (routingWs) {
      scheduleRoutingArmBanditUpdate(env, ctx, {
        taskType: routingTaskType || 'chat',
        mode: mode || 'ask',
        modelKey,
        workspaceId: routingWs,
        success,
        lastChainId: null,
      });
    }
  };

  const modeMax = Math.max(1, Math.floor(Number(maxToolCalls) || 15));
  const polMax = Math.floor(Number(userPolicy?.max_tool_chain_depth));
  const effectiveMaxToolCalls =
    Number.isFinite(polMax) && polMax > 0 ? Math.min(modeMax, polMax) : modeMax;

  const conversationMessages = [...messages];
  let toolCallsUsed = 0;
  const executedToolNames = [];
  let totalUsage    = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let turnCount     = 0;

  while (turnCount < 10) {
    turnCount++;
    const modelT0 = Date.now();
    let stream;
    let isWorkersAiStream = false;
    try {
      const grModel = await evaluateGuardrails(env, ctx, {
        applies_to: 'model',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        conversation_id: sessionId,
        model_key: modelKey,
      });
      if (grModel.blocked) {
        throw new Error(`GUARDRAIL_BLOCKED:${grModel.decision?.reason || 'model_blocked'}`);
      }
      // Provider resolved inside dispatchStream from agentsam_ai.api_platform (Workers AI → OAI-shaped SSE).
      stream = await dispatchStream(env, request, {
        modelKey,
        systemPrompt,
        messages: conversationMessages,
        tools,
        reasoningEffort: modeConfig?.gate_reasoning_effort || null,
        temperature,
        userId,
        tenantId,
        taskType: routingTaskType || 'chat',
        mode: mode || 'auto',
      });
      isWorkersAiStream = false;
    } catch (e) {
      if (String(e?.message || '') === OLLAMA_SKIP_MESSAGE) throw e;
      console.warn('[agent] model call failed:', e?.message ?? e);
      routeArmOutcome(false);
      emit('error', { message: 'Model call failed' });
      break;
    }

    const pendingToolCalls = [];
    let stopReason = null, turnUsage = null, containerId = null;
    const assistantContent = [];

    const extractWorkersAiLineToken = (obj) => {
      if (!obj || typeof obj !== 'object') return '';
      const c0 = Array.isArray(obj.choices) ? obj.choices[0] : null;
      const t =
        c0?.delta?.content ??
        c0?.text ??
        (typeof obj.response === 'string' ? obj.response : obj.response != null ? String(obj.response) : '') ??
        '';
      return typeof t === 'string' ? t : String(t || '');
    };

    const consumeWorkersAiText = async (readable) => {
      const reader = readable.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const t = line.trim();
          if (!t) continue;
          let piece = '';
          try {
            piece = extractWorkersAiLineToken(JSON.parse(t));
          } catch {
            piece = t;
          }
          if (!piece) continue;
          const last = assistantContent.findLast(b => b.type === 'text');
          if (last) last.text += piece;
          emit('text', { text: piece });
        }
      }
      const tail = buf.trim();
      if (tail) {
        let piece = '';
        try {
          piece = extractWorkersAiLineToken(JSON.parse(tail));
        } catch {
          piece = tail;
        }
        if (piece) {
          const last = assistantContent.findLast(b => b.type === 'text');
          if (last) last.text += piece;
          emit('text', { text: piece });
        }
      }
    };

    const consumeSseText = async (readable) => {
      const reader = readable.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n').map(l => l.trim()).filter(Boolean);
          const dataLines = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
          if (!dataLines.length) continue;
          const payload = dataLines.join('\n');
          if (payload === '[DONE]') return;
          try {
            const json = JSON.parse(payload);
            const text =
              json?.choices?.[0]?.delta?.content ??
              json?.choices?.[0]?.text ??
              json?.response ??
              json?.text ??
              '';
            if (text) {
              const last = assistantContent.findLast(b => b.type === 'text');
              if (last) last.text += text;
              emit('text', { text });
            }
          } catch {
            // ignore non-JSON SSE frames
          }
        }
      }
    };

    if (stream instanceof Response) {
      if (!stream.ok) {
        const detail = await stream.text().catch(() => '');
        console.warn('[agent] model stream HTTP error', stream.status);
        routeArmOutcome(false);
        emit('error', { message: 'Model stream failed' });
        break;
      }
      assistantContent.push({ type: 'text', text: '' });
      if (stream.body) await consumeSseText(stream.body);
      stopReason = 'end_turn';
    } else if (stream && typeof stream.getReader === 'function') {
      assistantContent.push({ type: 'text', text: '' });
      if (isWorkersAiStream) {
        await consumeWorkersAiText(stream);
      } else {
        await consumeSseText(stream);
      }
      stopReason = 'end_turn';
    } else {
      const ctor = stream && stream.constructor ? stream.constructor.name : typeof stream;
      console.warn('[agent] stream not iterable/reader/Response:', ctor, Object.prototype.toString.call(stream));
      const handleAnthropicChunk = (chunk) => {
        if (chunk.type === 'message_start') {
          if (chunk.message?.id) emit('id', { id: chunk.message.id });
          if (chunk.message?.container?.id) containerId = chunk.message.container.id;
        }
        if (chunk.type === 'message_stop' && chunk.message?.container?.id) {
          containerId = chunk.message.container.id;
        }
        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'thinking') emit('thinking_start', {});
          if (chunk.content_block?.type === 'tool_use') {
            pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '', _server: false });
            assistantContent.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
          }
          if (chunk.content_block?.type === 'server_tool_use') {
            pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '', _server: true });
            assistantContent.push({
              type: 'server_tool_use',
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              input: {},
            });
          }
          {
            const cb = chunk.content_block;
            const passthroughResults = new Set([
              'tool_search_tool_result',
              'code_execution_tool_result',
              'bash_code_execution_tool_result',
              'text_editor_code_execution_tool_result',
            ]);
            if (cb && passthroughResults.has(cb.type)) {
              assistantContent.push({ ...cb });
            }
          }
          if (chunk.content_block?.type === 'text') assistantContent.push({ type: 'text', text: '' });
        }
        if (chunk.type === 'content_block_delta') {
          const delta = chunk.delta;
          if (delta.type === 'text_delta') {
            const last = assistantContent.findLast(b => b.type === 'text');
            if (last) last.text += delta.text;
            emit('text', { text: delta.text });
          }
          if (delta.type === 'thinking_delta') emit('thinking', { text: delta.thinking });
          if (delta.type === 'input_json_delta') {
            const call = pendingToolCalls.findLast(c => !c._done);
            if (call) call._args += delta.partial_json;
          }
          if (delta.type === 'signature_delta') emit('signature', { signature: delta.signature });
        }
        if (chunk.type === 'content_block_stop') {
          const call = pendingToolCalls.findLast(c => !c._done);
          if (call) {
            call._done = true;
            try { call.input = JSON.parse(call._args || '{}'); } catch { call.input = {}; }
            const blk = assistantContent.find(
              (b) => (b.type === 'tool_use' || b.type === 'server_tool_use') && b.id === call.id,
            );
            if (blk) blk.input = call.input;
          }
        }
        if (chunk.type === 'message_delta') {
          if (chunk.usage) turnUsage = chunk.usage;
          if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
          if (chunk.delta?.container?.id) containerId = chunk.delta.container.id;
        }
      };
      const mergeTurnUsage = () => {
        if (!turnUsage) return;
        const u = aggregateAnthropicUsageTokens(turnUsage);
        totalUsage.input_tokens += u.input_tokens;
        totalUsage.output_tokens += u.output_tokens;
        totalUsage.cache_read_input_tokens += u.cache_read_input_tokens;
        totalUsage.cache_creation_input_tokens += u.cache_creation_input_tokens;
        turnUsage = null;
      };
      const drainAnthropicStream = async (s) => {
        stopReason = null;
        turnUsage = null;
        for await (const chunk of s) handleAnthropicChunk(chunk);
        mergeTurnUsage();
      };
      await drainAnthropicStream(stream);
      // Anthropic code execution may stop with pause_turn; continue via SDK (same model/tools/system as dispatchStream → chatWithAnthropic).
      const PAUSE_TURN_MAX = 8;
      let pauseIterations = 0;
      while (stopReason === 'pause_turn' && containerId && pauseIterations < PAUSE_TURN_MAX) {
        pauseIterations += 1;
        console.log(`[agent] pause_turn continuation ${pauseIterations} container=${containerId}`);
        emit('pause_turn', { container_id: containerId, iteration: pauseIterations });
        let continueMessages;
        try {
          continueMessages = [...conversationMessages, { role: 'assistant', content: JSON.parse(JSON.stringify(assistantContent)) }];
        } catch {
          continueMessages = [...conversationMessages, { role: 'assistant', content: assistantContent }];
        }
        pendingToolCalls.length = 0;
        let nextStream;
        try {
          nextStream = await dispatchStream(env, request, {
            modelKey,
            systemPrompt,
            messages: continueMessages,
            tools,
            reasoningEffort: modeConfig?.gate_reasoning_effort || null,
            temperature,
            userId,
            tenantId,
            taskType: routingTaskType || 'chat',
            mode: mode || 'auto',
            anthropicContainerId: containerId,
          });
        } catch (e) {
          console.warn('[agent] pause_turn continuation request failed:', e?.message ?? e);
          break;
        }
        if (!nextStream || typeof nextStream[Symbol.asyncIterator] !== 'function') {
          console.warn('[agent] pause_turn: continuation stream is not async-iterable');
          break;
        }
        await drainAnthropicStream(nextStream);
      }
      if (pauseIterations >= PAUSE_TURN_MAX && stopReason === 'pause_turn') {
        console.warn('[agent] pause_turn max iterations reached, forcing end_turn');
        stopReason = 'end_turn';
      }
    }

    if (turnUsage) {
      const u = aggregateAnthropicUsageTokens(turnUsage);
      totalUsage.input_tokens += u.input_tokens;
      totalUsage.output_tokens += u.output_tokens;
      totalUsage.cache_read_input_tokens += u.cache_read_input_tokens;
      totalUsage.cache_creation_input_tokens += u.cache_creation_input_tokens;
    }

    conversationMessages.push({ role: 'assistant', content: assistantContent });
    const clientToolCalls = pendingToolCalls.filter((c) => !c._server);
    if (!clientToolCalls.length || stopReason === 'end_turn') {
      if (routingWs) {
        const qs = Number(qualityScore);
        if (Number.isFinite(qs)) {
          scheduleRoutingArmQualityUpdate(env, ctx, {
            taskType: routingTaskType || 'chat',
            mode: mode || 'ask',
            modelKey,
            workspaceId: routingWs,
            qualityScore: qs,
          });
        }
      }
      break;
    }

    const toolResults = [];
    let previousToolChainId = null;
    for (const call of clientToolCalls) {
      if (toolCallsUsed >= effectiveMaxToolCalls) {
        emit('tool_blocked', { tool: call.name, reason: 'max_tool_calls_reached' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: 'Tool call limit reached.' });
        continue;
      }
      const validation = await validateToolCall(env, mode, call.name, mcpRuntimeContext, userPolicy);
      if (!validation.allowed) {
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: validation.mcpToolId ?? null,
          input_json: JSON.stringify(call.input || {}),
          success: false,
          error_message: validation.reason,
          duration_ms: 0,
          status: 'error',
        });
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId,
          sessionId,
          toolName: call.name,
          status: 'blocked',
          durationMs: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          userId,
          workspaceId,
          errorMessage: validation.reason,
          inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
        });
        await auditToolDecision(env, { tenantId, toolName: call.name, eventType: 'tool_blocked', message: `Blocked: ${call.name} — ${validation.reason}`, riskLevel: 'blocked', reason: validation.reason });
        emit('tool_blocked', { tool: call.name, reason: validation.reason });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Tool not available in ${mode} mode: ${validation.reason}` });
        continue;
      }
      const grTool = await evaluateGuardrails(env, ctx, {
        applies_to: 'mcp_tool',
        tenant_id: tenantId,
        workspace_id: workspaceId,
        user_id: userId,
        session_id: sessionId,
        conversation_id: sessionId,
        tool_name: call.name,
        tool_input: call.input,
      });
      if (grTool.blocked) {
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: validation.mcpToolId ?? null,
          input_json: JSON.stringify(call.input || {}),
          success: false,
          error_message: grTool.decision?.reason || 'guardrail_blocked',
          duration_ms: 0,
          status: 'blocked',
        });
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId,
          sessionId,
          toolName: call.name,
          status: 'blocked',
          durationMs: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          userId,
          workspaceId,
          errorMessage: grTool.decision?.reason || 'guardrail_blocked',
          inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
        });
        await auditToolDecision(env, {
          tenantId,
          toolName: call.name,
          eventType: 'tool_blocked',
          message: `Guardrail blocked: ${call.name}`,
          riskLevel: 'blocked',
          reason: grTool.decision?.reason || 'guardrail',
        });
        emit('tool_blocked', { tool: call.name, reason: grTool.decision?.reason || 'guardrail' });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: grTool.decision?.reason || 'Blocked by guardrail.',
          is_error: true,
        });
        continue;
      }
      const queuePending = userId ? await checkApprovalGate(env, userId, call.name) : null;
      if (queuePending?.id) {
        scheduleRecordMcpToolExecution(env, ctx, {
          tenant_id: tenantId,
          workspace_id: workspaceId,
          user_id: userId,
          session_id: sessionId,
          tool_name: call.name,
          tool_id: validation.mcpToolId ?? null,
          input_json: JSON.stringify(call.input || {}),
          success: false,
          error_message: 'duplicate_pending_approval',
          duration_ms: 0,
          status: 'blocked',
        });
        scheduleAgentsamToolCallLog(env, ctx, {
          tenantId,
          sessionId,
          toolName: call.name,
          status: 'pending',
          durationMs: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          userId,
          workspaceId,
          errorMessage: 'duplicate_pending_approval',
          inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
        });
        emit('approval_required', {
          approval_id: queuePending.id,
          tool_name: call.name,
          message: 'This tool already has a pending approval.',
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: `Awaiting approval (approval_id: ${queuePending.id}).`,
        });
        continue;
      }
      if (needsApproval(validation, modeConfig, userPolicy)) {
        const proposalId = await createApprovalRequest(env, ctx, {
          tenantId,
          sessionId,
          userId,
          workspaceId,
          personUuid: mcpRuntimeContext.personUuid,
          toolName: call.name,
          toolArgs: call.input,
          toolCallId: call.id,
          riskLevel: validation.riskLevel,
          rationale: `Agent requested ${call.name} (${validation.riskLevel} risk)`,
        });
        notifySam(env, { subject: `Approval required: ${call.name}`, body: `Tool: ${call.name}\nRisk: ${validation.riskLevel}\nArgs: ${JSON.stringify(call.input||{}).slice(0,500)}\n\nApprove: ${(env.IAM_ORIGIN||'').replace(/\/$/,'')}/dashboard/overview?proposal=${proposalId}`, category: 'approval' }).catch(() => {});
        emit('approval_required', { proposal_id: proposalId, tool_name: call.name, tool_args: call.input, risk_level: validation.riskLevel, message: 'This action requires your approval.' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Awaiting approval (proposal_id: ${proposalId}).` });
        continue;
      }
      toolCallsUsed++;
      executedToolNames.push(call.name);
      emit('tool_call', { tool: call.name, args: call.input });
      await auditToolDecision(env, { tenantId, toolName: call.name, eventType: 'tool_executed', message: `Executing: ${call.name}`, riskLevel: validation.riskLevel, reason: 'allowed' });
      const toolT0 = Date.now();
      const toolStartNs = toolT0 * 1_000_000;
      let toolOutput = '';
      let execErr = null;
      emit('tool_start', {
        tool_name: call.name,
        input_preview: JSON.stringify(call.input || {}).slice(0, 200),
      });
      let toolRows = null;
      try {
        const execResult = await dispatchToolCall(env, call.name, call.input, {
          sessionId,
          tenantId,
          userId,
          workspaceId,
          personUuid: mcpRuntimeContext.personUuid,
          isSuperadmin: mcpRuntimeContext.isSuperadmin,
          request,
        });
        if (execResult && typeof execResult === 'object' && Array.isArray(execResult.rows)) {
          toolRows = execResult.rows;
        }
        toolOutput = typeof execResult === 'string' ? execResult : JSON.stringify(execResult);
      } catch (e) {
        execErr = e;
        toolOutput = `Tool execution failed: ${e.message}`;
        console.warn('[agent] tool_error', call.name, e?.message ?? e);
        emit('tool_error', { tool: call.name, error: 'Tool execution failed' });
      }
      const toolDurMs = Date.now() - toolT0;
      emit('tool_output', { tool_name: call.name, chunk: String(toolOutput || '').slice(0, 2000) });
      emit('tool_done', {
        tool_name: call.name,
        status: execErr ? 'error' : 'ok',
        duration_ms: toolDurMs,
        rows: toolRows ?? null,
      });
      scheduleAgentsamToolCallLog(env, ctx, {
        tenantId,
        sessionId,
        toolName: call.name,
        status: execErr ? 'error' : 'success',
        durationMs: toolDurMs,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        userId,
        workspaceId,
        errorMessage: execErr ? String(execErr.message || execErr).slice(0, 4000) : null,
        inputSummary: JSON.stringify(call.input || {}).slice(0, 200),
      });
      const mcpExecId = scheduleRecordMcpToolExecution(env, ctx, {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        session_id: sessionId,
        tool_name: call.name,
        tool_id: validation.mcpToolId ?? null,
        input_json: JSON.stringify(call.input || {}),
        output_json: toolOutput.slice(0, 50000),
        success: !execErr,
        error_message: execErr ? String(execErr.message || execErr).slice(0, 4000) : null,
        duration_ms: toolDurMs,
        user_id: userId,
        invoked_by: userId || 'iam_agent',
        status: execErr ? 'error' : 'completed',
      });
      const canonicalToolChainUserId = await resolveCanonicalUserId(userId, env);
      previousToolChainId = await fireForgetAgentToolChainRow(env, {
        toolName: call.name,
        agentSessionId: sessionId,
        workspaceId,
        userId: canonicalToolChainUserId,
        error: execErr,
        costUsd: 0,
        mcpToolCallId: mcpExecId,
        durationMs: toolDurMs,
        terminalSessionId: null,
        tenantId,
        parentChainId: previousToolChainId,
        toolInputJson: JSON.stringify(call.input || {}),
        workflowRunId: null,
        executionStepId: null,
        ctx,
      });
      recordMcpToolOtlpSpan(env, ctx, {
        tenant_id: tenantId,
        workspace_id: workspaceId,
        toolName: call.name,
        start_time_unix_nano: toolStartNs,
        end_time_unix_nano: Date.now() * 1_000_000,
        execErr,
      });
      emit('tool_result', { tool: call.name, output: toolOutput.slice(0, 2000) });
      const tr = { type: 'tool_result', tool_use_id: call.id, content: toolOutput };
      if (execErr) tr.is_error = true;
      toolResults.push(tr);
    }
    if (toolResults.length) conversationMessages.push({ role: 'user', content: toolResults });

    if (routingWs) {
      if (!attributedRoutingArmId()) {
        scheduleRoutingArmBanditUpdate(env, ctx, {
          taskType: routingTaskType || 'chat',
          mode: mode || 'ask',
          modelKey,
          workspaceId: routingWs,
          success: true,
          lastChainId: previousToolChainId,
        });
      }
      const qs = Number(qualityScore);
      if (Number.isFinite(qs)) {
        scheduleRoutingArmQualityUpdate(env, ctx, {
          taskType: routingTaskType || 'chat',
          mode: mode || 'ask',
          modelKey,
          workspaceId: routingWs,
          qualityScore: qs,
        });
      }
    }

    if (stopReason === 'end_turn') break;
  }

  if (totalUsage.input_tokens || totalUsage.output_tokens) {
    const aid = attributedRoutingArmId();
    ctx.waitUntil?.(
      (async () => {
        const out = await writeTelemetry(
          env,
          {
            sessionId,
            tenantId,
            workspaceId: routingWs || undefined,
            provider: 'anthropic',
            model: modelKey,
            inputTokens: totalUsage.input_tokens,
            outputTokens: totalUsage.output_tokens,
            cacheReadTokens: totalUsage.cache_read_input_tokens,
            cacheWriteTokens: totalUsage.cache_creation_input_tokens,
            toolCallCount: toolCallsUsed,
            success: true,
            routingArmId: aid,
            latencyMs: Date.now() - loopT0,
          },
          null,
        );
        if (aid) {
          await applyRoutingArmUsageFeedback(env, {
            armId: aid,
            success: true,
            costUsd: Number(out?.estimatedCostUsd) || 0,
            durationMs: Date.now() - loopT0,
          });
        }
      })(),
    );
  }

  emit('done', { tool_calls_used: toolCallsUsed, turns: turnCount });
  return {
    totalUsage,
    toolCallsUsed,
    executedToolNames,
    modelKey,
  };
}

async function executeWorkflowAndStream(env, workflowKey, message, actor, workspaceId, ctx) {
  void ctx;
  const uid = actor?.id ?? actor?.user_id ?? null;
  let tid =
    actor?.tenant_id != null && String(actor.tenant_id).trim() !== ''
      ? String(actor.tenant_id).trim()
      : null;
  if (!tid && uid) tid = await fetchAuthUserTenantId(env, uid);
  const authLike = {
    id: uid,
    tenant_id: tid,
    email: actor?.email ?? null,
  };
  const { executeWorkflowAndStream: workflowGraphSse } = await import('../core/workflow-executor.js');
  return new Response(
    new ReadableStream({
      async start(controller) {
        await workflowGraphSse(env, workflowKey, message, authLike, workspaceId, controller);
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}

/** Wildcard glob match for MCP panel tool allowlists (e.g. `d1_*`, `*`). */
export function mcpPanelToolMatchesGlob(toolName, pattern) {
  const n = String(toolName || '').trim();
  const p = String(pattern || '').trim();
  if (!n || !p) return false;
  if (p === '*' || p === '**') return true;
  const esc = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp(`^${esc}$`, 'i').test(n);
  } catch {
    return false;
  }
}

function filterToolsForMcpPanelGlobs(tools, globs) {
  if (!Array.isArray(tools) || !tools.length) return [];
  if (!Array.isArray(globs) || !globs.length) return tools;
  const list = globs.map((g) => String(g || '').trim()).filter(Boolean);
  if (!list.length) return tools;
  return tools.filter((t) => list.some((g) => mcpPanelToolMatchesGlob(t?.name, g)));
}

/**
 * MCP dashboard subagent chat — reuses {@link runAgentToolLoop} / dispatchStream (same path as agent chat).
 * Called only from server-side routes with a trusted panel payload (not client-spoofed overrides).
 *
 * @param {Record<string, unknown>} panel
 */
export async function mcpPanelAgentChatSse(env, request, ctx, panel) {
  const tenantId = panel.tenantId != null ? String(panel.tenantId).trim() : '';
  const userId = panel.userId != null ? String(panel.userId).trim() : '';
  const workspaceId = panel.workspaceId != null ? String(panel.workspaceId).trim() : '';
  const personUuid =
    panel.personUuid != null && String(panel.personUuid).trim() !== ''
      ? String(panel.personUuid).trim()
      : null;
  const sessionPkId = panel.sessionPkId != null ? String(panel.sessionPkId).trim() : '';
  const slug = panel.slug != null ? String(panel.slug).trim() : '';
  const profile = panel.profile && typeof panel.profile === 'object' ? panel.profile : {};
  const modelKey = panel.modelKey != null ? String(panel.modelKey).trim() : '';
  /** @type {{ role: string, content: string }[]} */
  const messages = Array.isArray(panel.messages) ? panel.messages : [];
  let toolGlobs = [];
  try {
    const raw = profile.allowed_tool_globs;
    if (typeof raw === 'string') {
      const j = JSON.parse(raw || '[]');
      toolGlobs = Array.isArray(j) ? j : [];
    } else if (Array.isArray(raw)) toolGlobs = raw;
  } catch {
    toolGlobs = [];
  }
  if (Array.isArray(panel.toolGlobsOverride) && panel.toolGlobsOverride.length) {
    toolGlobs = panel.toolGlobsOverride.map((x) => String(x || '').trim()).filter(Boolean);
  }

  if (!tenantId || !userId || !workspaceId || !sessionPkId || !slug || !modelKey) {
    return jsonResponse({ error: 'mcp_panel_chat: missing tenant/user/workspace/session/model' }, 400);
  }
  if (!messages.length) return jsonResponse({ error: 'messages required' }, 400);

  const requestedMode = 'agent';
  const [modeConfig, userPolicy] = await Promise.all([
    loadModeConfig(env, requestedMode),
    loadAgentSamUserPolicy(env, userId, workspaceId),
  ]);

  const effectiveMaxTools = Math.max(1, Math.min(200, Number(modeConfig.max_tool_calls || 20) || 20));

  const { tools: dbToolsRaw } = await loadToolsForRequest(env, requestedMode, 'question', {
    limit: effectiveMaxTools,
    includeSchemas: true,
    userId,
    workspaceId,
    tenantId,
    personUuid,
  });
  let tools = dbToolsRaw.map((t) => {
    const raw = t.input_schema && typeof t.input_schema === 'object' ? t.input_schema : {};
    return {
      name: t.name,
      description: t.description || t.name,
      input_schema: Object.assign({ type: 'object', properties: {} }, raw, { type: 'object' }),
    };
  });
  tools = filterToolsForMcpPanelGlobs(tools, toolGlobs);

  const sysInst = String(profile.instructions_markdown || '').trim();
  const systemPrompt =
    sysInst +
    '\n\n## Current Session\n' +
    `Tenant: ${tenantId}\n` +
    `Workspace: ${workspaceId}\n` +
    `Date: ${new Date().toISOString()}\n`;

  const mcpRuntimeContext = {
    userId,
    tenantId,
    workspaceId,
    personUuid,
    sessionId: sessionPkId,
    isSuperadmin: false,
  };

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const emit = (type, payload) => {
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`));
    } catch (_) {}
  };

  emit('context', {
    intent: 'mcp_panel',
    mode: requestedMode,
    model: modelKey,
    tool_count: tools.length,
    slug,
  });

  const MCP_CHAT_LOOP_MS = 300000;

  ;(async () => {
    let assistantAccum = '';
    try {
      let textEmitted = 0;
      const emitWrapped = (type, payload) => {
        if (type === 'text' && payload?.text) {
          textEmitted += String(payload.text).length;
          assistantAccum += String(payload.text);
        }
        emit(type, payload);
      };

      const lastLoopStats = await withTimeout(
        runAgentToolLoop(env, ctx, emitWrapped, {
          request,
          messages,
          tools,
          systemPrompt,
          modelKey,
          temperature: modeConfig.temperature || 0.7,
          maxToolCalls: effectiveMaxTools,
          mode: requestedMode,
          modeConfig,
          userPolicy,
          sessionId: sessionPkId,
          tenantId,
          userId,
          workspaceId,
          routingTaskType: 'mcp_panel',
          qualityScore: 1,
          mcpRuntimeContext,
          routingArmId: null,
          thompsonModelKey: null,
        }),
        MCP_CHAT_LOOP_MS,
      );

      const toolCallsUsed = Number(lastLoopStats?.toolCallsUsed) || 0;
      const tokensIn = Number(lastLoopStats?.totalUsage?.input_tokens) || 0;
      const tokensOut = Number(lastLoopStats?.totalUsage?.output_tokens) || 0;

      if (textEmitted <= 0) {
        emit('error', { message: 'empty_stream' });
      }

      ctx.waitUntil?.(
        (async () => {
          try {
            if (!env.DB) return;
            const nextMsgs = [
              ...messages.map((m) => ({
                role: String(m?.role || ''),
                content: String(m?.content || ''),
              })),
              ...(assistantAccum ? [{ role: 'assistant', content: assistantAccum }] : []),
            ].filter((m) => m.content && (m.role === 'user' || m.role === 'assistant'));
            const capped = nextMsgs.slice(-40);

            await env.DB.prepare(
              `UPDATE mcp_agent_sessions SET
                 status = 'idle',
                 messages_json = ?,
                 cost_usd = COALESCE(cost_usd, 0) + ?,
                 tool_calls_count = COALESCE(tool_calls_count, 0) + ?,
                 last_activity = datetime('now'),
                 updated_at = unixepoch(),
                 current_task = NULL
               WHERE id = ? AND tenant_id = ?`,
            )
              .bind(
                JSON.stringify(capped),
                0,
                toolCallsUsed,
                sessionPkId,
                tenantId,
              )
              .run();
          } catch (e) {
            console.warn('[mcp_panel_chat] session update failed:', e?.message ?? e);
          }
        })(),
      );

      void tokensIn;
      void tokensOut;
    } catch (e) {
      console.warn('[mcp_panel_chat]', e?.message ?? e);
      emit('error', { message: String(e?.message || e || 'chat_failed') });
      ctx.waitUntil?.(
        (async () => {
          try {
            if (!env.DB) return;
            await env.DB.prepare(
              `UPDATE mcp_agent_sessions SET status = 'idle', updated_at = unixepoch(), last_activity = datetime('now') WHERE id = ? AND tenant_id = ?`,
            )
              .bind(sessionPkId, tenantId)
              .run();
          } catch (_) {}
        })(),
      );
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ─── SSE Chat Handler ─────────────────────────────────────────────────────────

export async function agentChatSseHandler(env, request, ctx, opts = {}) {
  const { ingestBypass, identity } = opts;
  const contentType = request.headers.get('content-type') || '';
  let body = {};

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    const files = formData.getAll('files');
    if (files.length) body.files = files;
  } else {
    body = await request.json().catch(() => ({}));
  }

  /** @type {{ user_id: string, tenant_id: string, workspace_id: string, session_id?: string|null }} */
  let session;
  if (ingestBypass) {
    const tid = body.tenantId ?? body.tenant_id;
    const wid = body.workspaceId ?? body.workspace_id;
    const uid = body.userId ?? body.user_id;
    if (!tid || !wid || !uid) {
      return jsonResponse({ error: 'ingest requires tenantId, workspaceId, userId' }, 400);
    }
    session = {
      user_id: uid,
      tenant_id: tid,
      workspace_id: wid,
      session_id: body.sessionId ?? body.session_id ?? null,
    };
  } else {
    if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
    if (!identity.workspaceId) {
      return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING', redirect: '/onboarding' }, 400);
    }
    session = {
      user_id: identity.userId,
      tenant_id: identity.tenantId,
      workspace_id: identity.workspaceId,
      session_id: body.sessionId ?? body.session_id ?? null,
    };
  }

  let message = (body.message || '').trim();
  if (!message) return jsonResponse({ error: 'message required' }, 400);

  const resolvedWorkspaceId =
    session?.workspace_id != null && String(session.workspace_id).trim() !== ''
      ? String(session.workspace_id).trim()
      : body.workspace_id != null && String(body.workspace_id).trim() !== ''
        ? String(body.workspace_id).trim()
        : null;

  const cmdResult = await resolveAgentCommand(env, {
    message: body.message,
    userId: session?.user_id,
    workspaceId: resolvedWorkspaceId,
    tenantId: session?.tenant_id ?? null,
    mode: body.mode || 'agent',
  });

  if (cmdResult.resolved) {
    if (cmdResult.blocked) {
      return jsonResponse(
        {
          error: cmdResult.blockReason,
          command: cmdResult.mappedCommand,
        },
        403,
      );
    }
    if (cmdResult.requiresConfirmation) {
      return jsonResponse(
        {
          requires_confirmation: true,
          command: cmdResult.mappedCommand,
          risk_level: cmdResult.riskLevel,
          message: 'Confirm execution of: ' + cmdResult.mappedCommand,
        },
        202,
      );
    }
    body.message = cmdResult.mappedCommand;
    body._resolved_command_id = cmdResult.command?.id || null;
    body._resolved_command_slug = cmdResult.command?.slug || null;
  }

  message = (body.message || '').trim();

  const sessionId     = body.conversationId || body.session_id || body.sessionId || null;
  const requestedMode = String(body.mode || 'auto').toLowerCase().trim() || 'auto';

  const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
  const authUser = ingestBypass ? null : await getAuthUser(request, env).catch(() => null);

  let tenantId =
    (session?.tenant_id != null && String(session.tenant_id).trim() !== ''
      ? String(session.tenant_id).trim()
      : null) ||
    (actorCtx?.tenantId != null && String(actorCtx.tenantId).trim() !== ''
      ? String(actorCtx.tenantId).trim()
      : null);
  if (!tenantId && session?.user_id) {
    tenantId = await fetchAuthUserTenantId(env, session.user_id);
  }
  const userId =
    session?.user_id ||
    (ingestBypass ? null : identity?.userId) ||
    actorCtx?.userId ||
    null;
  const wsCache = {};
  const bootstrapWorkspaceId = userId ? await resolveBootstrapWorkspaceIdForAgentApi(env, request, userId, wsCache) : null;
  let workspaceId =
    String(session?.workspace_id || '').trim() ||
    String(body.workspace_id || '').trim() ||
    (actorCtx?.workspaceId != null && String(actorCtx.workspaceId).trim() !== ''
      ? String(actorCtx.workspaceId).trim()
      : '') ||
    '';
  if (!workspaceId) workspaceId = String(bootstrapWorkspaceId || '').trim();
  if (!workspaceId) return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);

  const [modeConfig, userPolicy, agentMeta] = await Promise.all([
    loadModeConfig(env, requestedMode),
    loadAgentSamUserPolicy(env, userId, workspaceId),
    body.agentId ? getAgentMetadata(env, body.agentId) : Promise.resolve(null),
  ]);

  kickoffModelTierMigration(env, ctx);

  const gate = await gateRewriteAndClassify(env, modeConfig, message, tenantId);
  const intentSlug = String(gate.intent || 'auto').toLowerCase().trim() || 'auto';
  const intentResult = await classifyIntent(env, message);

  const workflowMatch = await resolveWorkflowForMessage(env, intentResult.taskType, message, workspaceId);
  if (workflowMatch) {
    const actor = authUser || { id: userId, tenant_id: tenantId, email: null };
    return executeWorkflowAndStream(env, workflowMatch.workflow_key, message, actor, workspaceId, ctx);
  }

  const intentPattern = await loadIntentPattern(env, intentSlug);

  const promptRouteRow = await resolveAgentsamPromptRoute(env, tenantId, requestedMode, intentSlug);
  let effectiveMaxTools = Math.max(1, Math.min(200, Number(modeConfig.max_tool_calls || 20) || 20));
  if (promptRouteRow?.max_tools != null && Number(promptRouteRow.max_tools) > 0) {
    effectiveMaxTools = Math.min(effectiveMaxTools, Number(promptRouteRow.max_tools));
  }
  const skipRagFromRoute = Number(promptRouteRow?.include_rag) === 0;

  const personUuid =
    (actorCtx?.personUuid != null && String(actorCtx.personUuid).trim() !== ''
      ? String(actorCtx.personUuid).trim()
      : null) ||
    (ingestBypass ? null : identity?.personUuid != null && String(identity.personUuid).trim() !== ''
      ? String(identity.personUuid).trim()
      : null);

  const mcpRuntimeContext = {
    userId,
    tenantId,
    workspaceId,
    personUuid,
    sessionId,
    isSuperadmin: !ingestBypass && authUserIsSuperadmin(authUser),
  };

  const { tools: dbToolsRaw } = await loadToolsForRequest(env, requestedMode, intentSlug, {
    limit: effectiveMaxTools,
    includeSchemas: true,
    userId,
    workspaceId,
    tenantId,
    personUuid: mcpRuntimeContext.personUuid,
  });
  const tcList = parseJsonSafe(promptRouteRow?.tool_categories, null);
  let dbTools = dbToolsRaw;
  if (Array.isArray(tcList) && tcList.length) {
    const allowCat = new Set(tcList.map((x) => String(x || '').trim()).filter(Boolean));
    dbTools = dbToolsRaw.filter((t) => allowCat.has(String(t.tool_category || '').trim()));
  }
  // Tool list is shared across providers; Anthropic adds BM25 tool_search + defer_loading in chatWithAnthropic().
  let tools = dbTools.map(t => {
    const raw = t.input_schema && typeof t.input_schema === 'object'
      ? t.input_schema : {};
    return {
      name: t.name,
      description: t.description || t.name,
      input_schema: Object.assign(
        { type: 'object', properties: {} },
        raw,
        { type: 'object' },
      ),
    };
  });
  const toolsFromPattern = parseJsonSafe(intentPattern?.tools_json, null);
  if (Array.isArray(toolsFromPattern) && toolsFromPattern.length) {
    const allow = new Set(toolsFromPattern.map((x) => String(x || '').trim()).filter(Boolean));
    tools = tools.filter((t) => allow.has(t.name));
  }

  const confidence = Number(gate.confidence || 0);
  const threshold = Number(modeConfig?.escalation_threshold);
  const escalationThreshold = Number.isFinite(threshold) ? threshold : 0;

  const requireTools = tools.length > 0;
  const {
    row: requestedCatalogRow,
    rawRequestedKey,
    rawRequestedId,
  } = await resolveAiModelFromRequest(env, body, tenantId);

  let explicitRow = null;
  let blockedToolsForRequested = false;
  if (requestedCatalogRow?.model_key) {
    let er = requestedCatalogRow;
    if (requireTools && Number(er.supports_tools) !== 1) {
      blockedToolsForRequested = true;
      console.warn('[agent] model_override_blocked_tools', { model_key: er.model_key });
      er = null;
    }
    explicitRow = er;
  }

  if (!explicitRow && promptRouteRow?.preferred_model) {
    const pref = String(promptRouteRow.preferred_model).trim();
    if (pref) {
      const pr = await resolveAgentsamAiRowByModelKey(env, tenantId, pref);
      if (pr?.model_key) {
        let er = pr;
        if (requireTools && Number(er.supports_tools) !== 1) {
          er = null;
        }
        explicitRow = er;
      }
    }
  }

  const isAutoModel = !explicitRow;

  let resolvedRoutingTaskType = resolveRoutingTaskType({
    intentSlug,
    requireTools,
    body,
  });
  const bodyPinsRouting = (() => {
    const b = body && typeof body === 'object' ? body : {};
    return (
      b.debug === true ||
      String(b.mode || '').toLowerCase() === 'debug' ||
      b.subagent === true ||
      (b.subagent_profile_id != null && String(b.subagent_profile_id).trim() !== '') ||
      b.workflow_step === true ||
      b.workflow_run_id != null ||
      b.terminal_session_id != null ||
      b.pty_session_id != null ||
      b.intent_classification_only === true ||
      b.rag_only === true ||
      b.memory_search_only === true ||
      b.skill_pick_only === true
    );
  })();
  if (!requireTools && !bodyPinsRouting && intentResult?.taskType) {
    resolvedRoutingTaskType = String(intentResult.taskType).trim() || resolvedRoutingTaskType;
  }

  let routingPick = null;
  try {
    routingPick = await getDefaultModelForTask(env, {
      taskKey: resolvedRoutingTaskType,
      tenantId,
      mode: requestedMode,
      workspaceId,
      toolRequired: requireTools,
      routeKey:
        body.route_key != null && String(body.route_key).trim() !== ''
          ? String(body.route_key).trim()
          : null,
    });
  } catch (_) {
    routingPick = null;
  }
  const thompsonPick = await selectThompsonArm(
    env,
    intentResult.taskType,
    intentResult.mode || requestedMode,
    workspaceId,
  );
  if (thompsonPick && (!routingPick || routingPick.source !== 'thompson')) {
    routingPick = thompsonPick;
  }
  const thompsonRow =
    routingPick?.source === 'thompson' && routingPick?.modelId
      ? await resolveAiModelRowById(env, routingPick.modelId, tenantId)
      : null;

  const primaryRow = await resolveAiModelRowById(env, modeConfig?.model_preference ?? null, tenantId);
  const escalationRow = await resolveAiModelRowById(env, modeConfig?.escalation_model ?? null, tenantId);
  const reservedForFallback = [
    thompsonRow?.model_key,
    primaryRow?.model_key,
    escalationRow?.model_key,
    routingPick?.fallbackModelKey,
  ].filter(Boolean);
  let explicitArmFallbackRow = null;
  if (routingPick?.fallbackModelKey) {
    explicitArmFallbackRow = await resolveAgentsamAiRowByModelKey(
      env,
      tenantId,
      routingPick.fallbackModelKey,
    );
  }

  const lastResort = await loadChatRoutingFallbackRows(env, {
    tenantId,
    workspaceId,
    mode: requestedMode,
    excludeModelKeys: reservedForFallback,
    requireTools,
  });
  let poolRows = dedupeModelsByKey(
    [
      ...(thompsonRow ? [thompsonRow] : []),
      primaryRow,
      escalationRow,
      ...(explicitArmFallbackRow ? [explicitArmFallbackRow] : []),
      ...(lastResort || []),
    ].filter(Boolean),
  );
  poolRows = filterChainToolPolicy(poolRows, requireTools);

  const externalNonGraniteExists = poolRows.some(
    (r) => rowIsExternalProvider(r) && !rowIsGranite(r),
  );

  let chainRows;
  if (explicitRow) {
    chainRows = dedupeModelsByKey([
      explicitRow,
      ...poolRows.filter((r) => r.model_key !== explicitRow.model_key),
    ]);
    chainRows = filterChainToolPolicy(chainRows, requireTools);
  } else {
    chainRows = filterGraniteAutoChain(poolRows, externalNonGraniteExists);
  }

  const chainRowsBeforeTierFilter = chainRows;
  chainRows = await filterWorkspaceModelTierPool(env, workspaceId, chainRows);

  const fallbackModelKeys = chainRows.map((r) => r.model_key).filter(Boolean);
  if (!fallbackModelKeys.length) {
    /** Structured debug for Architect when tier/policy empties the chain before 503. */
    let allowedTiers = [];
    try {
      if (env?.DB && workspaceId) {
        const { results } = await env.DB.prepare(
          `SELECT cost_tier, tier_level FROM agentsam_model_tier
           WHERE workspace_id = ? AND is_active = 1
           ORDER BY tier_level ASC`,
        )
          .bind(String(workspaceId).trim())
          .all();
        allowedTiers = (results || []).map((r) => r?.cost_tier).filter(Boolean);
      }
    } catch (_) {
      /* best-effort */
    }
    const tierMeta = (rows) =>
      (rows || []).map((r) => ({
        key: r?.model_key ?? null,
        tier: modelCostTierFromRow(r),
        provider: r?.provider ?? null,
        supports_tools: r?.supports_tools,
      }));
    console.warn(
      '[agent] tier_empty_chain',
      JSON.stringify({
        workspace_id: workspaceId,
        intent: intentSlug,
        mode: requestedMode,
        require_tools: requireTools,
        is_auto_model: isAutoModel,
        blocked_tools_for_requested: blockedToolsForRequested,
        external_non_granite_exists: externalNonGraniteExists,
        pool_row_count: poolRows.length,
        pool_models: tierMeta(poolRows),
        chain_before_tier_count: chainRowsBeforeTierFilter.length,
        chain_before_tier: tierMeta(chainRowsBeforeTierFilter),
        allowed_workspace_tiers: allowedTiers,
        empty_reason:
          chainRowsBeforeTierFilter.length === 0
            ? 'chain_empty_before_tier_filter'
            : 'tier_filter_removed_all_candidates',
      }),
    );
    return jsonResponse({ error: 'All providers exhausted', tried: [] }, 503);
  }

  console.log(
    '[agent] routing_model',
    JSON.stringify({
      requested_model: rawRequestedKey || rawRequestedId || null,
      resolved_requested: explicitRow?.model_key ?? null,
      is_auto: isAutoModel,
      chain: chainRows.map((r) => r.model_key),
      tool_required: requireTools,
      blocked_granite_auto: isAutoModel && externalNonGraniteExists,
      blocked_tools_for_requested: blockedToolsForRequested,
    }),
  );

  const routingArmIdForRun =
    routingPick?.source === 'thompson' && routingPick.armId ? routingPick.armId : null;

  const needsRag =
    !skipRagFromRoute && (await shouldIncludeRag(env, intentResult.taskType, tenantId));
  const ragResult = needsRag
    ? await unifiedRagSearch(env, message, {
        topK: modeConfig.context_strategy === 'minimal' ? 3 : 8,
        tenantId,
      })
    : { matches: [] };
  const ragContext   = (ragResult.matches || []).join('\n\n');
  const contextBlock = ragContext ? `\n\nRelevant context:\n${ragContext}` : '';

  const basePrompt = agentMeta?.system_prompt || FALLBACK_CORE_SYSTEM;
  const legacySystemPrompt = () =>
    basePrompt
    + (modeConfig.system_prompt_fragment ? `\n\n${modeConfig.system_prompt_fragment}` : '')
    + contextBlock;

  let systemPrompt = legacySystemPrompt();
  if (env.DB) {
    systemPrompt = await buildSystemPrompt(
      env,
      tenantId,
      requestedMode,
      contextBlock,
      modeConfig,
      promptRouteRow,
    );
  }
  try {
    const mem = await loadAgentMemoryForPrompt(env, tenantId, {
      userMessage: message,
      sessionId,
      agentId: body.agentId || null,
      workspaceId: workspaceId || null,
    });
    if (mem && String(mem).trim()) {
      systemPrompt = `${systemPrompt}\n\n${String(mem).trim()}`;
    }
  } catch (_) { /* memory must not break sessions */ }

  try {
    const skillRows = await loadSkillsForTaskType(env, intentResult.taskType, workspaceId);
    const skillContext = skillRows
      .map((s) => `## Skill: ${s.name}\n${s.content_markdown}`)
      .join('\n\n---\n\n');
    if (skillContext) {
      systemPrompt = `${skillContext}\n\n---\n\n${systemPrompt}`;
    }
  } catch (_) { /* skills-by-task must not break chat */ }

  try {
    systemPrompt = await appendSkillsAndRulesToSystemPrompt(env, ctx, systemPrompt, {
      userId,
      workspaceId,
      conversationId: sessionId,
    });
  } catch (e) {
    console.warn('[agent] skills/rules prompt enrich', e?.message ?? e);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();

  const emit = (type, payload) => {
    try { writer.write(encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`)); } catch (_) {}
  };

  emit('context', {
    intent: intentSlug,
    mode: requestedMode,
    model: fallbackModelKeys[0] || null,
    requested_model: rawRequestedKey || rawRequestedId || null,
    resolved_requested_model: explicitRow?.model_key ?? null,
    auto_model: isAutoModel,
    tool_count: tools.length,
    routing_arm_id: routingArmIdForRun,
  });

  ;(async () => {
    const chatT0 = Date.now();
    const turnStartNs = chatT0 * 1_000_000;
    let routingArmOutcomeLogged = false;
    const providerForModelKey = (mk) => {
      const k = mk != null ? String(mk) : '';
      const r = chainRows.find((x) => String(x.model_key || '') === k);
      return r?.provider != null ? String(r.provider) : 'unknown';
    };
    try {
      const tried = [];
      const startIdx = (confidence < escalationThreshold && fallbackModelKeys.length > 1) ? 1 : 0;
      let succeeded = false;
      let lastLoopStats = null;
      let lastAssistantStreamText = '';

      for (let i = startIdx; i < chainRows.length; i++) {
        const row = chainRows[i];
        const modelKey = row?.model_key;
        if (!modelKey) continue;
        tried.push(modelKey);
        try {
          let textEmitted = 0;
          let streamAccum = '';
          const emitWrapped = (type, payload) => {
            if (type === 'text' && payload?.text) {
              const piece = String(payload.text);
              textEmitted += piece.length;
              streamAccum += piece;
            }
            emit(type, payload);
          };
          lastLoopStats = await withTimeout(
            runAgentToolLoop(env, ctx, emitWrapped, {
              request,
              messages: body.messages || [{ role: 'user', content: gate.rewritten_query || message }],
              tools, systemPrompt, modelKey,
              temperature:  modeConfig.temperature || 0.7,
              maxToolCalls: effectiveMaxTools,
              mode: requestedMode, modeConfig, userPolicy,
              sessionId, tenantId, userId,
              workspaceId,
              routingTaskType: resolvedRoutingTaskType,
              qualityScore: confidence,
              mcpRuntimeContext,
              routingArmId: routingArmIdForRun,
              thompsonModelKey: thompsonRow?.model_key ?? null,
            }),
            15000
          );
          if (textEmitted <= 0) throw new Error('empty_stream');
          succeeded = true;
          lastAssistantStreamText = streamAccum;
          console.log(
            '[agent] routing_model',
            JSON.stringify({
              selected_model: modelKey,
              requested: rawRequestedKey || rawRequestedId || null,
              resolved_explicit: explicitRow?.model_key ?? null,
            }),
          );
          break;
        } catch (e) {
          if (String(e?.message || '') === OLLAMA_SKIP_MESSAGE) {
            console.warn('[agent] ollama skipped; trying next model');
          } else {
            console.warn('[agent] model fallback:', { provider: row?.provider, model_key: row?.model_key, error: e?.message });
            try {
              const more = await loadToolFallbackChain(env, {
                tenantId,
                excludeModelKeys: tried,
                limit: 3,
              });
              const moreFiltered = await filterWorkspaceModelTierPool(env, workspaceId, more);
              for (let j = moreFiltered.length - 1; j >= 0; j--) {
                chainRows.splice(i + 1, 0, moreFiltered[j]);
              }
            } catch (_) {
              /* extra fallbacks are optional */
            }
          }
        }
      }

      if (!succeeded) {
        let finalKey = '';
        const prefStr = String(modeConfig?.model_preference_key || '').trim();
        if (prefStr) finalKey = prefStr;
        if (!finalKey && modeConfig?.gate_model) {
          const gateRow = await resolveAiModelRowById(env, modeConfig.gate_model, tenantId);
          if (gateRow?.model_key) finalKey = gateRow.model_key;
        }
        const alreadyTried = new Set(tried);
        if (finalKey && !alreadyTried.has(finalKey)) {
          tried.push(finalKey);
          console.log('[agent] routing_model', JSON.stringify({ final_fallback: finalKey }));
          try {
            let textEmitted = 0;
            let streamAccum = '';
            const emitWrapped = (type, payload) => {
              if (type === 'text' && payload?.text) {
                const piece = String(payload.text);
                textEmitted += piece.length;
                streamAccum += piece;
              }
              emit(type, payload);
            };
            lastLoopStats = await withTimeout(
              runAgentToolLoop(env, ctx, emitWrapped, {
                request,
                messages: body.messages || [{ role: 'user', content: gate.rewritten_query || message }],
                tools, systemPrompt, modelKey: finalKey,
                temperature:  modeConfig.temperature || 0.7,
                maxToolCalls: effectiveMaxTools,
                mode: requestedMode, modeConfig, userPolicy,
                sessionId, tenantId, userId,
                workspaceId,
                routingTaskType: resolvedRoutingTaskType,
                qualityScore: confidence,
                mcpRuntimeContext,
                routingArmId: routingArmIdForRun,
                thompsonModelKey: thompsonRow?.model_key ?? null,
              }),
              15000
            );
            if (textEmitted > 0) {
              succeeded = true;
              lastAssistantStreamText = streamAccum;
            }
          } catch (e) {
            console.warn('[agent] final fallback failed:', { model_key: finalKey, error: e?.message });
          }
        }
      }

      if (!succeeded) {
        emit('error', { message: 'All providers exhausted', tried });
      }

      if (routingPick?.armId) {
        await recordArmOutcome(env, routingPick.armId, succeeded);
        routingArmOutcomeLogged = true;
      }

      if (succeeded && lastAssistantStreamText && inferArtifactFromAssistantText(lastAssistantStreamText)) {
        scheduleAgentsamArtifactFromChatOutput(env, ctx, {
          outputText: lastAssistantStreamText,
          userId,
          tenantId,
          workspaceId,
        });
      }

      const usageRoutingArmId =
        routingArmIdForRun &&
        thompsonRow?.model_key &&
        lastLoopStats?.modelKey === thompsonRow.model_key
          ? routingArmIdForRun
          : null;

      scheduleAgentsamCommandRunInsert(env, ctx, {
        tenantId,
        workspaceId: resolvedWorkspaceId ?? '',
        userId: userId ?? null,
        sessionId: sessionId ? String(sessionId) : null,
        conversationId: sessionId ? String(sessionId) : null,
        userInput: message,
        normalizedIntent: intentSlug,
        intentCategory: 'chat',
        modelKey: lastLoopStats?.modelKey || fallbackModelKeys[0] || null,
        commandsExecuted: lastLoopStats?.executedToolNames || [],
        result: { succeeded, tried },
        outputText: null,
        confidenceScore: confidence,
        success: succeeded,
        exitCode: null,
        durationMs: Date.now() - chatT0,
        inputTokens: lastLoopStats?.totalUsage?.input_tokens ?? 0,
        outputTokens: lastLoopStats?.totalUsage?.output_tokens ?? 0,
        costUsd: 0,
        errorMessage: succeeded ? null : 'all_providers_exhausted',
        selectedCommandId: null,
        selectedCommandSlug: null,
        riskLevel: 'low',
        requiresConfirmation: false,
        approvalStatus: 'not_required',
        cwd: null,
        filesOpen: [],
        recentError: succeeded ? null : 'all_providers_exhausted',
        goal: message,
        contextTokenEstimate:
          (lastLoopStats?.totalUsage?.input_tokens ?? 0) +
          (lastLoopStats?.totalUsage?.output_tokens ?? 0),
      });
      if (userId && resolvedWorkspaceId) {
        scheduleAgentsamChatAgentRunInsert(env, ctx, {
          userId,
          tenantId,
          workspaceId: resolvedWorkspaceId,
          conversationId: sessionId ? String(sessionId) : null,
          routingArmId: routingArmIdForRun,
          modelKey: lastLoopStats?.modelKey || fallbackModelKeys[0] || null,
          taskType: resolvedRoutingTaskType,
          success: succeeded,
          inputTokens: lastLoopStats?.totalUsage?.input_tokens ?? 0,
          outputTokens: lastLoopStats?.totalUsage?.output_tokens ?? 0,
          costUsd: 0,
          durationMs: Date.now() - chatT0,
          errorMessage: succeeded ? null : 'all_providers_exhausted',
        });
      }
      scheduleAgentsamUsageEventFromChat(env, ctx, {
        tenantId,
        workspaceId,
        userId,
        conversationId: sessionId ? String(sessionId) : null,
        resolvedProvider: providerForModelKey(lastLoopStats?.modelKey),
        modelKey: lastLoopStats?.modelKey ?? fallbackModelKeys[0] ?? 'unknown',
        inputTokens: lastLoopStats?.totalUsage?.input_tokens ?? 0,
        outputTokens: lastLoopStats?.totalUsage?.output_tokens ?? 0,
        costUsd: 0,
        streamFailed: !succeeded,
        refId: `sse_${chatT0}_${String(sessionId || userId || '').slice(0, 80)}`,
        routingArmId: usageRoutingArmId,
      });
      if (tenantId) {
        scheduleInsertAgentCost(env, ctx, {
          workspaceId,
          tenantId,
          sessionId: sessionId ? String(sessionId) : null,
          routingArmId:
            routingPick?.source === 'thompson' && routingPick.armId ? routingPick.armId : null,
          modelUsed: lastLoopStats?.modelKey || fallbackModelKeys[0] || 'unknown',
          tokensIn: lastLoopStats?.totalUsage?.input_tokens ?? 0,
          tokensOut: lastLoopStats?.totalUsage?.output_tokens ?? 0,
          costUsd: 0,
          taskType: resolvedRoutingTaskType,
          userId: userId ?? null,
          isStreaming: true,
          errorType: succeeded ? null : 'all_providers_exhausted',
        });
      }

      if (tenantId && resolvedWorkspaceId) {
        recordSpan(env, ctx, {
          tenant_id: tenantId,
          workspace_id: resolvedWorkspaceId,
          operation_name: 'agent.chat_turn',
          kind: 'server',
          status_code: succeeded ? 'ok' : 'error',
          status_message: succeeded ? null : 'all_providers_exhausted',
          start_time_unix_nano: turnStartNs,
          end_time_unix_nano: Date.now() * 1_000_000,
          attributes_json: JSON.stringify({
            model: lastLoopStats?.modelKey ?? fallbackModelKeys[0] ?? null,
            provider: providerForModelKey(lastLoopStats?.modelKey),
            input_tokens: lastLoopStats?.totalUsage?.input_tokens ?? 0,
            output_tokens: lastLoopStats?.totalUsage?.output_tokens ?? 0,
            tool_calls: lastLoopStats?.toolCallsUsed ?? 0,
          }),
        });
      }
    } catch (e) {
      console.warn('[agent] Agent loop failed', e?.message ?? e);
      emit('error', { message: 'Agent loop failed' });
      if (routingPick?.armId && !routingArmOutcomeLogged) {
        await recordArmOutcome(env, routingPick.armId, false);
        routingArmOutcomeLogged = true;
      }
      scheduleAgentsamCommandRunInsert(env, ctx, {
        tenantId,
        workspaceId: resolvedWorkspaceId ?? '',
        userId: userId ?? null,
        sessionId: sessionId ? String(sessionId) : null,
        conversationId: sessionId ? String(sessionId) : null,
        userInput: message,
        normalizedIntent: intentSlug,
        intentCategory: 'chat',
        modelKey: fallbackModelKeys[0] || null,
        commandsExecuted: [],
        result: { fatal: true },
        outputText: null,
        confidenceScore: confidence,
        success: false,
        exitCode: null,
        durationMs: Date.now() - chatT0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        errorMessage: e?.message != null ? String(e.message).slice(0, 8000) : 'agent_loop_failed',
        selectedCommandId: null,
        selectedCommandSlug: null,
        riskLevel: 'low',
        requiresConfirmation: false,
        approvalStatus: 'not_required',
        cwd: null,
        filesOpen: [],
        recentError: e?.message != null ? String(e.message).slice(0, 2000) : null,
        goal: message,
        contextTokenEstimate: 0,
      });
      if (userId && resolvedWorkspaceId) {
        scheduleAgentsamChatAgentRunInsert(env, ctx, {
          userId,
          tenantId,
          workspaceId: resolvedWorkspaceId,
          conversationId: sessionId ? String(sessionId) : null,
          routingArmId: routingArmIdForRun,
          modelKey: fallbackModelKeys[0] || null,
          taskType: resolvedRoutingTaskType,
          success: false,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          durationMs: Date.now() - chatT0,
          errorMessage: e?.message != null ? String(e.message).slice(0, 8000) : 'agent_loop_failed',
        });
      }
      scheduleAgentsamUsageEventFromChat(env, ctx, {
        tenantId,
        workspaceId,
        userId,
        conversationId: sessionId ? String(sessionId) : null,
        resolvedProvider: providerForModelKey(fallbackModelKeys[0]),
        modelKey: fallbackModelKeys[0] ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        streamFailed: true,
        refId: `sse_${chatT0}_${String(sessionId || userId || '').slice(0, 80)}`,
        routingArmId: null,
      });
      if (tenantId) {
        scheduleInsertAgentCost(env, ctx, {
          workspaceId,
          tenantId,
          sessionId: sessionId ? String(sessionId) : null,
          routingArmId:
            routingPick?.source === 'thompson' && routingPick.armId ? routingPick.armId : null,
          modelUsed: fallbackModelKeys[0] || 'unknown',
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          taskType: resolvedRoutingTaskType,
          userId: userId ?? null,
          isStreaming: true,
          errorType: 'agent_loop_failed',
        });
      }
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function isAgentApiPublic(path, method) {
  if (path === '/api/agent/health' && method === 'GET') return true;
  if (path === '/api/agent/modes' && method === 'GET') return true;
  if (path === '/api/agent/commands' && method === 'GET') return true;
  if (path === '/api/agent/conversations/search' && method === 'GET') return true;
  if (path === '/api/agent/telemetry') return true;
  if (path === '/api/agent/cicd') return true;
  if (path === '/api/agent/mcp') return true;
  return false;
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleAgentApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const identity = await resolveIdentity(env, request);
  const ingestChatBypass =
    path === '/api/agent/chat' &&
    method === 'POST' &&
    isIngestSecretAuthorized(request, env);
  if (!isAgentApiPublic(path, method) && !ingestChatBypass) {
    if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
    if (!identity.workspaceId) {
      return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    }
  }

  if (path === '/api/agent/subagent-profiles' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {});
    if (wsRes.error || !wsRes.workspaceId) {
      return jsonResponse({ error: wsRes.error || 'no_workspace', redirect: '/onboarding' }, 403);
    }
    const effectiveWs = String(wsRes.workspaceId).trim();
    const uid = String(authUser.id || '').trim();
    let tid =
      actorCtx?.tenantId != null && String(actorCtx.tenantId).trim() !== ''
        ? String(actorCtx.tenantId).trim()
        : authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
          ? String(authUser.tenant_id).trim()
          : '';
    if (!tid) tid = await fetchAuthUserTenantId(env, uid);
    const personUuid =
      actorCtx?.personUuid != null && String(actorCtx.personUuid).trim() !== ''
        ? String(actorCtx.personUuid).trim()
        : authUser.person_uuid != null && String(authUser.person_uuid).trim() !== ''
          ? String(authUser.person_uuid).trim()
          : '';
    const scopedSql = `
      SELECT id, slug, display_name,
             COALESCE(description, '') AS description,
             COALESCE(icon, '') AS icon,
             COALESCE(agent_type, 'custom') AS agent_type,
             default_model_id, is_active,
             COALESCE(sort_order, 0) AS sort_order,
             COALESCE(sandbox_mode, '') AS sandbox_mode,
             mcp_servers_json, modes_json, tool_invocation_style,
             instructions_markdown, allowed_tool_globs, user_id, workspace_id,
             tenant_id, person_uuid
        FROM agentsam_subagent_profile
       WHERE is_active = 1
         AND (
              (user_id = ? AND (workspace_id = ? OR workspace_id = ''))
           OR (tenant_id IS NOT NULL AND tenant_id != '' AND tenant_id = ? AND (workspace_id = ? OR workspace_id = ''))
           OR (person_uuid IS NOT NULL AND person_uuid != '' AND person_uuid = ?)
         )
       ORDER BY sort_order ASC`;

    let rows = [];
    try {
      const q = await env.DB.prepare(scopedSql)
        .bind(uid, effectiveWs, tid, effectiveWs, personUuid)
        .all();
      rows = q.results || [];
    } catch (e) {
      console.warn('[subagent-profiles] scoped query failed, falling back', e?.message ?? e);
      const fb = await env.DB.prepare(
        `SELECT * FROM agentsam_subagent_profile
         WHERE is_active = 1 AND user_id = ? AND (workspace_id = ? OR workspace_id = '')
         ORDER BY COALESCE(sort_order, 9999) ASC`,
      )
        .bind(uid, effectiveWs)
        .all()
        .catch(() => ({ results: [] }));
      rows = fb.results || [];
    }

    try {
      const q2 = await env.DB.prepare(
        `SELECT id, slug, display_name,
                COALESCE(description, '') AS description,
                COALESCE(icon, '') AS icon,
                COALESCE(agent_type, 'custom') AS agent_type,
                default_model_id, is_active,
                COALESCE(sort_order, 0) AS sort_order,
                COALESCE(sandbox_mode, '') AS sandbox_mode,
                mcp_servers_json, modes_json, tool_invocation_style,
                instructions_markdown, allowed_tool_globs, user_id, workspace_id,
                tenant_id, person_uuid, COALESCE(is_platform_global, 0) AS is_platform_global
           FROM agentsam_subagent_profile
          WHERE is_active = 1 AND COALESCE(is_platform_global, 0) = 1
            AND (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?)
            AND (? = 1)`,
      )
        .bind(tid, authUserIsSuperadmin(authUser) ? 1 : 0)
        .all();
      const extra = q2.results || [];
      const seen = new Set(rows.map((r) => r.id));
      for (const r of extra) {
        if (r?.id && !seen.has(r.id)) {
          seen.add(r.id);
          rows.push(r);
        }
      }
    } catch (_) {
      /* is_platform_global not migrated yet */
    }
    return jsonResponse(rows);
  }

  // GET /api/agent/tools — combined tool exposure (builtin + registered MCP)
  if (path === '/api/agent/tools' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const actorCtx = await resolveIamActorContext(request, env).catch(() => null);

    const tools = [];

    try {
      const mcpRows = await selectAgentsamMcpToolsList(
        env.DB,
        {
          userId: actorCtx?.userId,
          tenantId: actorCtx?.tenantId,
          workspaceId: actorCtx?.workspaceId,
          personUuid: actorCtx?.personUuid,
        },
        500,
      );
      for (const r of mcpRows || []) {
        if (!r) continue;
        const name = String(r.tool_name || '').trim();
        if (!name) continue;
        tools.push({
          name,
          description: String(r.description || ''),
          category: String(r.tool_category || 'mcp'),
          handler_type: 'mcp',
          is_active: 1,
          risk_level: Number(r.requires_approval || 0) === 1 ? 'high' : 'medium',
        });
      }
    } catch (_) {}

    // De-dupe by name (prefer builtin if collision)
    const seen = new Set();
    const deduped = [];
    for (const t of tools) {
      const key = String(t.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(t);
    }

    return jsonResponse({ tools: deduped, total: deduped.length });
  }

  // GET /api/agent/todo — multi-tenant agentsam_todo
  if (path === '/api/agent/todo' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM agentsam_todo
         WHERE tenant_id = ? AND (status IS NULL OR LOWER(TRIM(status)) != 'done')
         ORDER BY priority ASC`,
      )
        .bind(tenantId)
        .all();
      return jsonResponse({ todos: results || [] });
    } catch (e) {
      console.warn('[agent/todo]', e?.message ?? e);
      return jsonResponse({ error: 'Failed to load todos' }, 500);
    }
  }

  // GET /api/agent/health — first thing Agent Sam queries on session start
  if (path === '/api/agent/health' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const { results } = await env.DB.prepare(
      `SELECT component, status, last_checked_at, last_healthy_at,
              error_message, metadata_json
       FROM iam_system_health
       ORDER BY status DESC, component ASC`
    ).all();
    const down = (results || []).filter((r) => r.status === 'down').length;
    const degraded = (results || []).filter((r) => r.status === 'degraded').length;
    return jsonResponse({
      overall: down > 0 ? 'down' : degraded > 0 ? 'degraded' : 'healthy',
      components: results || [],
      queried_at: new Date().toISOString()
    });
  }

  // ── /api/agent/models — canonical agentsam_ai rows (picker + routing metadata)
  if (path === '/api/agent/models') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
    const showInPicker = url.searchParams.get('show_in_picker') === '1';
    const tenantForModels = url.searchParams.get('tenant_id') || identity?.tenantId;
    if (!tenantForModels) return jsonResponse({ error: 'tenant_id required' }, 400);
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, name, provider, model_key, api_platform, show_in_picker,
                picker_eligible, picker_group,
                input_rate_per_mtok, output_rate_per_mtok, sort_order, context_max_tokens,
                size_class, supports_tools, supports_vision
         FROM agentsam_ai
         WHERE mode = 'model' AND status = 'active'
           AND COALESCE(picker_eligible, 1) = 1
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
           ${showInPicker ? 'AND COALESCE(show_in_picker, 0) = 1' : ''}
         ORDER BY sort_order ASC, name ASC`,
      ).bind(tenantForModels).all();
      return jsonResponse(results || []);
    } catch (e) {
      return jsonResponse({ error: e?.message }, 500);
    }
  }

  // ── /api/agent/modes ──────────────────────────────────────────────────────
  if (path === '/api/agent/modes' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const { results } = await env.DB.prepare(
        `SELECT slug, display_name AS label, description, color_hex AS color, icon,
                temperature, auto_run, max_tool_calls
         FROM agent_mode_configs WHERE is_active = 1 ORDER BY sort_order`
      ).all();
      return jsonResponse(results || []);
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/commands ───────────────────────────────────────────────────
  if (path === '/api/agent/commands' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const { results } = await env.DB.prepare(
        `SELECT slug, display_name as name, description, usage_hint, handler_type, is_active
         FROM agentsam_slash_commands
         WHERE is_active = 1
         ORDER BY sort_order ASC, slug ASC`
      ).all();
      return jsonResponse(results || []);
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/session/mode ───────────────────────────────────────────────
  if (path === '/api/agent/session/mode' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body           = await request.json().catch(() => ({}));
    const mode           = String(body.mode || '').toLowerCase().trim();
    const conversationId = String(body.conversation_id || body.session_id || '');
    if (!conversationId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.SESSION_CACHE) return jsonResponse({ error: 'SESSION_CACHE not configured' }, 503);
    await env.SESSION_CACHE.put(`session_mode:${conversationId}`, JSON.stringify({ mode, updated_at: Date.now() }), { expirationTtl: 86400 * 14 });
    return jsonResponse({ mode, persisted: true });
  }

  // ── /api/agent/problems ───────────────────────────────────────────────────
  if (path === '/api/agent/problems' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const checkedAt = new Date().toISOString();
    let mcp_tool_errors = [], audit_failures = [], worker_errors = [];
    try { const q = await env.DB.prepare(`SELECT id, tool_name, status, error_message, session_id, created_at FROM agentsam_mcp_tool_execution WHERE lower(COALESCE(status,'')) IN ('error','failed') OR (error_message IS NOT NULL AND length(trim(error_message)) > 0) ORDER BY created_at DESC LIMIT 50`).all(); mcp_tool_errors = q.results || []; } catch (_) {}
    try { const q = await env.DB.prepare(`SELECT id, event_type, message, created_at, metadata_json FROM agentsam_hook_execution WHERE lower(COALESCE(event_type,'')) LIKE '%fail%' OR lower(COALESCE(event_type,'')) LIKE '%error%' OR lower(COALESCE(event_type,'')) LIKE '%denied%' ORDER BY created_at DESC LIMIT 25`).all(); audit_failures = q.results || []; } catch (_) {}
    try { const q = await env.DB.prepare(`SELECT rowid as id, path, method, status_code, error_message, created_at FROM worker_analytics_errors ORDER BY created_at DESC LIMIT 20`).all(); worker_errors = q.results || []; } catch (_) {}
    return jsonResponse({ checked_at: checkedAt, mcp_tool_errors, audit_failures, worker_errors });
  }

  // ── /api/agent/notifications (deployments + conversations + connectivity) ──
  if (path === '/api/agent/notifications' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    let tenantId = authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);

    const userId = String(authUser.id || '').trim();

    try {
      let deployRows = [];
      try {
        const q = await env.DB.prepare(
          `SELECT id, status, deployed_by, environment, worker_name,
                  triggered_by, git_hash, timestamp AS created_at
           FROM deployments
           ORDER BY timestamp DESC LIMIT 10`,
        ).all();
        deployRows = q.results || [];
      } catch {
        try {
          const q = await env.DB.prepare(
            `SELECT * FROM deployments ORDER BY COALESCE(created_at, 0) DESC LIMIT 10`,
          ).all();
          deployRows = q.results || [];
        } catch {
          deployRows = [];
        }
      }

      let convRows = [];
      if (tenantId && userId) {
        try {
          const q = await env.DB.prepare(
            `SELECT id, title, message_count, last_message_at AS created_at,
                    total_cost_usd, workspace_id
             FROM agent_conversations
             WHERE (tenant_id = ? OR user_id = ?) AND COALESCE(is_archived, 0) = 0
             ORDER BY last_message_at DESC LIMIT 20`,
          ).bind(tenantId, userId).all();
          convRows = q.results || [];
        } catch {
          convRows = [];
        }
      }

      let healthRows = [];
      if (tenantId) {
        try {
          const q = await env.DB.prepare(
            `SELECT wc.workspace_id, wc.service, wc.status,
                    wc.last_checked_at AS created_at, w.display_name
             FROM workspace_connectivity_status wc
             JOIN agentsam_workspace w ON w.id = wc.workspace_id
             WHERE wc.status IN ('degraded','down') AND w.tenant_id = ?
             LIMIT 10`,
          ).bind(tenantId).all();
          healthRows = q.results || [];
        } catch {
          healthRows = [];
        }
      }

      const normalized = [];

      for (const r of deployRows) {
        const worker = r.worker_name != null ? String(r.worker_name) : 'worker';
        const gh = r.git_hash != null ? String(r.git_hash) : '';
        const trig = r.triggered_by != null ? String(r.triggered_by) : '';
        const st = r.status != null ? String(r.status) : '';
        const ts = toUnixSeconds(r.created_at ?? r.timestamp);
        normalized.push({
          id: `deploy:${r.id}`,
          type: 'deploy',
          title: `Deploy ${st}: ${worker}`,
          message: `${trig} · ${gh ? gh.slice(0, 7) : '—'}`,
          created_at: ts,
          read: false,
          meta: r,
          subject: `Deploy ${st}: ${worker}`,
        });
      }

      for (const r of convRows) {
        const ts = toUnixSeconds(r.created_at);
        const titleBase =
          r.title != null && String(r.title).trim()
            ? String(r.title).trim()
            : 'Untitled conversation';
        const mc = r.message_count != null ? Number(r.message_count) : 0;
        normalized.push({
          id: `conv:${r.id}`,
          type: 'conversation',
          title: titleBase,
          message: `${mc} messages`,
          created_at: ts,
          read: false,
          meta: r,
          subject: titleBase,
        });
      }

      for (const r of healthRows) {
        const ts = toUnixSeconds(r.created_at);
        const svc = r.service != null ? String(r.service) : 'service';
        const st = r.status != null ? String(r.status) : '';
        const dn = r.display_name != null ? String(r.display_name) : 'workspace';
        normalized.push({
          id: `health:${r.workspace_id}:${svc}`,
          type: 'health',
          title: `${svc} ${st} on ${dn}`,
          message: `Last checked ${formatRelativeCheckedAgo(ts)}`,
          created_at: ts,
          read: false,
          meta: r,
          subject: `${svc} ${st} on ${dn}`,
        });
      }

      normalized.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const top = normalized.slice(0, 50);
      return jsonResponse({ notifications: top });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  const notifReadMatch = path.match(/^\/api\/agent\/notifications\/([^/]+)\/read$/);
  if (notifReadMatch && method === 'PATCH') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse({ success: true });
  }

  // ── /api/agent/keyboard-shortcuts ────────────────────────────────────────
  if (path === '/api/agent/keyboard-shortcuts' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const { results } = await env.DB.prepare(`SELECT * FROM keyboard_shortcuts ORDER BY sort_order ASC, id ASC`).all();
    return jsonResponse({ shortcuts: results || [] });
  }

  const kbMatch = path.match(/^\/api\/agent\/keyboard-shortcuts\/([^/]+)$/);
  if (kbMatch && method === 'PATCH') {
    const rowId    = decodeURIComponent(kbMatch[1] || '').trim();
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body    = await request.json().catch(() => ({}));
    const en      = body.is_enabled;
    const turnOn  = en === true || en === 1 || en === '1';
    const turnOff = en === false || en === 0 || en === '0';
    if (!turnOn && !turnOff) return jsonResponse({ error: 'is_enabled required' }, 400);
    const existing = await env.DB.prepare(`SELECT id, is_system FROM keyboard_shortcuts WHERE id = ?`).bind(rowId).first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);
    if (Number(existing.is_system) === 1) return jsonResponse({ error: 'System shortcut cannot be disabled' }, 403);
    await env.DB.prepare(`UPDATE keyboard_shortcuts SET is_enabled = ? WHERE id = ?`).bind(turnOn ? 1 : 0, rowId).run();
    return jsonResponse({ ok: true });
  }

  // ── /api/agent/context-picker/catalog ────────────────────────────────────
  if (path === '/api/agent/context-picker/catalog' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ tables: [], workflows: [], commands: [], memory_keys: [], workspaces: [] });
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    let tables = [], workflows = [], commands = [], memory_keys = [], workspaces = [];
    await Promise.allSettled([
      env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().then(r => { tables = (r.results||[]).map(x=>x.name); }),
      env.DB.prepare(`SELECT id, name FROM agentsam_mcp_workflows ORDER BY COALESCE(name,id) LIMIT 100`).all().then(r => { workflows = r.results||[]; }),
      tenantId ? env.DB.prepare(`SELECT slug, display_name AS name, category FROM agentsam_commands WHERE tenant_id = ? AND COALESCE(is_active, 1) = 1 ORDER BY category, display_name LIMIT 200`).bind(tenantId).all().then(r => { commands = r.results||[]; }) : Promise.resolve(),
      tenantId ? env.DB.prepare(`SELECT key FROM agentsam_memory WHERE tenant_id = ? ORDER BY COALESCE(importance_score,0) DESC LIMIT 150`).bind(tenantId).all().then(r => { memory_keys = (r.results||[]).map(x=>x.key); }) : Promise.resolve(),
      env.DB.prepare(`SELECT id, name FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name LIMIT 50`).all().then(r => { workspaces = r.results||[]; }),
    ]);
    return jsonResponse({ tables, workflows, commands, memory_keys, workspaces });
  }

  // ── /api/agent/memory/list ────────────────────────────────────────────────
  if (path === '/api/agent/memory/list' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ items: [] });
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ items: [] });
    const { results } = await env.DB.prepare(`SELECT key, memory_type, importance_score FROM agentsam_memory WHERE tenant_id = ? ORDER BY COALESCE(importance_score,0) DESC LIMIT 200`).bind(tenantId).all().catch(() => ({ results: [] }));
    return jsonResponse({ items: (results||[]).filter(r=>r.key) });
  }

  // ── /api/agent/memory/sync ────────────────────────────────────────────────
  if (path === '/api/agent/memory/sync' && method === 'POST') {
    return handleAgentMemorySync(request, env);
  }

  // ── /api/agent/db/tables ──────────────────────────────────────────────────
  if (path === '/api/agent/db/tables' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ tables: [] });
    const { results } = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().catch(() => ({ results: [] }));
    return jsonResponse({ tables: (results||[]).map(r=>r.name) });
  }

  // ── /api/agent/db/query-history ──────────────────────────────────────────
  if (path === '/api/agent/db/query-history') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ history: [] });
    if (method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, query_sql, executed_at, row_count, status FROM agent_db_query_history WHERE user_id = ? ORDER BY executed_at DESC LIMIT 50`).bind(String(authUser.id)).all().catch(() => ({ results: [] }));
      return jsonResponse({ history: results || [] });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      await env.DB.prepare(`INSERT INTO agent_db_query_history (id, user_id, query_sql, status, row_count, executed_at) VALUES (?,?,?,?,?,unixepoch())`).bind(crypto.randomUUID(), String(authUser.id), String(body.query_sql||'').slice(0,10000), String(body.status||'success'), Number(body.row_count||0)).run().catch(() => {});
      return jsonResponse({ ok: true });
    }
  }

  // ── /api/agent/db/snippets ────────────────────────────────────────────────
  if (path === '/api/agent/db/snippets') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ snippets: [] });
    if (method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT id, name, query_sql, created_at FROM agent_db_snippets WHERE user_id = ? ORDER BY name ASC`).bind(String(authUser.id)).all().catch(() => ({ results: [] }));
      return jsonResponse({ snippets: results || [] });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!body.name || !body.query_sql) return jsonResponse({ error: 'name and query_sql required' }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO agent_db_snippets (id, user_id, name, query_sql, created_at) VALUES (?,?,?,?,unixepoch())`).bind(id, String(authUser.id), String(body.name).slice(0,200), String(body.query_sql).slice(0,50000)).run();
      return jsonResponse({ ok: true, id });
    }
  }

  // ── /api/agent/git/status ─────────────────────────────────────────────────
  if (path === '/api/agent/git/status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const workerName = projectIdFromEnv(env) || 'unknown';
    try {
      const row = await env.DB.prepare(`SELECT d.git_hash, d.version, d.timestamp, g.repo_full_name, g.default_branch FROM deployments d LEFT JOIN github_repositories g ON g.cloudflare_worker_name = ? WHERE d.worker_name = ? AND d.status = 'success' ORDER BY d.timestamp DESC LIMIT 1`).bind(workerName, workerName).first();
      return jsonResponse({ branch: row?.default_branch || 'main', git_hash: row?.git_hash || null, worker_name: workerName, repo_full_name: row?.repo_full_name || null, sync_last_at: row?.timestamp || null });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── GET /api/agent/git/branches ───────────────────────────────────────────
  if (path === '/api/agent/git/branches' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const { token, error, status } = await resolveGitHubToken(authUser, env);
    if (error) return jsonResponse({ error }, status);

    const workerName = projectIdFromEnv(env);
    const repoRow = await env.DB.prepare(
      `SELECT repo_full_name, default_branch
       FROM github_repositories
       WHERE cloudflare_worker_name = ?
       LIMIT 1`,
    )
      .bind(workerName)
      .first();

    if (!repoRow?.repo_full_name) {
      return jsonResponse({ error: 'No repository linked to this worker.', worker: workerName }, 404);
    }

    const ghRes = await fetch(
      `https://api.github.com/repos/${repoRow.repo_full_name}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'inneranimalmedia-agent/1.0',
        },
      },
    );

    if (!ghRes.ok) {
      return jsonResponse({ error: 'GitHub API error', status: ghRes.status, detail: await ghRes.text() }, 502);
    }

    const ghBranches = await ghRes.json();

    // Shape matches existing GitBranchRow type in StatusBar:
    // { ref: string, sha: string, protected: boolean }
    return jsonResponse({
      current: repoRow.default_branch || 'main',
      repo: repoRow.repo_full_name,
      branches: ghBranches.map((b) => ({
        ref: b.name,
        sha: b.commit.sha.slice(0, 7),
        protected: b.protected ?? false,
      })),
    });
  }

  // ── GET /api/agent/git/repos ──────────────────────────────────────────────
  if (path === '/api/agent/git/repos' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const { token, error, status } = await resolveGitHubToken(authUser, env);
    if (error) return jsonResponse({ error }, status);

    const ghRes = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'inneranimalmedia-agent/1.0',
        },
      },
    );

    if (!ghRes.ok) {
      return jsonResponse({ error: 'GitHub API error', status: ghRes.status }, 502);
    }

    const ghRepos = await ghRes.json();

    const linkedRows = await env.DB.prepare(
      `SELECT repo_full_name, cloudflare_worker_name
       FROM github_repositories
       WHERE tenant_id = ?`,
    )
      .bind(authUser.tenant_id)
      .all();

    const linkedMap = Object.fromEntries(
      (linkedRows.results || []).map((r) => [r.repo_full_name, r.cloudflare_worker_name]),
    );

    return jsonResponse({
      repos: ghRepos.map((r) => ({
        full_name: r.full_name,
        name: r.name,
        owner: r.owner.login,
        private: r.private,
        pushed_at: r.pushed_at,
        default_branch: r.default_branch,
        linked_worker: linkedMap[r.full_name] || null,
      })),
    });
  }

  // ── /api/agent/git/sync ───────────────────────────────────────────────────
  if (path === '/api/agent/git/sync' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body       = await request.json().catch(() => ({}));
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const now        = Math.floor(Date.now() / 1000);
    const proposedBy = String(authUser.email || authUser.id || 'user').slice(0,200);
    const iamOrigin  = (env.IAM_ORIGIN || '').replace(/\/$/,'');
    const expGit = now + 86400;
    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
       (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
        risk_level, input_json, expires_at, status, approval_type, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      proposalId,
      tenantId,
      null,
      proposedBy,
      body.session_id || null,
      'git_sync_workflow',
      'User requested Git sync from dashboard.',
      'medium',
      JSON.stringify({
        command_text: 'GitHub sync workflow',
        filled_template: 'GitHub sync workflow',
        command_source: 'dashboard',
      }),
      expGit,
      'pending',
      'tool',
      now,
    ).run();
    notifySam(env, { subject: 'Git sync proposal pending', body: `Proposal: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId, risk_level: 'medium' });
  }

  // ── /api/agent/boot ───────────────────────────────────────────────────────
  if (path === '/api/agent/boot') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (!identity?.tenantId) return jsonResponse({ error: 'unauthenticated' }, 401);
    try {
      const batch = await env.DB.batch([
        env.DB.prepare(`SELECT id, name, role_name, mode, thinking_mode, effort FROM agentsam_ai WHERE status='active' ORDER BY sort_order, name`),
        env.DB.prepare(`SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name`),
        env.DB.prepare(`SELECT id, model_key, provider, name,
            size_class AS role,
            size_class AS cost_tier,
            input_rate_per_mtok AS input_cost_per_1m,
            output_rate_per_mtok AS output_cost_per_1m,
            context_max_tokens AS context_window,
            supports_tools AS supports_function_calling,
            supports_vision,
            0 AS supports_reasoning
          FROM agentsam_ai
          WHERE mode = 'model' AND status = 'active'
            AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
          ORDER BY provider, COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC`).bind(identity.tenantId),
        env.DB.prepare(`SELECT id, session_type, status, started_at FROM agent_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 20`),
      ]);
      return jsonResponse({ agents: batch[0]?.results||[], mcp_services: batch[1]?.results||[], models: batch[2]?.results||[], sessions: batch[3]?.results||[] });
    } catch (e) { return jsonResponse({ error: e.message }, 500); }
  }

  // ── /api/agent/conversations/search ──────────────────────────────────────
  if (path === '/api/agent/conversations/search' && method === 'GET') {
    if (!env.DB) return jsonResponse([]);
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return jsonResponse([]);
    const like = `%${q.replace(/%/g,'\\%').replace(/_/g,'\\_')}%`;
    const { results } = await env.DB.prepare(`SELECT id, COALESCE(name,title,'') as title FROM agent_conversations WHERE name LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 20`).bind(like,like).all().catch(() => ({ results: [] }));
    return jsonResponse((results||[]).map(r=>({ id: r.id, title: r.title||'New Conversation' })));
  }

  // ── /api/agent/sessions/:id/messages ─────────────────────────────────────
  const sessMessagesMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/);
  if (sessMessagesMatch && method === 'GET') {
    const convId = decodeURIComponent(sessMessagesMatch[1] || '').trim();
    if (!convId) return jsonResponse({ error: 'session id required' }, 400);
    if (env.AGENT_SESSION) {
      try {
        const doId = env.AGENT_SESSION.idFromName(convId);
        const stub = env.AGENT_SESSION.get(doId);
        const lim  = url.searchParams.get('limit') || '100';
        const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
        const rows = await resp.json().catch(() => []);
        return jsonResponse(Array.isArray(rows) ? rows : (rows.messages || []));
      } catch (_) {}
    }
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(
      `SELECT role, content, created_at FROM agent_messages
       WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 200`
    ).bind(convId).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/sessions PATCH /:id ───────────────────────────────────────
  const sessionPatchMatch = path.match(/^\/api\/agent\/sessions\/([^/]+)$/);
  if (sessionPatchMatch && method === 'PATCH') {
    const convId = sessionPatchMatch[1];
    const body   = await request.json().catch(() => ({}));
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    await env.DB.prepare(`UPDATE mcp_agent_sessions SET status = ?, last_activity = ?, updated_at = unixepoch() WHERE conversation_id = ?`).bind(String(body.status||'completed'), new Date().toISOString(), convId).run().catch(() => {});
    return jsonResponse({ success: true });
  }

  // ── /api/agent/sessions ───────────────────────────────────────────────────
  if (path === '/api/agent/sessions') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    if (method === 'POST') {
      const body   = await request.json().catch(() => ({}));
      const id     = crypto.randomUUID();
      const now    = Math.floor(Date.now() / 1000);
      const name   = (typeof body.name === 'string' && body.name.trim()) ? body.name.trim() : 'New Conversation';
      const r2Key  = `agent-sessions/${id}/context.json`;
      const sessCtx = JSON.stringify({ session_id: id, name, created_at: Date.now(), message_count: 0, messages: [] });
      if (env.R2) await env.R2.put(r2Key, sessCtx, { httpMetadata: { contentType: 'application/json' } }).catch(() => {});
      if (env.SESSION_CACHE) await env.SESSION_CACHE.put(`sess_ctx:${id}`, sessCtx, { expirationTtl: 86400 }).catch(() => {});
      await env.DB.prepare(`INSERT INTO agent_sessions (id, tenant_id, name, session_type, status, state_json, r2_key, started_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(id, tenantId, name, body.session_type||'chat', 'active', '{}', r2Key, now, now).run();
      return jsonResponse({ id, status: 'active' });
    }
    const { results } = await env.DB.prepare(`SELECT s.id, s.session_type, s.status, s.started_at, COALESCE(s.name,ac.name,ac.title,'New Conversation') as name, (SELECT COUNT(*) FROM agent_messages am WHERE am.conversation_id = s.id) as message_count FROM agent_sessions s LEFT JOIN agent_conversations ac ON ac.id = s.id WHERE s.tenant_id = ? ORDER BY s.updated_at DESC LIMIT 50`).bind(tenantId).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/workspace/:id ──────────────────────────────────────────────
  const workspaceMatch = path.match(/^\/api\/agent\/workspace\/([^/]+)$/);
  if (workspaceMatch) {
    const wsId = decodeURIComponent(workspaceMatch[1] || '').trim();
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    // ── /api/agent/workspace/:id ────────────────────────────────────────────
    // ── /api/agent/workspace/:id ────────────────────────────────────────────
    if (method === 'GET') {
      try {
        const userId = String(authUser?.id || 'anonymous').trim();
        let tid =
          authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : '';
        if (!tid) tid = (await fetchAuthUserTenantId(env, authUser.id)) || '';
        if (!tid && authUser.email) tid = (await fetchAuthUserTenantId(env, authUser.email)) || '';
        if (!tid) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
        const uwsId  = `uws:${tid}:${userId}:${wsId}`;

        // Attempt retrieval from both tables
        const [globalWs, personalWs] = await Promise.all([
          env.DB.prepare(`SELECT * FROM workspaces WHERE id = ? OR handle = ? LIMIT 1`).bind(wsId, wsId).first().catch(() => null),
          env.DB.prepare(`SELECT state_json FROM agentsam_workspace_state WHERE id = ?`).bind(uwsId).first().catch(() => null)
        ]);
        
        const row = globalWs || (personalWs ? { id: wsId, state_json: personalWs.state_json, name: 'Personal' } : null);
        if (!row) return jsonResponse({ error: 'Workspace not found' }, 404);
        
        const safeJson = (v) => { 
          if (!v) return {}; 
          if (typeof v === 'object' && v !== null) return v;
          try { return JSON.parse(v); } catch(e) { return {}; }
        };

        const stateObj = safeJson(row.state_json);
        const stateJsonStr =
          typeof row.state_json === 'string' && row.state_json.trim()
            ? row.state_json
            : JSON.stringify(stateObj || {});

        return jsonResponse({
          id: row.id,
          name: row.name || 'Workspace',
          environment: row.environment || 'local',
          status: row.status || 'active',
          settings: safeJson(row.settings_json),
          state:    stateObj,
          state_json: stateJsonStr,
        });
      } catch (e) { 
        return jsonResponse({ error: `Fetch error: ${e.message}` }, 500); 
      }
    }

    if (method === 'PUT') {
      try {
        const body    = await request.json().catch(() => ({}));
        const state   = body.state || body.state_json;
        const stateStr = typeof state === 'string' ? state : JSON.stringify(state || {});
        
        const userId = String(authUser?.id || 'anonymous').trim();
        let tid =
          authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
            ? String(authUser.tenant_id).trim()
            : '';
        if (!tid) tid = (await fetchAuthUserTenantId(env, authUser.id)) || '';
        if (!tid && authUser.email) tid = (await fetchAuthUserTenantId(env, authUser.email)) || '';
        if (!tid) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
        const uwsId  = `uws:${tid}:${userId}:${wsId}`;

        // Attempt update in both locations (idempotent for the relevant table)
        try {
          if (env.DB) {
            const results = await Promise.allSettled([
              env.DB.prepare(`UPDATE workspaces SET state_json = ?, updated_at = datetime('now') WHERE id = ?`)
                .bind(stateStr, wsId).run(),
              env.DB.prepare(`UPDATE agentsam_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`)
                .bind(stateStr, uwsId).run()
            ]);
            results.forEach((r, i) => {
              if (r.status === 'rejected') {
                console.warn('[agent] workspace update op', i, 'rejected:', r.reason);
              }
            });
            console.log('[agent] workspace update results:', results.map(r => r.status));
          }
        } catch (dbErr) {
          console.warn('[agent] non-critical workspace update failure:', dbErr.message);
        }
        
        return jsonResponse({ ok: true, id: wsId });
      } catch (e) { 
        console.error('[agent] workspace PUT error:', e.stack);
        return jsonResponse({ error: e.message }, 500); 
      }
    }

    if (method === 'POST') {
      const defaultWs =
        env?.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
          ? String(env.DEFAULT_WORKSPACE_ID).trim()
          : '';
      const isAgentsamWs = /^ws_/i.test(wsId) || (defaultWs !== '' && wsId === defaultWs);
      if (!isAgentsamWs) {
        return jsonResponse(
          { error: 'Use PUT for conversation workspace snapshots; POST merge is for ws_* workspace ids.' },
          400,
        );
      }
      try {
        const bodyPost = await request.json().catch(() => ({}));
        if (!bodyPost || typeof bodyPost !== 'object') return jsonResponse({ error: 'Invalid JSON' }, 400);
        let awsRow = null;
        try {
          awsRow = await env.DB.prepare(
            `SELECT id, state_json FROM agentsam_workspace_state WHERE workspace_id = ? OR id = ? ORDER BY updated_at DESC LIMIT 1`,
          )
            .bind(wsId, wsId)
            .first();
        } catch (_) {
          awsRow = null;
        }
        const safeJsonState = (v) => {
          if (!v) return {};
          if (typeof v === 'object' && v !== null) return v;
          try { return JSON.parse(String(v)); } catch { return {}; }
        };
        const stringifyState = (state) => (typeof state === 'string' ? state : JSON.stringify(state || {}));
        const cur = safeJsonState(awsRow?.state_json);
        const patch = {};
        for (const k of ['active_agent_slug', 'active_agent_panel', 'last_agent_action', 'agent_id']) {
          if (Object.prototype.hasOwnProperty.call(bodyPost, k) && bodyPost[k] != null) patch[k] = bodyPost[k];
        }
        const merged = { ...cur, ...patch };
        const mergedStr = stringifyState(merged);
        if (awsRow?.id) {
          await env.DB.prepare(
            `UPDATE agentsam_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`,
          )
            .bind(mergedStr, awsRow.id)
            .run();
        } else {
          const nid = `aws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          try {
            await env.DB.prepare(
              `INSERT INTO agentsam_workspace_state (id, workspace_id, state_json, updated_at) VALUES (?,?,?,unixepoch())`,
            )
              .bind(nid, wsId, mergedStr)
              .run();
          } catch (e3) {
            console.warn('[agent/workspace] agentsam POST insert', e3?.message ?? e3);
            return jsonResponse({ error: 'agentsam_workspace_state write failed' }, 503);
          }
        }
        return jsonResponse({ ok: true, id: wsId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }
  }

  // ── /api/agent/terminal/config-status ────────────────────────────────────
  if (path === '/api/agent/terminal/config-status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!authUserIsSuperadmin(authUser)) {
      return jsonResponse({
        terminal_enabled: false,
        terminal_configured: false,
      });
    }
    if (!env.DB)   return jsonResponse({ terminal_enabled: true, terminal_configured: false });
    try {
      const row = await env.DB.prepare(
        `SELECT id, tunnel_url, shell, cwd, cols, rows
         FROM terminal_sessions
         WHERE user_id = ? AND status = 'active'
           AND tunnel_url IS NOT NULL AND tunnel_url != ''
         ORDER BY updated_at DESC LIMIT 1`
      ).bind(String(authUser.id)).first().catch(() => null);
      if (!row) return jsonResponse({ terminal_enabled: true, terminal_configured: false });
      return jsonResponse({
        terminal_enabled: true,
        terminal_configured: true,
        tunnel_url: row.tunnel_url,
        shell:      row.shell || 'bash',
        cwd:        row.cwd   || '~',
        cols:       row.cols  || 220,
        rows:       row.rows  || 50,
      });
    } catch (e) {
      return jsonResponse({ terminal_enabled: true, terminal_configured: false, error: e.message });
    }
  }

  // ── /api/agent/propose ────────────────────────────────────────────────────
  if (path === '/api/agent/propose' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body        = await request.json().catch(() => ({}));
    const commandText = String(body.command_text || body.command || '').trim();
    if (!commandText) return jsonResponse({ error: 'command_text required' }, 400);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant not configured for this account' }, 403);
    const proposalId = 'prop_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    const now        = Math.floor(Date.now() / 1000);
    const expProp    = now + 86400;
    const iamOrigin  = (env.IAM_ORIGIN || '').replace(/\/$/,'');
    await env.DB.prepare(
      `INSERT INTO agentsam_approval_queue
       (id, tenant_id, workspace_id, user_id, session_id, tool_name, action_summary,
        risk_level, input_json, expires_at, status, approval_type, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      proposalId,
      tenantId,
      null,
      String(authUser.email || authUser.id || 'iam_agent').slice(0, 200),
      body.session_id || null,
      String(body.command_name || 'proposed').slice(0, 200),
      String(body.rationale || 'Agent proposed command').slice(0, 8000),
      'medium',
      JSON.stringify({
        command_text: commandText,
        filled_template: commandText,
        command_source: 'agent_generated',
      }),
      expProp,
      'pending',
      'tool',
      now,
    ).run();
    notifySam(env, { subject: `Proposal pending: ${commandText.slice(0,80)}`, body: `ID: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId });
  }

  // ── /api/agent/proposals/pending ─────────────────────────────────────────
  if (path === '/api/agent/proposals/pending' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse([]);
    const { results } = await env.DB.prepare(
      `SELECT q.id, q.tenant_id, q.session_id AS agent_session_id, q.user_id AS proposed_by,
              q.tool_name AS command_name,
              COALESCE(json_extract(q.input_json, '$.command_text'), q.action_summary) AS command_text,
              q.input_json AS filled_template, q.action_summary AS rationale, q.risk_level, q.status,
              q.created_at
       FROM agentsam_approval_queue q
       WHERE q.status = 'pending' ORDER BY q.created_at DESC`,
    ).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  const propApproveMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/approve$/);
  if (propApproveMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propApproveMatch[1];
    const row      = await env.DB.prepare(`SELECT id, tool_name AS tool FROM agentsam_approval_queue WHERE id = ?`).bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const approver = String(authUser.email || authUser.id).slice(0,200);
    const now      = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE agentsam_approval_queue SET status='approved', approved_by=?, decided_at=? WHERE id=?`,
    ).bind(approver, now, propId).run();
    return jsonResponse({ ok: true, proposal_id: propId });
  }

  const propDenyMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/deny$/);
  if (propDenyMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propDenyMatch[1];
    const body     = await request.json().catch(() => ({}));
    const row      = await env.DB.prepare(`SELECT id FROM agentsam_approval_queue WHERE id = ?`).bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const denier   = String(authUser.email || authUser.id).slice(0,200);
    const now      = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE agentsam_approval_queue SET status='denied', approved_by=?, decided_at=? WHERE id=?`,
    ).bind(denier, now, propId).run();
    return jsonResponse({ ok: true, proposal_id: propId, status: 'denied' });
  }

  // ── /api/agent/approval/pending ───────────────────────────────────────────
  if (method === 'GET' && path === '/api/agent/approval/pending') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ approval: null });
    const row = await env.DB.prepare(
      `SELECT q.id, q.tool_name, q.action_summary AS description, q.risk_level, q.input_json,
              0 AS is_mcp_server, NULL AS server_display_name,
              (SELECT COUNT(*) FROM agentsam_approval_queue WHERE status='pending') as queue_count
       FROM agentsam_approval_queue q
       WHERE q.status='pending' ORDER BY q.created_at ASC LIMIT 1`,
    ).first();
    if (!row) return jsonResponse({ approval: null });
    const input = JSON.parse(row.input_json || '{}');
    return jsonResponse({
      approval: {
        ...row,
        preview_sql: input.sql ?? null,
        preview_command: input.command ?? null,
      },
    });
  }

  // ── PATCH /api/agent/approval/:id ─────────────────────────────────────────
  const approvalMatch = path.match(/^\/api\/agent\/approval\/([^/]+)$/);
  if (method === 'PATCH' && approvalMatch) {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const { status } = await request.json().catch(() => ({}));
    if (!['approved', 'denied'].includes(status)) return jsonResponse({ error: 'invalid status' }, 400);
    await env.DB
      .prepare(`UPDATE agentsam_approval_queue SET status=?, decided_at=unixepoch(), approved_by=? WHERE id=?`)
      .bind(status, String(authUser.email || authUser.id).slice(0, 200), approvalMatch[1])
      .run();
    return jsonResponse({ ok: true });
  }

  // ── POST /api/agent/workflow/start — DAG graph executor (agentsam_workflow_*)
  if (path === '/api/agent/workflow/start' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const body = await request.json().catch(() => ({}));
    const { workflow_key: workflowKeyBody, input, trigger_type: triggerTypeBody } = body;
    if (!workflowKeyBody) return jsonResponse({ error: 'workflow_key required' }, 400);
    const { executeWorkflowGraph } = await import('../core/workflow-executor.js');
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);
    const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, {}).catch(() => null);
    const workspaceId =
      (authUser.active_workspace_id != null && String(authUser.active_workspace_id).trim() !== ''
        ? String(authUser.active_workspace_id).trim()
        : null) ||
      (wsRes && !wsRes.error && wsRes.workspaceId ? String(wsRes.workspaceId).trim() : null);
    if (!workspaceId) return jsonResponse({ error: 'no_workspace', redirect: '/onboarding' }, 403);
    const result = await executeWorkflowGraph(env, {
      workflowKey: String(workflowKeyBody).trim(),
      input: input || {},
      tenantId,
      workspaceId,
      userId: authUser.id,
      userEmail: authUser.email,
      triggerType: triggerTypeBody,
    });
    return jsonResponse(result);
  }

  // ── POST /api/agent/workflow/approve — resume workflow after approval_gate
  if (path === '/api/agent/workflow/approve' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const body = await request.json().catch(() => ({}));
    const { approval_id: approvalId, decision } = body;
    if (!approvalId) return jsonResponse({ error: 'approval_id required' }, 400);
    if (!['approved', 'rejected'].includes(decision)) {
      return jsonResponse({ error: 'decision must be approved or rejected' }, 400);
    }
    if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);

    const statusDb = decision === 'approved' ? 'approved' : 'denied';

    const updated = await env.DB.prepare(
      `UPDATE agentsam_approval_queue
       SET status      = ?,
           approved_by = ?,
           decided_at  = unixepoch()
       WHERE id = ? AND status = 'pending'`,
    )
      .bind(statusDb, authUser.id, approvalId)
      .run()
      .catch(() => null);

    const changes = updated?.meta?.changes ?? updated?.changes ?? 0;
    if (!changes) {
      return jsonResponse({ error: 'approval not found or already decided' }, 404);
    }

    const apRow = await env.DB.prepare(`SELECT workflow_run_id FROM agentsam_approval_queue WHERE id = ?`)
      .bind(approvalId)
      .first()
      .catch(() => null);

    if (apRow?.workflow_run_id && decision === 'approved') {
      await env.DB.prepare(
        `UPDATE agentsam_workflow_runs
         SET status = 'running', updated_at = datetime('now')
         WHERE id = ? AND status = 'awaiting_approval'`,
      )
        .bind(apRow.workflow_run_id)
        .run()
        .catch(() => null);
    }

    if (apRow?.workflow_run_id && decision === 'rejected') {
      await env.DB.prepare(
        `UPDATE agentsam_workflow_runs
         SET status = 'failed', kill_reason = 'approval_rejected', updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(apRow.workflow_run_id)
        .run()
        .catch(() => null);
    }

    return jsonResponse({
      ok: true,
      decision,
      approval_id: approvalId,
      run_id: apRow?.workflow_run_id ?? null,
      message:
        decision === 'approved'
          ? 'Approved. Workflow will resume on next heartbeat.'
          : 'Rejected. Workflow run marked failed.',
    });
  }

  // ── /api/agent/workflows/trigger ─────────────────────────────────────────
  if (path === '/api/agent/workflows/trigger' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const body         = await request.json().catch(() => ({}));
    const workflowName = String(body.workflow_name || '').trim();
    if (!workflowName) return jsonResponse({ error: 'workflow_name required' }, 400);
    let tenantId =
      authUser.tenant_id != null && String(authUser.tenant_id).trim() !== ''
        ? String(authUser.tenant_id).trim()
        : null;
    if (!tenantId) tenantId = await fetchAuthUserTenantId(env, authUser.id);
    if (!tenantId && authUser.email) tenantId = await fetchAuthUserTenantId(env, authUser.email);
    if (!tenantId) return jsonResponse({ error: 'Tenant could not be resolved' }, 403);
    const runId        = 'wfr_' + crypto.randomUUID().replace(/-/g,'').slice(0,16);
    await env.DB.prepare(`INSERT INTO workflow_runs (id, tenant_id, workflow_id, workflow_name, trigger_source, triggered_by, status, input_data, created_at, updated_at) VALUES (?,?,?,?,'api','iam_agent','pending',?,datetime('now'),datetime('now'))`).bind(runId, tenantId, body.workflow_id||null, workflowName, body.input_data ? JSON.stringify(body.input_data) : null).run();
    return jsonResponse({ ok: true, run_id: runId, status: 'pending' });
  }

  // ── /api/agent/rag/query ──────────────────────────────────────────────────
  if (path === '/api/agent/rag/query' && method === 'POST') {
    const body  = await request.json().catch(() => ({}));
    const query = (body.query || body.q || '').trim();
    if (!query) return jsonResponse({ error: 'query required', matches: [], results: [], count: 0 }, 400);
    const out = await unifiedRagSearch(env, query, { topK: body.top_k || 8 });
    return jsonResponse({ matches: out.matches||[], results: out.results||[], count: out.count||0 });
  }

  // ── /api/agent/workers-ai/image ───────────────────────────────────────────
  if (path === '/api/agent/workers-ai/image' && method === 'POST') {
    if (!env.AI) return jsonResponse({ error: 'Workers AI not configured' }, 503);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (!identity?.tenantId) return jsonResponse({ error: 'unauthenticated' }, 401);
    const body   = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);
    let modelRow = await env.DB.prepare(
      `SELECT model_key FROM agentsam_ai
       WHERE mode = 'model' AND status = 'active'
         AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
         AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         AND (
           LOWER(COALESCE(name, '')) LIKE '%image%'
           OR LOWER(model_key) LIKE '%flux%'
         )
       ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    )
      .bind(identity.tenantId)
      .first()
      .catch(() => null);
    let model = modelRow?.model_key;
    if (!model) {
      modelRow = await env.DB.prepare(
        `SELECT model_key FROM agentsam_ai
         WHERE mode = 'model' AND status = 'active'
           AND (is_global = 1 OR allowed_tenants_json LIKE ('%"' || ? || '"%'))
           AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
         LIMIT 1`,
      )
        .bind(identity.tenantId)
        .first()
        .catch(() => null);
      model = modelRow?.model_key;
    }
    if (!model) return jsonResponse({ error: 'No active Workers AI image model in agentsam_ai' }, 503);
    try {
      const result = await env.AI.run(model, { prompt });
      const bytes  = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/do-history ─────────────────────────────────────────────────
  if (path === '/api/agent/do-history' && method === 'GET') {
    if (!identity?.userId) return jsonResponse({ error: 'unauthenticated' }, 401);
    const convId = url.searchParams.get('conversation_id');
    if (!convId) return jsonResponse({ error: 'conversation_id required' }, 400);
    if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);
    const doId = env.AGENT_SESSION.idFromName(String(convId));
    const stub = env.AGENT_SESSION.get(doId);
    const lim  = url.searchParams.get('limit') || '50';
    const resp = await stub.fetch(new Request(`https://do/history?limit=${encodeURIComponent(lim)}`));
    return new Response(resp.body, { status: resp.status, headers: { 'Content-Type': 'application/json' } });
  }

  // ── /api/agent/telemetry ──────────────────────────────────────────────────
  if (path === '/api/agent/telemetry') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT provider, SUM(tokens_in) as total_input, SUM(tokens_out) as total_output, COUNT(*) as total_calls FROM agentsam_usage_events WHERE created_at > unixepoch('now','-7 days') GROUP BY provider`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/cicd ───────────────────────────────────────────────────────
  if (path === '/api/agent/cicd') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT r.id, r.worker_name, r.environment, r.status, r.git_branch, r.git_commit_sha, r.queued_at, r.completed_at, COUNT(e.id) AS activity_count FROM cicd_runs r LEFT JOIN cicd_events e ON e.webhook_event_id = r.id GROUP BY r.id ORDER BY r.queued_at DESC LIMIT 50`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/mcp ────────────────────────────────────────────────────────
  if (path === '/api/agent/mcp') {
    if (!env.DB) return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  // ── /api/agent/bootstrap ──────────────────────────────────────────────────
  if (path === '/api/agent/bootstrap' && method === 'GET') {
    if (!identity) return jsonResponse({ error: 'unauthenticated' }, 401);
    return handleAgentBootstrapRequest(request, env, ctx, identity);
  }

  // ── /api/agent/chat ───────────────────────────────────────────────────────
  if (path === '/api/agent/chat' && method === 'POST') {
    const ingestBypass = isIngestSecretAuthorized(request, env);
    return agentChatSseHandler(env, request, ctx, { ingestBypass, identity });
  }

  return jsonResponse({ error: 'Agent route not found', path }, 404);
}

export async function handleAgentRequest(request, env, ctx, _authUser = null) {
  const url = new URL(request.url);
  return handleAgentApi(request, url, env, ctx);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function handleAgentBootstrapRequest(request, env, ctx, identity) {
  try {
    const userId   = identity?.userId || 'system';
    const cacheKey = `bootstrap_${userId}`;
    if (env.DB) {
      const cached = await env.DB.prepare(`SELECT compiled_context FROM ai_compiled_context_cache WHERE context_hash = ? AND (expires_at IS NULL OR expires_at > unixepoch())`).bind(cacheKey).first().catch(() => null);
      if (cached?.compiled_context) {
        return new Response(cached.compiled_context, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
      }
    }
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let dailyLog = '', yesterdayLog = '', schemaMemory = '', todayTodo = '';
    if (env.R2) {
      const fetchR2 = async k => { const o = await env.R2.get(k); return o ? await o.text() : ''; };
      [dailyLog, yesterdayLog, schemaMemory, todayTodo] = await Promise.all([
        fetchR2(`memory/daily/${today}.md`),
        fetchR2(`memory/daily/${yesterday}.md`),
        fetchR2('memory/schema-and-records.md'),
        fetchR2('memory/today-todo.md'),
      ]);
    }
    if (!todayTodo && env.DB) {
      const row = await env.DB.prepare(`SELECT value FROM agentsam_memory WHERE key = 'today_todo' AND tenant_id = ?`).bind(identity?.tenantId || null).first().catch(() => null);
      if (row?.value) todayTodo = String(row.value);
    }
    const context = { daily_log: dailyLog || null, yesterday_log: yesterdayLog || null, schema_and_records_memory: schemaMemory || null, today_todo: todayTodo || null, date: today };
    if (env.DB && ctx?.waitUntil) {
      ctx.waitUntil(
        env.DB.prepare(`INSERT INTO ai_compiled_context_cache (id, context_hash, context_type, compiled_context, source_context_ids_json, token_count, tenant_id, created_at, last_accessed_at, expires_at) VALUES (?,?,'bootstrap',?,'[]',0,?,unixepoch(),unixepoch(),unixepoch()+1800) ON CONFLICT(context_hash) DO UPDATE SET compiled_context=excluded.compiled_context, expires_at=excluded.expires_at, last_accessed_at=unixepoch()`).bind(cacheKey, cacheKey, JSON.stringify(context), identity?.tenantId || null).run().catch(() => {})
      );
    }
    return jsonResponse(context);
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
