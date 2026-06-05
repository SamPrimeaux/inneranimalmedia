import { authUserFromRequest, platformTenantIdFromEnv } from './auth.js';
import { resolveEffectiveWorkspaceId } from './bootstrap.js';
import { scheduleToolCallLog } from './agentsam-ops-ledger.js';
import { scheduleAgentsamErrorLog } from './agentsam-error-log.js';
import { logPromptCacheUsage } from './prompt-cache-economics.js';
import {
  isReadOnlyFileContextIntent,
  messageExplicitlyRequestsBrowserInspection,
} from './code-implementation-intent.js';
import { messageHasBrowserUrlNavigation } from '../api/agent/classify-intent.js';
import { appendTriggeredRulesToSystemPrompt } from './agent-skills-rules.js';

const AGENT_SAM_PYTHON_PARALLEL_BLOCK = `You are a Python professional. When a task involves data processing, scripting, automation, analysis, or any computation that Python handles well, use python_execute without being asked. You write clean, well-commented Python — proper imports at the top, error handling with try/except, f-strings for formatting, and type hints for function signatures. You know the standard library deeply (pathlib, json, csv, datetime, itertools, collections) and reach for pandas, requests, or other packages when they make the solution cleaner. You never apologize for using Python — you use it because it is the right tool.

For maximum efficiency, whenever you perform multiple independent operations, invoke all relevant tools simultaneously rather than sequentially. When reading multiple files, checking multiple endpoints, or running independent lookups, call all tools in parallel. Err on the side of more parallel tool calls rather than fewer sequential ones.`;

const FALLBACK_CORE_SYSTEM = 'You are Agent Sam, an autonomous AI coding and operations assistant for Inner Animal Media.';

const TENANT_SHINSHU = 'tenant_jake_waalk';

const TENANT_KNOWLEDGE_PLATFORM = 'tenant_knowledge_platform';

