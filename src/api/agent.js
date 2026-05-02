/**
 * API Layer: Agent Sam Reasoning Engine
 * Handles all /api/agent/* routes.
 *
 * Key notes:
 *  - Canonical production catalog: D1 ai_models only (routing, picker metadata, pricing, dispatch).
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
import { formatRelativeCheckedAgo, toUnixSeconds }     from './workspaces.js';
import { notifySam }                                    from '../core/notifications.js';
import { getAgentMetadata, logSkillInvocation,
         getActivePromptByWeight, getPromptMetadata }   from './agentsam.js';
import { runBuiltinTool }                               from '../tools/ai-dispatch.js';
import { getDefaultModelForTask, scheduleRoutingArmBanditUpdate } from '../core/routing.js';
import { scheduleAgentsamCommandRunInsert }                   from './command-run-telemetry.js';

const WRITE_LIKE_PREFIXES = ['d1_', 'worker_', 'resend_', 'meshyai_'];
const TERM_WRITE_TOOLS = new Set(['terminal_execute', 'run_command', 'bash']);

/** Registry ids in `agent_prompts.id` — content always loaded from D1. */
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

/** Minimal fallback if D1 has no core row (same intent as legacy single-line base). */
const FALLBACK_CORE_SYSTEM = 'You are Agent Sam, an autonomous AI coding and operations assistant for Inner Animal Media.';

async function buildSystemPrompt(env, tenantId, mode, contextBlock, modeConfig) {
  const rows = await env.DB.prepare(`
    SELECT id, prompt_kind, content
    FROM agent_prompts
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

function inferIntentHeuristically(lastMessageText) {
  const text = String(lastMessageText || '').trim();
  if (!text) return 'question';
  const low = text.toLowerCase();
  const hasSql = /\b(select|insert|update|delete|upsert|create|drop|alter|truncate|from|where|join)\b/.test(low) ||
                 /\bd1_|sql\b/.test(low);
  const hasShell = /\b(run|execute|terminal|shell|bash|zsh|npm|pnpm|yarn|git|ls|cd|cat|pwd|chmod|curl)\b/.test(low);
  if (hasSql && hasShell) return 'mixed';
  if (hasSql) return 'sql';
  if (hasShell) return 'shell';
  return 'question';
}

async function classifyIntent(_env, lastMessageText) {
  const intent = inferIntentHeuristically(lastMessageText);
  return { intent };
}

async function loadToolsForRequest(env, modeSlug, _intent, opts = {}) {
  const lim = Math.max(1, Math.min(200, Number(opts.limit || 20) || 20));
  if (!env.DB) return { tools: [] };
  const policy = await loadModeToolPolicy(env, modeSlug);
  const { results } = await env.DB.prepare(
    `SELECT tool_name, description, input_schema, tool_category, requires_approval
     FROM mcp_registered_tools
     WHERE enabled = 1
     ORDER BY tool_name
     LIMIT ?`
  ).bind(lim).all().catch(() => ({ results: [] }));
  let rows = Array.isArray(results) ? results : [];
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

function inferRiskLevel(toolName, category = '') {
  const t = String(toolName || '').toLowerCase();
  const c = String(category || '').toLowerCase();
  if (WRITE_LIKE_PREFIXES.some((p) => t.startsWith(p))) return 'high';
  if (TERM_WRITE_TOOLS.has(t)) return 'high';
  if (c === 'terminal' || c === 'deploy') return 'high';
  if (c === 'd1' || c === 'r2') return 'medium';
  return 'low';
}

async function validateToolCall(env, modeSlug, toolName) {
  const name = String(toolName || '').trim();
  if (!name) return { allowed: false, reason: 'missing tool name', riskLevel: 'blocked', requiresConfirmation: false };
  const policy = await loadModeToolPolicy(env, modeSlug);
  if (policy.denyTools.includes(name)) {
    return { allowed: false, reason: 'blocked by mode policy', riskLevel: 'blocked', requiresConfirmation: false };
  }
  if (policy.allowTools.length && !policy.allowTools.includes(name)) {
    return { allowed: false, reason: 'not in mode allowlist', riskLevel: 'blocked', requiresConfirmation: false };
  }
  let row = null;
  if (env.DB) {
    row = await env.DB.prepare(
      'SELECT tool_name, tool_category, requires_approval, enabled FROM mcp_registered_tools WHERE tool_name = ? LIMIT 1'
    ).bind(name).first().catch(() => null);
    if (row && Number(row.enabled || 0) !== 1) {
      return { allowed: false, reason: 'tool disabled', riskLevel: 'blocked', requiresConfirmation: false };
    }
  }
  const riskLevel = inferRiskLevel(name, row?.tool_category);
  const requiresConfirmation =
    Number(row?.requires_approval || 0) === 1 ||
    policy.requireApprovalTools.includes(name) ||
    riskLevel === 'high';
  return { allowed: true, reason: 'allowed', riskLevel, requiresConfirmation };
}

async function dispatchToolCall(env, toolName, input, context = {}) {
  const params = {
    ...(input && typeof input === 'object' ? input : {}),
    session: context,
    session_id: context.sessionId || input?.session_id || null,
    tenant_id: context.tenantId || input?.tenant_id || null,
    user_id: context.userId || input?.user_id || null,
  };
  const out = await runBuiltinTool(env, toolName, params);
  if (out && typeof out === 'object' && out.error) {
    throw new Error(typeof out.error === 'string' ? out.error : JSON.stringify(out.error));
  }
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

async function loadUserPolicy(env, userId, workspaceId = '') {
  const defaults = { auto_run_mode: 'allowlist', mcp_tools_protection: 1, file_deletion_protection: 1, external_file_protection: 1 };
  if (!env.DB || !userId) return defaults;
  try {
    const row = await env.DB.prepare(
      `SELECT auto_run_mode, mcp_tools_protection, file_deletion_protection, external_file_protection
       FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1`
    ).bind(userId, workspaceId || '').first();
    return row || defaults;
  } catch (_) { return defaults; }
}

async function resolveDefaultModel(env) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT model_key FROM ai_models
       WHERE COALESCE(is_active, 1) = 1
         AND COALESCE(supports_tools, 0) = 1
         AND LOWER(COALESCE(api_platform, '')) != 'workers_ai'
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    ).first();
    if (row?.model_key) return row.model_key;
    const fb = await env.DB.prepare(
      `SELECT model_key FROM ai_models
       WHERE COALESCE(is_active, 1) = 1 AND COALESCE(supports_tools, 0) = 1
       ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC LIMIT 1`,
    ).first();
    return fb?.model_key || null;
  } catch (_) {
    return null;
  }
}

const AI_MODEL_ROW_SQL = `id, provider, model_key, api_platform, secret_key_name,
  supports_tools, metadata_json, COALESCE(is_active, 1) AS is_active`;

async function resolveAiModelRowById(env, id) {
  if (!env.DB || id == null || id === '') return null;
  try {
    return await env.DB.prepare(
      `SELECT ${AI_MODEL_ROW_SQL}
       FROM ai_models WHERE id = ? AND COALESCE(is_active, 0) = 1 LIMIT 1`,
    ).bind(id).first();
  } catch (_) {
    return null;
  }
}

function metadataObject(row) {
  return parseJsonSafe(row?.metadata_json, {}) || {};
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

async function resolveAiModelFromRequest(env, body) {
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
  if (!env.DB) return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
  try {
    if (rawId) {
      const row = await env.DB.prepare(
        `SELECT ${AI_MODEL_ROW_SQL} FROM ai_models WHERE id = ? LIMIT 1`,
      )
        .bind(rawId)
        .first();
      if (row && Number(row.is_active) !== 0) {
        return { row, rawRequestedKey: rawKey || row.model_key, rawRequestedId: rawId };
      }
    }
    if (rawKey) {
      const row = await env.DB.prepare(
        `SELECT ${AI_MODEL_ROW_SQL} FROM ai_models WHERE model_key = ? AND COALESCE(is_active, 0) = 1 LIMIT 1`,
      )
        .bind(rawKey)
        .first();
      if (row) return { row, rawRequestedKey: rawKey, rawRequestedId: rawId || null };
    }
  } catch (_) {
    /* fallthrough */
  }
  return { row: null, rawRequestedKey: rawKey || null, rawRequestedId: rawId || null };
}

function normalizeGateParseFailure(originalMessage) {
  return { intent: 'auto', rewritten_query: originalMessage, confidence: 0 };
}

async function gateRewriteAndClassify(env, modeConfig, message) {
  const gateId = modeConfig?.gate_model ?? null;
  const gateMeta = await resolveAiModelRowById(env, gateId);
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

async function loadIntentPattern(env, intentSlug) {
  if (!env.DB || !intentSlug) return null;
  try {
    return await env.DB.prepare(
      `SELECT workflow_agent, tools_json FROM agent_intent_patterns
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

async function loadLastResortModels(env, opts = {}) {
  if (!env.DB) return [];
  const requireTools = !!opts.requireTools;
  try {
    let sql = `SELECT ${AI_MODEL_ROW_SQL}
       FROM ai_models WHERE COALESCE(is_active, 1) = 1`;
    if (requireTools) sql += ` AND COALESCE(supports_tools, 0) = 1`;
    sql += ` ORDER BY COALESCE(input_rate_per_mtok, 999999) ASC LIMIT 8`;
    const { results } = await env.DB.prepare(sql).all();
    return results || [];
  } catch (_) {
    return [];
  }
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

async function createApprovalRequest(env, opts) {
  const { tenantId, sessionId, userId, toolName, toolArgs, toolCallId, riskLevel, rationale } = opts;
  const proposalId  = 'prop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const toolCallRow = 'mtc_'  + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const now         = Math.floor(Date.now() / 1000);
  const expiresAt   = now + 3600;
  if (!env.DB) return proposalId;
  const argsStr = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs || {});
  try {
    await env.DB.prepare(
      `INSERT INTO agent_command_proposals
       (id, tenant_id, agent_session_id, proposed_by, command_source, command_name,
        command_text, filled_template, rationale, risk_level, tool, status,
        requires_confirmation, expires_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`
    ).bind(
      proposalId, tenantId, sessionId, 'agent-sam', 'agent_generated',
      toolName, `${toolName}(${argsStr.slice(0, 500)})`, argsStr,
      rationale || `Tool call requires approval: ${toolName}`,
      riskLevel || 'medium', toolName, 'pending', expiresAt, now, now
    ).run();
    await env.DB.prepare(
      `INSERT INTO mcp_tool_calls
       (id, tenant_id, session_id, tool_name, tool_category, input_schema,
        status, approval_gate_id, invoked_by, invoked_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,'awaiting_approval',?,?,datetime('now'),datetime('now'),datetime('now'))`
    ).bind(
      toolCallRow, tenantId, sessionId, toolName, 'builtin',
      argsStr.slice(0, 10000), proposalId, userId || 'agent-sam', toolCallId || null
    ).run().catch(() => {});
  } catch (e) { console.warn('[agent] createApprovalRequest:', e?.message); }
  return proposalId;
}

async function auditToolDecision(env, opts) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agent_audit_log (id, tenant_id, actor_role_id, event_type, message, metadata_json)
       VALUES (?, ?, 'agent-sam', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), opts.tenantId || 'system', opts.eventType, opts.message,
      JSON.stringify({ tool: opts.toolName, reason: opts.reason, risk: opts.riskLevel })
    ).run();
  } catch (_) {}
}