export function inferArtifactFromAssistantText(text) {
  if (!text || typeof text !== 'string' || !text.includes('```')) return null;
  const m = text.match(/```([\w+#.-]*)/);
  const rawLang = m && m[1] ? String(m[1]).toLowerCase().replace(/^language-/, '') : '';
  let artifact_type = 'other';
  if (rawLang.includes('html')) artifact_type = 'html';
  else if (rawLang === 'js' || rawLang === 'javascript') artifact_type = 'js';
  else if (rawLang === 'ts' || rawLang === 'typescript' || rawLang === 'tsx') artifact_type = 'tsx';
  else if (rawLang === 'css') artifact_type = 'css';
  else if (rawLang === 'json') artifact_type = 'json';
  else if (rawLang === 'sql') artifact_type = 'sql';
  const name =
    rawLang && rawLang.length > 0 && rawLang.length < 80 ? rawLang : 'untitled';
  return { artifact_type, name };
}

export function extractLastAssistantPlainText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    const c = m.content;
    if (typeof c === 'string') return c.trim();
    if (Array.isArray(c)) {
      return c
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim();
    }
  }
  return '';
}

export function scheduleAgentsamArtifactFromChatOutput(env, ctx, opts) {
  if (!env?.DB || !ctx?.waitUntil) return;
  const { outputText, userId, tenantId, workspaceId, sourceAgentRunId, sourceSessionId } = opts;
  const meta = inferArtifactFromAssistantText(outputText || '');
  if (!meta) return;
  const uid = userId != null ? String(userId).trim() : '';
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!uid || !tid || !ws) return;

  ctx.waitUntil(
    (async () => {
      try {
        const { extractFencedArtifactContent, writeWorkspaceArtifact } = await import(
          '../core/artifact-r2-store.js'
        );
        const content = extractFencedArtifactContent(outputText || '');
        if (!content) return;
        const out = await writeWorkspaceArtifact(env, ctx, {
          userId: uid,
          tenantId: tid,
          workspaceId: ws,
          content,
          artifactType: meta.artifact_type,
          name: meta.name,
          source: 'agent_response',
          sourceRunId: sourceAgentRunId ?? null,
          sourceSessionId: sourceSessionId ?? null,
          origin: env?.IAM_ORIGIN ?? null,
        });
        if (!out.ok) {
          console.error('[agentsam_artifacts]', out.user_message || out.error);
        }
      } catch (e) {
        console.warn('[agentsam_artifacts]', e?.message ?? e);
      }
    })(),
  );
}

export function scheduleAgentsamToolCallLog(env, ctx, fields) {
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
    agent_run_id,
    agentRunId,
    conversation_id,
    conversationId,
    routingArmId,
    routing_arm_id,
  } = fields;
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : '';
  const ws =
    workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : '';
  if (!tid || !ws) return;
  let stat = 'success';
  if (status === 'error') stat = 'error';
  else if (status === 'timeout') stat = 'timeout';
  else if (status === 'blocked') stat = 'blocked';
  else if (status === 'pending') stat = 'pending';
  const summary = String(inputSummary ?? '').slice(0, 200);
  const errMsg = errorMessage != null ? String(errorMessage).slice(0, 8000) : null;
  const correlationId = `tcl_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  scheduleToolCallLog(env, ctx, {
    tenantId,
    workspaceId,
    sessionId,
    toolName,
    status: stat,
    durationMs,
    costUsd,
    inputTokens,
    outputTokens,
    userId,
    errorMessage: errMsg,
    inputSummary: summary,
    tool_key: fields.tool_key,
    capability_key: fields.capability_key,
    handler_key: fields.handler_key,
    route_key: fields.route_key,
    agentsam_tools_id: fields.agentsam_tools_id,
    mcp_server_id: fields.mcp_server_id,
    server_key: fields.server_key,
    approval_id: fields.approval_id,
    policy_decision_json: fields.policy_decision_json,
    agent_run_id: agent_run_id ?? agentRunId,
    conversation_id: conversation_id ?? conversationId ?? sessionId,
    routing_arm_id: routing_arm_id ?? routingArmId ?? null,
  });
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

/** Maps validateToolCall result into agentsam_tool_call_log identity columns (D1 PRAGMA-filtered insert). */
export function toolLogFieldsFromValidation(validation) {
  if (!validation || typeof validation !== 'object') return {};
  const v = /** @type {Record<string, unknown>} */ (validation);
  const policy = {
    allowed: v.allowed === true,
    reason: v.reason ?? null,
    riskLevel: v.riskLevel ?? null,
    requiresConfirmation: v.requiresConfirmation === true,
  };
  /** @type {Record<string, unknown>} */
  const out = {
    tool_key: v.toolKey != null ? String(v.toolKey) : undefined,
    capability_key: v.capabilityKey != null ? String(v.capabilityKey) : undefined,
    handler_key: v.handlerKey != null ? String(v.handlerKey) : undefined,
    route_key: v.routeKey != null ? String(v.routeKey) : undefined,
    agentsam_tools_id: v.agentsamToolsId != null ? v.agentsamToolsId : undefined,
    mcp_server_id: v.mcpServerId != null ? v.mcpServerId : undefined,
    server_key: v.serverKey != null ? String(v.serverKey) : undefined,
    policy_decision_json: JSON.stringify(policy),
  };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

export async function resolveBootstrapWorkspaceIdForAgentApi(env, request, userId, cache) {
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid || !env?.DB || !request) return null;
  if (cache && cache.__iamBootWs != null) return cache.__iamBootWs;
  try {
    const authUser = await authUserFromRequest(request, env).catch(() => null);
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

/** Prefer `browser` prompt route when heuristics say browser but generic route would win. */
export async function resolvePromptRouteRowForAgentChat(env, tenantId, modeSlug, intentResult, message) {
  const promptRouteIntentSlug =
    String(intentResult?.taskType || 'auto')
      .toLowerCase()
      .trim() || 'auto';
  let row = await resolveAgentsamPromptRoute(env, tenantId, modeSlug, promptRouteIntentSlug);
  if (isReadOnlyFileContextIntent(message)) {
    const rk = String(row?.route_key || '').toLowerCase();
    if (rk === 'browser') {
      const askRow =
        (await resolveAgentsamPromptRoute(env, tenantId, modeSlug, 'ask')) ||
        (await resolveAgentsamPromptRoute(env, tenantId, modeSlug, 'chat'));
      if (askRow && String(askRow.route_key || '').toLowerCase() !== 'browser') {
        console.log(
          '[agent] prompt_route_read_only_file_override',
          JSON.stringify({ from: rk, to: askRow.route_key }),
        );
        row = askRow;
      }
    }
    return row;
  }
  const taskType = String(intentResult?.taskType || '').toLowerCase();
  const needsBrowserRoute = taskType === 'browser' || messageHasBrowserUrlNavigation(message);
  if (!needsBrowserRoute || row?.route_key === 'browser') return row;
  if (!env?.DB) return row;
  try {
    const browserRow = await env.DB.prepare(
      `SELECT r.*
       FROM agentsam_prompt_routes r
       WHERE r.route_key = 'browser'
         AND r.is_active = 1
         AND (r.tenant_id IS NULL OR r.tenant_id = ?)
       ORDER BY CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
                COALESCE(r.priority, 0) ASC
       LIMIT 1`,
    )
      .bind(tenantId != null ? String(tenantId).trim() : '')
      .first();
    if (browserRow) return browserRow;
  } catch (e) {
    console.warn('[agent] prompt_route_browser_fallback', e?.message ?? e);
  }
  return row;
}

/**
 * Match `agentsam_prompt_routes` to mode / intent (intent_labels JSON array + tenant tie-break).
 * `priority`: lower numeric value wins among otherwise-equally-specific matches (see ORDER BY).
 */
export async function resolveAgentsamPromptRoute(env, tenantId, modeSlug, intentSlug) {
  if (!env?.DB) return null;
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const mode = String(modeSlug || '').trim();
  const intent = String(intentSlug || '').trim();
  const routeByKeySql = `
      SELECT r.*
      FROM agentsam_prompt_routes r
      WHERE r.route_key = ?
        AND r.is_active = 1
        AND (r.tenant_id IS NULL OR r.tenant_id = ?)
      ORDER BY CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,
               COALESCE(r.priority, 0) ASC
      LIMIT 1
    `;
  try {
    // 1. Mode is primary — user explicitly chose this
    if (mode) {
      const modeRoute = await env.DB.prepare(routeByKeySql).bind(mode, tid).first();
      if (modeRoute) return modeRoute;
    }

    // 2. Only fall through to task_type if no mode route exists
    if (intent && intent !== mode) {
      const taskRoute = await env.DB.prepare(routeByKeySql).bind(intent, tid).first();
      if (taskRoute) return taskRoute;
    }

    return null;
  } catch (e) {
    console.warn('[agent] prompt_route', e?.message ?? e);
    return null;
  }
}

export async function fetchActivePlanContextFragment(env, tenantId, options = {}) {
  const { sessionId, planId, taskId, workspaceId } = options;
  if (!env.DB) return '';

  let activePlan = null;
  if (planId) {
    let planSql = 'SELECT * FROM agentsam_plans WHERE id = ?';
    const planBinds = [planId];
    if (tenantId) {
      planSql += ' AND tenant_id = ?';
      planBinds.push(tenantId);
    }
    if (workspaceId) {
      planSql += ' AND workspace_id = ?';
      planBinds.push(workspaceId);
    }
    planSql += ' LIMIT 1';
    activePlan = await env.DB.prepare(planSql).bind(...planBinds).first().catch(() => null);
  } else if (sessionId) {
    let planSql = `
      SELECT * FROM agentsam_plans 
      WHERE session_id = ? AND status = 'active'`;
    const planBinds = [sessionId];
    if (tenantId) {
      planSql += ' AND tenant_id = ?';
      planBinds.push(tenantId);
    }
    if (workspaceId) {
      planSql += ' AND workspace_id = ?';
      planBinds.push(workspaceId);
    }
    planSql += ' ORDER BY created_at DESC LIMIT 1';
    activePlan = await env.DB.prepare(planSql).bind(...planBinds).first().catch(() => null);
  }

  if (!activePlan) return '';

  let activeTask = null;
  if (taskId) {
    activeTask = await env.DB.prepare(
      'SELECT * FROM agentsam_plan_tasks WHERE id = ? AND plan_id = ? LIMIT 1',
    )
      .bind(taskId, activePlan.id)
      .first()
      .catch(() => null);
  } else {
    activeTask = await env.DB.prepare(`
      SELECT * FROM agentsam_plan_tasks 
      WHERE plan_id = ? AND status IN ('todo', 'in_progress')
      ORDER BY order_index ASC LIMIT 1
    `).bind(activePlan.id).first().catch(() => null);
  }

  let fragment = `\n\n## Active Plan: ${activePlan.title || 'Untitled Plan'}\n`;
  if (activePlan.session_notes) fragment += `Plan Notes: ${activePlan.session_notes}\n`;
  
  if (activeTask) {
    fragment += `\n### Current Task: ${activeTask.title}\n`;
    if (activeTask.description) fragment += `Task Description: ${activeTask.description}\n`;
    const files = parseJsonSafe(activeTask.files_involved, []);
    if (files.length) fragment += `Files involved: ${files.join(', ')}\n`;
    const tables = parseJsonSafe(activeTask.tables_involved, []);
    if (tables.length) fragment += `Tables involved: ${tables.join(', ')}\n`;
  }
  
  return fragment;
}

export function isSimpleAskMessage(message = "") {
  const s = String(message || "").trim().toLowerCase();
  if (!s || s.length > 80) return false;
  return ["hi","hello","hey","yo","sup","thanks","thank you","ok","okay","test","ping"].includes(s);
}

export async function buildSystemPrompt(env, tenantId, mode, contextBlock, modeConfig, promptRouteRow = null, options = {}) {
  const _kv = env.SESSION_CACHE ?? null;
  const _wsId = options?.workspaceId ?? '';
  const _minimal = options?.minimalAsk ? 'min' : 'full';
  const _routeKey = promptRouteRow?.route_key ?? 'default';
  const _ver = _kv ? (await _kv.get(`sp:version:${tenantId}`).catch(() => '0') ?? '0') : '0';
  const _kvKey = `sp:v1:${tenantId}:${mode}:${_wsId}:${_routeKey}:${_minimal}:${_ver}`;

  let cachedPrompt = null;
  if (_kv && !options?._skipCache) {
    try {
      const hit = await _kv.get(_kvKey);
      if (hit) cachedPrompt = hit;
    } catch (_) {}
  }

  const routeDerivedMinimal =
    promptRouteRow &&
    Number(promptRouteRow.max_tools ?? 8) === 0 &&
    Number(promptRouteRow.include_rag ?? 1) === 0 &&
    Number(promptRouteRow.include_active_plan ?? 1) === 0 &&
    Number(promptRouteRow.include_recent_memory ?? 1) === 0 &&
    Number(promptRouteRow.include_workspace_ctx ?? 1) === 0;

  const minimalAsk = Boolean(options?.minimalAsk) || Boolean(routeDerivedMinimal);

  const rulesPromptOpts = {
    workspaceId: options?.workspaceId,
    userId: options?.userId,
    message: options?.message,
  };

  const appendRulesContextBlock = async (systemPrompt) =>
    appendTriggeredRulesToSystemPrompt(env, systemPrompt, rulesPromptOpts);

  const appendProjectContextBlock = async (systemPrompt) => {
    if (minimalAsk || !options?.workspaceId) return systemPrompt;
    try {
      const { appendActiveProjectsToSystemPrompt } = await import('../core/agent-prompt-context.js');
      return appendActiveProjectsToSystemPrompt(env, systemPrompt, {
        workspaceId: options.workspaceId,
        tenantId: options.tenantId,
      });
    } catch (e) {
      console.warn('[agent] project_context inject', e?.message ?? e);
      return systemPrompt;
    }
  };

  const finalizeSystemPrompt = async (systemPrompt) => {
    let out = await appendRulesContextBlock(systemPrompt);
    out = await appendProjectContextBlock(out);
    return out;
  };

  if (cachedPrompt != null) {
    return finalizeSystemPrompt(cachedPrompt);
  }

  try {
    const layerKeys = (() => {
      if (promptRouteRow?.prompt_layer_keys) {
        try {
          const parsed = JSON.parse(promptRouteRow.prompt_layer_keys);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        } catch { /* fall through */ }
      }
      if (minimalAsk) return ['core_identity'];
      // Default layers for mode
      const base = ['core_identity', 'db_safety', 'security', 'tool_loop'];
      if (['build', 'deploy', 'agent'].includes(mode)) base.push('deploy_safety');
      if (mode === 'billing') base.push('billing');
      return base;
    })();

    // Add tenant-specific layers (skip for minimal_ask: use route layer_keys only)
    if (!minimalAsk) {
      if (tenantId === TENANT_KNOWLEDGE_PLATFORM) layerKeys.push('learning');
      if (tenantId === TENANT_SHINSHU) layerKeys.push('shinshu');
      const platformTid = platformTenantIdFromEnv(env);
      if (platformTid && tenantId && tenantId !== platformTid) layerKeys.push('client_work');
    }

    if (!minimalAsk && !layerKeys.includes('company_no_emojis')) layerKeys.push('company_no_emojis');

    // Pipeline flags from promptRouteRow
    const includeActivePlan  = Number(promptRouteRow?.include_active_plan  ?? 1) === 1;
    const includeWorkspace   = Number(promptRouteRow?.include_workspace_ctx ?? 1) === 1;

    // Load all needed prompt versions in one query (tenant_id NULL = global rows; tenant match may override per key in map below)
    const placeholders = layerKeys.map(() => '?').join(', ');
    const rows = await env.DB.prepare(`
      SELECT prompt_key, body
      FROM agentsam_prompt_versions
      WHERE is_active = 1
        AND prompt_key IN (${placeholders})
        AND (tenant_id IS NULL OR tenant_id = ?)
      ORDER BY CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END DESC
    `).bind(...layerKeys, tenantId || '').all().catch(() => ({ results: [] }));

    const byKey = Object.fromEntries((rows.results || []).map(r => [r.prompt_key, r.body]));

    // Assemble in layer order
    const parts = layerKeys
      .map(k => byKey[k])
      .filter(Boolean);

    if (!parts.length) parts.push(FALLBACK_CORE_SYSTEM);

    // Inject Plan & Task Context if enabled by route or requested by options
    if (!minimalAsk && includeActivePlan && env.DB) {
      const planWs =
        options.workspaceId ||
        (await resolveBootstrapWorkspaceIdForAgentApi(
          env,
          options.request ?? null,
          options.userId,
          options.cache,
        ));
      const planContext = await fetchActivePlanContextFragment(env, tenantId, {
        ...options,
        workspaceId: planWs,
      });
      if (planContext) parts.push(planContext);
    }

    if (!minimalAsk && (includeActivePlan || (Number(promptRouteRow?.max_tools ?? 8) > 0))) {
      parts.push(AGENT_SAM_PYTHON_PARALLEL_BLOCK);
    }

    if (!minimalAsk && modeConfig?.system_prompt_fragment) parts.push(modeConfig.system_prompt_fragment);
    if (!minimalAsk && includeWorkspace && contextBlock) parts.push(contextBlock);

    let result = parts.join('\n\n---\n\n');

    // Workspace session digest (cache-miss path only; not stored in KV — stays fresh per build)
    if (!minimalAsk && options?.workspaceId && env.DB) {
      try {
        const wsDigest = String(options.workspaceId).trim();
        if (wsDigest) {
          const digest = await env.DB.prepare(
            `SELECT digest_text FROM agentsam_context_digest
             WHERE workspace_id = ? AND digest_type = 'session'
             ORDER BY created_at DESC LIMIT 1`,
          )
            .bind(wsDigest)
            .first();
          if (digest?.digest_text?.trim()) {
            result += `\n## Workspace Context\n${digest.digest_text.trim()}\n`;
          }
        }
      } catch {
        /* non-fatal */
      }
    }

    if (_kv) _kv.put(_kvKey, parts.join('\n\n---\n\n'), { expirationTtl: 300 }).catch(() => {});

    // Fire-and-forget prompt cache tracking
    if (env.DB && layerKeys.length) {
      void logPromptCacheUsage(env, tenantId, layerKeys, promptRouteRow?.route_key, options?.provider ?? null, options?.modelKey ?? null).catch(() => {});
    }

    return finalizeSystemPrompt(result);
  } catch (e) {
    console.warn('[agent] buildSystemPrompt failed:', e?.message);
    const fallback = FALLBACK_CORE_SYSTEM + (!minimalAsk && contextBlock ? `\n\n${contextBlock}` : '');
    return finalizeSystemPrompt(fallback);
  }
}

export function projectIdFromEnv(env) {
  const candidates = [env?.PROJECT_ID, env?.WORKER_NAME, env?.CLOUDFLARE_WORKER_NAME];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return 'inneranimalmedia';
}

export function parseJsonSafe(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