// ─── SSE Tool Loop ────────────────────────────────────────────────────────────

async function runAgentToolLoop(env, ctx, emit, params) {
  const {
    messages, tools, systemPrompt, modelKey,
    temperature, maxToolCalls,
    mode, modeConfig, userPolicy,
    sessionId, tenantId, userId,
    routingTaskType,
  } = params;

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
      // Provider resolved inside dispatchStream from ai_models.api_platform (Workers AI → OAI-shaped SSE).
      stream = await dispatchStream(env, null, {
        modelKey,
        systemPrompt,
        messages: conversationMessages,
        tools,
        reasoningEffort: modeConfig?.gate_reasoning_effort || null,
        temperature,
      });
      isWorkersAiStream = false;
    } catch (e) {
      if (String(e?.message || '') === OLLAMA_SKIP_MESSAGE) throw e;
      console.warn('[agent] model call failed:', e?.message ?? e);
      scheduleRoutingArmBanditUpdate(env, ctx, {
        taskType: routingTaskType || 'auto',
        mode: mode || 'ask',
        modelKey,
        success: false,
        costUsd: 0,
        durationMs: Date.now() - modelT0,
      });
      emit('error', { message: 'Model call failed' });
      break;
    }

    const pendingToolCalls = [];
    let stopReason = null, turnUsage = null;
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
        scheduleRoutingArmBanditUpdate(env, ctx, {
          taskType: routingTaskType || 'auto',
          mode: mode || 'ask',
          modelKey,
          success: false,
          costUsd: 0,
          durationMs: Date.now() - modelT0,
        });
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
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_start') {
          if (chunk.content_block?.type === 'thinking') emit('thinking_start', {});
          if (chunk.content_block?.type === 'tool_use') {
            pendingToolCalls.push({ id: chunk.content_block.id, name: chunk.content_block.name, _args: '' });
            assistantContent.push({ type: 'tool_use', id: chunk.content_block.id, name: chunk.content_block.name, input: {} });
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
            const blk = assistantContent.find(b => b.type === 'tool_use' && b.id === call.id);
            if (blk) blk.input = call.input;
          }
        }
        if (chunk.type === 'message_start' && chunk.message?.id) emit('id', { id: chunk.message.id });
        if (chunk.type === 'message_delta') {
          if (chunk.usage) turnUsage = chunk.usage;
          if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
        }
      }
    }

    scheduleRoutingArmBanditUpdate(env, ctx, {
      taskType: routingTaskType || 'auto',
      mode: mode || 'ask',
      modelKey,
      success: true,
      costUsd: 0,
      durationMs: Date.now() - modelT0,
    });

    if (turnUsage) {
      totalUsage.input_tokens                += turnUsage.input_tokens                || 0;
      totalUsage.output_tokens               += turnUsage.output_tokens               || 0;
      totalUsage.cache_read_input_tokens     += turnUsage.cache_read_input_tokens     || 0;
      totalUsage.cache_creation_input_tokens += turnUsage.cache_creation_input_tokens || 0;
    }

    conversationMessages.push({ role: 'assistant', content: assistantContent });
    if (!pendingToolCalls.length || stopReason === 'end_turn') break;

    const toolResults = [];
    for (const call of pendingToolCalls) {
      if (toolCallsUsed >= maxToolCalls) {
        emit('tool_blocked', { tool: call.name, reason: 'max_tool_calls_reached' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: 'Tool call limit reached.' });
        continue;
      }
      const validation = await validateToolCall(env, mode, call.name);
      if (!validation.allowed) {
        await auditToolDecision(env, { tenantId, toolName: call.name, eventType: 'tool_blocked', message: `Blocked: ${call.name} — ${validation.reason}`, riskLevel: 'blocked', reason: validation.reason });
        emit('tool_blocked', { tool: call.name, reason: validation.reason });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Tool not available in ${mode} mode: ${validation.reason}` });
        continue;
      }
      if (needsApproval(validation, modeConfig, userPolicy)) {
        const proposalId = await createApprovalRequest(env, { tenantId, sessionId, userId, toolName: call.name, toolArgs: call.input, toolCallId: call.id, riskLevel: validation.riskLevel, rationale: `Agent requested ${call.name} (${validation.riskLevel} risk)` });
        notifySam(env, { subject: `Approval required: ${call.name}`, body: `Tool: ${call.name}\nRisk: ${validation.riskLevel}\nArgs: ${JSON.stringify(call.input||{}).slice(0,500)}\n\nApprove: ${(env.IAM_ORIGIN||'').replace(/\/$/,'')}/dashboard/overview?proposal=${proposalId}`, category: 'approval' }).catch(() => {});
        emit('approval_required', { proposal_id: proposalId, tool_name: call.name, tool_args: call.input, risk_level: validation.riskLevel, message: 'This action requires your approval.' });
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: `Awaiting approval (proposal_id: ${proposalId}).` });
        continue;
      }
      toolCallsUsed++;
      executedToolNames.push(call.name);
      emit('tool_call', { tool: call.name, args: call.input });
      await auditToolDecision(env, { tenantId, toolName: call.name, eventType: 'tool_executed', message: `Executing: ${call.name}`, riskLevel: validation.riskLevel, reason: 'allowed' });
      let toolOutput = '';
      try {
        const execResult = await dispatchToolCall(env, call.name, call.input, { sessionId, tenantId, userId });
        toolOutput = typeof execResult === 'string' ? execResult : JSON.stringify(execResult);
      } catch (e) {
        toolOutput = `Tool execution failed: ${e.message}`;
        console.warn('[agent] tool_error', call.name, e?.message ?? e);
      emit('tool_error', { tool: call.name, error: 'Tool execution failed' });
      }
      emit('tool_result', { tool: call.name, output: toolOutput.slice(0, 2000) });
      toolResults.push({ type: 'tool_result', tool_use_id: call.id, content: toolOutput });
      if (env.DB) {
        env.DB.prepare(
          `INSERT OR IGNORE INTO mcp_tool_calls
           (id, tenant_id, session_id, tool_name, tool_category, input_schema,
            output, status, invoked_by, invoked_at, completed_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,'completed',?,datetime('now'),datetime('now'),datetime('now'),datetime('now'))`
        ).bind('mtc_' + crypto.randomUUID().replace(/-/g,'').slice(0,16), tenantId, sessionId, call.name, 'builtin', JSON.stringify(call.input||{}), toolOutput.slice(0,50000), userId||'agent-sam').run().catch(() => {});
      }
    }
    if (toolResults.length) conversationMessages.push({ role: 'user', content: toolResults });
    if (stopReason === 'end_turn') break;
  }

  if (totalUsage.input_tokens || totalUsage.output_tokens) {
    ctx.waitUntil?.(writeTelemetry(env, {
      sessionId, tenantId, provider: 'anthropic', model: modelKey,
      inputTokens: totalUsage.input_tokens, outputTokens: totalUsage.output_tokens,
      cacheReadTokens: totalUsage.cache_read_input_tokens,
      cacheWriteTokens: totalUsage.cache_creation_input_tokens,
      toolCallCount: toolCallsUsed, success: true,
    }));
  }

  emit('done', { tool_calls_used: toolCallsUsed, turns: turnCount });
  return {
    totalUsage,
    toolCallsUsed,
    executedToolNames,
    modelKey,
  };
}

// ─── SSE Chat Handler ─────────────────────────────────────────────────────────

export async function agentChatSseHandler(env, request, ctx, session) {
  const contentType = request.headers.get('content-type') || '';
  let body = {};
  
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    // Attach files if any
    const files = formData.getAll('files');
    if (files.length) body.files = files;
  } else {
    body = await request.json().catch(() => ({}));
  }

  const message = (body.message || '').trim();
  if (!message) return jsonResponse({ error: 'message required' }, 400);

  const sessionId     = body.conversationId || body.session_id || body.sessionId || null;
  const requestedMode = String(body.mode || 'auto').toLowerCase().trim() || 'auto';
  let tenantId = session?.tenant_id != null && String(session.tenant_id).trim() !== ''
    ? String(session.tenant_id).trim()
    : null;
  if (!tenantId && session?.user_id) {
    tenantId = await fetchAuthUserTenantId(env, session.user_id);
  }
  const userId        = session?.user_id || null;
  const workspaceId   = body.workspace_id || session?.workspace_id || env.WORKSPACE_ID || '';

  const [modeConfig, userPolicy, agentMeta] = await Promise.all([
    loadModeConfig(env, requestedMode),
    loadUserPolicy(env, userId, workspaceId),
    body.agentId ? getAgentMetadata(env, body.agentId) : Promise.resolve(null),
  ]);

  kickoffModelTierMigration(env, ctx);

  const gate = await gateRewriteAndClassify(env, modeConfig, message);
  const intentSlug = String(gate.intent || 'auto').toLowerCase().trim() || 'auto';
  const intentPattern = await loadIntentPattern(env, intentSlug);

  const { tools: dbTools } = await loadToolsForRequest(env, requestedMode, intentSlug, { limit: modeConfig.max_tool_calls || 20, includeSchemas: true });
  let tools = dbTools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema || { type: 'object', properties: {} } }));
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
  } = await resolveAiModelFromRequest(env, body);

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

  const isAutoModel = !explicitRow;

  let routingPick = null;
  try {
    routingPick = await getDefaultModelForTask(env, { taskKey: intentSlug, tenantId });
  } catch (_) {
    routingPick = null;
  }
  const thompsonRow =
    routingPick?.source === 'thompson' && routingPick?.modelId
      ? await resolveAiModelRowById(env, routingPick.modelId)
      : null;

  const primaryRow = await resolveAiModelRowById(env, modeConfig?.model_preference ?? null);
  const escalationRow = await resolveAiModelRowById(env, modeConfig?.escalation_model ?? null);
  const lastResort = await loadLastResortModels(env, { requireTools });
  let poolRows = dedupeModelsByKey(
    [...(thompsonRow ? [thompsonRow] : []), primaryRow, escalationRow, ...(lastResort || [])].filter(Boolean),
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

  const fallbackModelKeys = chainRows.map((r) => r.model_key).filter(Boolean);
  if (!fallbackModelKeys.length) {
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

  const ragResult    = await unifiedRagSearch(env, message, {
    topK: modeConfig.context_strategy === 'minimal' ? 3 : 8,
    tenantId,
  });
  const ragContext   = (ragResult.matches || []).join('\n\n');
  const contextBlock = ragContext ? `\n\nRelevant context:\n${ragContext}` : '';

  const basePrompt = agentMeta?.system_prompt || FALLBACK_CORE_SYSTEM;
  const legacySystemPrompt = () =>
    basePrompt
    + (modeConfig.system_prompt_fragment ? `\n\n${modeConfig.system_prompt_fragment}` : '')
    + contextBlock;

  let systemPrompt = legacySystemPrompt();
  if (env.DB) {
    try {
      systemPrompt = await buildSystemPrompt(env, tenantId, requestedMode, contextBlock, modeConfig);
    } catch (e) {
      console.warn('[agent] buildSystemPrompt fallback', e?.message ?? e);
      systemPrompt = legacySystemPrompt();
    }
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
  });

  ;(async () => {
    const chatT0 = Date.now();
    try {
      const tried = [];
      const startIdx = (confidence < escalationThreshold && fallbackModelKeys.length > 1) ? 1 : 0;
      let succeeded = false;
      let lastLoopStats = null;

      for (let i = startIdx; i < chainRows.length; i++) {
        const row = chainRows[i];
        const modelKey = row?.model_key;
        if (!modelKey) continue;
        tried.push(modelKey);
        try {
          let textEmitted = 0;
          const emitWrapped = (type, payload) => {
            if (type === 'text' && payload?.text) textEmitted += String(payload.text).length;
            emit(type, payload);
          };
          lastLoopStats = await withTimeout(
            runAgentToolLoop(env, ctx, emitWrapped, {
              messages: body.messages || [{ role: 'user', content: gate.rewritten_query || message }],
              tools, systemPrompt, modelKey,
              temperature:  modeConfig.temperature || 0.7,
              maxToolCalls: modeConfig.max_tool_calls || 20,
              mode: requestedMode, modeConfig, userPolicy,
              sessionId, tenantId, userId,
              routingTaskType: intentSlug,
            }),
            15000
          );
          if (textEmitted <= 0) throw new Error('empty_stream');
          succeeded = true;
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
          }
        }
      }

      if (!succeeded) {
        let finalKey = '';
        const prefStr = String(modeConfig?.model_preference_key || '').trim();
        if (prefStr) finalKey = prefStr;
        if (!finalKey && modeConfig?.gate_model) {
          const gateRow = await resolveAiModelRowById(env, modeConfig.gate_model);
          if (gateRow?.model_key) finalKey = gateRow.model_key;
        }
        const alreadyTried = new Set(tried);
        if (finalKey && !alreadyTried.has(finalKey)) {
          tried.push(finalKey);
          console.log('[agent] routing_model', JSON.stringify({ final_fallback: finalKey }));
          try {
            let textEmitted = 0;
            const emitWrapped = (type, payload) => {
              if (type === 'text' && payload?.text) textEmitted += String(payload.text).length;
              emit(type, payload);
            };
            lastLoopStats = await withTimeout(
              runAgentToolLoop(env, ctx, emitWrapped, {
                messages: body.messages || [{ role: 'user', content: gate.rewritten_query || message }],
                tools, systemPrompt, modelKey: finalKey,
                temperature:  modeConfig.temperature || 0.7,
                maxToolCalls: modeConfig.max_tool_calls || 20,
                mode: requestedMode, modeConfig, userPolicy,
                sessionId, tenantId, userId,
                routingTaskType: intentSlug,
              }),
              15000
            );
            if (textEmitted > 0) succeeded = true;
          } catch (e) {
            console.warn('[agent] final fallback failed:', { model_key: finalKey, error: e?.message });
          }
        }
      }

      if (!succeeded) {
        emit('error', { message: 'All providers exhausted', tried });
      }

      scheduleAgentsamCommandRunInsert(env, ctx, {
        workspaceId: String(workspaceId || '').trim(),
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
        goal: null,
        contextTokenEstimate:
          (lastLoopStats?.totalUsage?.input_tokens ?? 0) +
          (lastLoopStats?.totalUsage?.output_tokens ?? 0),
      });
    } catch (e) {
      console.warn('[agent] Agent loop failed', e?.message ?? e);
      emit('error', { message: 'Agent loop failed' });
      scheduleAgentsamCommandRunInsert(env, ctx, {
        workspaceId: String(workspaceId || '').trim(),
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
        goal: null,
        contextTokenEstimate: 0,
      });
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

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function handleAgentApi(request, url, env, ctx) {
  const path   = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  // GET /api/agent/tools — combined tool exposure (builtin + registered MCP)
  if (path === '/api/agent/tools' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    const tools = [];
    try {
      const a = await env.DB.prepare(
        `SELECT name, description, category, handler_type, is_active, risk_level
         FROM agentsam_tools
         WHERE COALESCE(is_active, 0) = 1
         ORDER BY category ASC, name ASC
         LIMIT 500`,
      ).all().catch(() => ({ results: [] }));
      for (const r of a.results || []) {
        if (!r) continue;
        tools.push({
          name: String(r.name || ''),
          description: String(r.description || ''),
          category: String(r.category || 'builtin'),
          handler_type: String(r.handler_type || 'builtin'),
          is_active: 1,
          risk_level: String(r.risk_level || 'low'),
        });
      }
    } catch (_) {}

    try {
      const m = await env.DB.prepare(
        `SELECT tool_name, description, tool_category, enabled, requires_approval
         FROM mcp_registered_tools
         WHERE COALESCE(enabled,0) = 1
         ORDER BY tool_name ASC
         LIMIT 500`,
      ).all().catch(() => ({ results: [] }));
      for (const r of m.results || []) {
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

  // ── /api/agent/models — canonical ai_models rows (picker + routing metadata)
  if (path === '/api/agent/models') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
    const showInPicker = url.searchParams.get('show_in_picker') === '1';
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, display_name AS name, provider, model_key, api_platform, show_in_picker,
                picker_eligible, picker_group,
                input_rate_per_mtok, output_rate_per_mtok, sort_order, context_max_tokens,
                size_class, supports_tools, supports_vision
         FROM ai_models
         WHERE COALESCE(is_active, 0) = 1
           AND COALESCE(picker_eligible, 1) = 1
           ${showInPicker ? 'AND COALESCE(show_in_picker, 0) = 1' : ''}
         ORDER BY sort_order ASC, display_name ASC`,
      ).all();
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
    try { const q = await env.DB.prepare(`SELECT id, tool_name, status, error_message, session_id, created_at FROM mcp_tool_calls WHERE lower(COALESCE(status,'')) IN ('error','failed') OR (error_message IS NOT NULL AND length(trim(error_message)) > 0) ORDER BY created_at DESC LIMIT 50`).all(); mcp_tool_errors = q.results || []; } catch (_) {}
    try { const q = await env.DB.prepare(`SELECT id, event_type, message, created_at, metadata_json FROM agent_audit_log WHERE lower(COALESCE(event_type,'')) LIKE '%fail%' OR lower(COALESCE(event_type,'')) LIKE '%error%' OR lower(COALESCE(event_type,'')) LIKE '%denied%' ORDER BY created_at DESC LIMIT 25`).all(); audit_failures = q.results || []; } catch (_) {}
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
      env.DB.prepare(`SELECT id, name FROM ai_workflow_pipelines ORDER BY COALESCE(name,id) LIMIT 100`).all().then(r => { workflows = r.results||[]; }),
      tenantId ? env.DB.prepare(`SELECT slug, name, category FROM agent_commands WHERE tenant_id = ? AND COALESCE(status,'active')='active' ORDER BY category, name LIMIT 200`).bind(tenantId).all().then(r => { commands = r.results||[]; }) : Promise.resolve(),
      tenantId ? env.DB.prepare(`SELECT key FROM agent_memory_index WHERE tenant_id = ? ORDER BY COALESCE(importance_score,0) DESC LIMIT 150`).bind(tenantId).all().then(r => { memory_keys = (r.results||[]).map(x=>x.key); }) : Promise.resolve(),
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
    const { results } = await env.DB.prepare(`SELECT key, memory_type, importance_score FROM agent_memory_index WHERE tenant_id = ? ORDER BY COALESCE(importance_score,0) DESC LIMIT 200`).bind(tenantId).all().catch(() => ({ results: [] }));
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
    await env.DB.prepare(`INSERT INTO agent_command_proposals (id, tenant_id, agent_session_id, proposed_by, command_source, command_name, command_text, filled_template, rationale, risk_level, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(proposalId, tenantId, body.session_id||null, proposedBy, 'dashboard', 'git_sync_workflow', 'GitHub sync workflow', 'GitHub sync workflow', 'User requested Git sync from dashboard.', 'medium', 'pending', now, now).run();
    notifySam(env, { subject: 'Git sync proposal pending', body: `Proposal: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId, risk_level: 'medium' });
  }

  // ── /api/agent/boot ───────────────────────────────────────────────────────
  if (path === '/api/agent/boot') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const batch = await env.DB.batch([
        env.DB.prepare(`SELECT id, name, role_name, mode, thinking_mode, effort FROM agentsam_ai WHERE status='active' ORDER BY sort_order, name`),
        env.DB.prepare(`SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name`),
        env.DB.prepare(`SELECT id, model_key, provider, display_name,
            size_class AS role,
            size_class AS cost_tier,
            input_rate_per_mtok AS input_cost_per_1m,
            output_rate_per_mtok AS output_cost_per_1m,
            context_max_tokens AS context_window,
            supports_tools AS supports_function_calling,
            supports_vision,
            0 AS supports_reasoning
          FROM ai_models
          WHERE COALESCE(is_active, 1) = 1
          ORDER BY provider, COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC`),
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
          env.DB.prepare(`SELECT state_json FROM agent_workspace_state WHERE id = ?`).bind(uwsId).first().catch(() => null)
        ]);
        
        const row = globalWs || (personalWs ? { id: wsId, state_json: personalWs.state_json, name: 'Personal' } : null);
        if (!row) return jsonResponse({ error: 'Workspace not found' }, 404);
        
        const safeJson = (v) => { 
          if (!v) return {}; 
          if (typeof v === 'object' && v !== null) return v;
          try { return JSON.parse(v); } catch(e) { return {}; }
        };

        return jsonResponse({
          id: row.id,
          name: row.name || 'Workspace',
          environment: row.environment || 'local',
          status: row.status || 'active',
          settings: safeJson(row.settings_json),
          state:    safeJson(row.state_json)
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
              env.DB.prepare(`UPDATE agent_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?`)
                .bind(stateStr, uwsId).run()
            ]);
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
    const iamOrigin  = (env.IAM_ORIGIN || '').replace(/\/$/,'');
    await env.DB.prepare(`INSERT INTO agent_command_proposals (id, tenant_id, agent_session_id, proposed_by, command_source, command_name, command_text, filled_template, rationale, risk_level, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(proposalId, tenantId, body.session_id||null, 'agent-sam', 'agent_generated', String(body.command_name||'proposed').slice(0,200), commandText, commandText, String(body.rationale||'Agent proposed command').slice(0,8000), 'medium', 'pending', now, now).run();
    notifySam(env, { subject: `Proposal pending: ${commandText.slice(0,80)}`, body: `ID: ${proposalId}\nApprove: ${iamOrigin}/dashboard/overview?proposal=${proposalId}`, category: 'proposal' }, ctx);
    return jsonResponse({ ok: true, proposal_id: proposalId });
  }

  // ── /api/agent/proposals/pending ─────────────────────────────────────────
  if (path === '/api/agent/proposals/pending' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse([]);
    const { results } = await env.DB.prepare(`SELECT * FROM agent_command_proposals WHERE status = 'pending' ORDER BY created_at DESC`).all().catch(() => ({ results: [] }));
    return jsonResponse(results || []);
  }

  const propApproveMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/approve$/);
  if (propApproveMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propApproveMatch[1];
    const row      = await env.DB.prepare(`SELECT id, tool FROM agent_command_proposals WHERE id = ?`).bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const approver = String(authUser.email || authUser.id).slice(0,200);
    const now      = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`UPDATE agent_command_proposals SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?`).bind(approver, now, now, propId).run();
    return jsonResponse({ ok: true, proposal_id: propId });
  }

  const propDenyMatch = path.match(/^\/api\/agent\/proposals\/([^/]+)\/deny$/);
  if (propDenyMatch && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    if (!env.DB)   return jsonResponse({ error: 'DB not configured' }, 503);
    const propId   = propDenyMatch[1];
    const body     = await request.json().catch(() => ({}));
    const row      = await env.DB.prepare(`SELECT id FROM agent_command_proposals WHERE id = ?`).bind(propId).first();
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    const denier   = String(authUser.email || authUser.id).slice(0,200);
    const now      = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`UPDATE agent_command_proposals SET status='denied', denied_by=?, denied_at=?, denial_reason=?, updated_at=? WHERE id=?`).bind(denier, now, String(body.denial_reason||'').slice(0,4000), now, propId).run();
    return jsonResponse({ ok: true, proposal_id: propId, status: 'denied' });
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
    await env.DB.prepare(`INSERT INTO workflow_runs (id, tenant_id, workflow_id, workflow_name, trigger_source, triggered_by, status, input_data, created_at, updated_at) VALUES (?,?,?,?,'api','agent-sam','pending',?,datetime('now'),datetime('now'))`).bind(runId, tenantId, body.workflow_id||null, workflowName, body.input_data ? JSON.stringify(body.input_data) : null).run();
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
    const body   = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);
    let modelRow = await env.DB.prepare(
      `SELECT model_key FROM ai_models
       WHERE COALESCE(is_active, 1) = 1
         AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         AND (
           LOWER(COALESCE(display_name, '')) LIKE '%image%'
           OR LOWER(model_key) LIKE '%flux%'
         )
       ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
       LIMIT 1`,
    )
      .first()
      .catch(() => null);
    let model = modelRow?.model_key;
    if (!model) {
      modelRow = await env.DB.prepare(
        `SELECT model_key FROM ai_models
         WHERE COALESCE(is_active, 1) = 1
           AND LOWER(COALESCE(api_platform, '')) = 'workers_ai'
         ORDER BY COALESCE(sort_order, 999), COALESCE(input_rate_per_mtok, 999999) ASC
         LIMIT 1`,
      )
        .first()
        .catch(() => null);
      model = modelRow?.model_key;
    }
    if (!model) return jsonResponse({ error: 'No active Workers AI image model in ai_models' }, 503);
    try {
      const result = await env.AI.run(model, { prompt });
      const bytes  = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
      return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
    } catch (e) { return jsonResponse({ error: e?.message }, 500); }
  }

  // ── /api/agent/do-history ─────────────────────────────────────────────────
  if (path === '/api/agent/do-history' && method === 'GET') {
    const session = await getSession(env, request).catch(() => null);
    if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
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
    const { results } = await env.DB.prepare(`SELECT provider, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as total_calls FROM agent_telemetry WHERE created_at > unixepoch('now','-7 days') GROUP BY provider`).all().catch(() => ({ results: [] }));
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
    const session = await getSession(env, request).catch(() => null);
    return handleAgentBootstrapRequest(request, env, ctx, session);
  }

  // ── /api/agent/chat ───────────────────────────────────────────────────────
  if (path === '/api/agent/chat' && method === 'POST') {
    const ingestBypass = isIngestSecretAuthorized(request, env);
    let session = null;
    if (!ingestBypass) {
      session = await getSession(env, request);
      if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return agentChatSseHandler(env, request, ctx, session);
  }

  return jsonResponse({ error: 'Agent route not found', path }, 404);
}

export async function handleAgentRequest(request, env, ctx, _authUser = null) {
  const url = new URL(request.url);
  return handleAgentApi(request, url, env, ctx);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function handleAgentBootstrapRequest(request, env, ctx, session) {
  try {
    const userId   = session?.user_id || 'system';
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
      const row = await env.DB.prepare(`SELECT value FROM agent_memory_index WHERE key = 'today_todo' AND tenant_id = ?`).bind(session?.tenant_id || 'system').first().catch(() => null);
      if (row?.value) todayTodo = String(row.value);
    }
    const context = { daily_log: dailyLog || null, yesterday_log: yesterdayLog || null, schema_and_records_memory: schemaMemory || null, today_todo: todayTodo || null, date: today };
    if (env.DB && ctx?.waitUntil) {
      ctx.waitUntil(
        env.DB.prepare(`INSERT INTO ai_compiled_context_cache (id, context_hash, context_type, compiled_context, source_context_ids_json, token_count, tenant_id, created_at, last_accessed_at, expires_at) VALUES (?,?,'bootstrap',?,'[]',0,?,unixepoch(),unixepoch(),unixepoch()+1800) ON CONFLICT(context_hash) DO UPDATE SET compiled_context=excluded.compiled_context, expires_at=excluded.expires_at, last_accessed_at=unixepoch()`).bind(cacheKey, cacheKey, JSON.stringify(context), session?.tenant_id || 'system').run().catch(() => {})
      );
    }
    return jsonResponse(context);
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}
