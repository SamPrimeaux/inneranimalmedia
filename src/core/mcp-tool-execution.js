/**
 * Unified MCP / builtin tool execution ledger (agentsam_mcp_tool_execution).
 * Inserts bind every table column explicitly (no reliance on D1 defaults).
 */

import { scheduleMirrorToolCallEventToSupabase } from './hyperdrive-write.js';
import { recordSpan } from './tracer.js';
import { resolveCanonicalUserId } from '../api/auth.js';
import { pickRunSpineIds } from './run-spine-ids.js';
import { loadAgentsamToolPolicyKeySet } from './agentsam-tool-policy-keys.js';
import { scheduleToolCallLog } from './agentsam-ops-ledger.js';
import { fireForgetAgentToolChainRow } from '../api/command-run-telemetry.js';

/** SHA-256 hex of canonical JSON for tool-cache keys (Workers Web Crypto). */
export async function hashToolInputJson(obj) {
  try {
    const raw =
      typeof obj === 'string'
        ? obj
        : JSON.stringify(obj === undefined ? {} : obj === null ? null : obj);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

const NON_CACHEABLE_TOOLS_FALLBACK = new Set([
  'terminal_execute',
  'deploy',
  'r2_delete',
  'd1_write',
  'excalidraw_plan_map_create',
]);

async function toolExecutionIsCacheable(env, toolName) {
  const n = String(toolName || '').trim();
  if (!n) return false;
  const deny = await loadAgentsamToolPolicyKeySet(env, 'non_cacheable', NON_CACHEABLE_TOOLS_FALLBACK);
  if (deny.has(n)) return false;
  return true;
}

/**
 * @param {any} env
 * @param {{ workspaceId?: string | null, tenantId?: string | null, toolName: string, toolInput: unknown }} o
 * @returns {Promise<{ hit: false } | { hit: true, value: unknown }>}
 */
export async function tryReadAgentsamToolCache(env, o) {
  if (!env?.DB || !(await toolExecutionIsCacheable(env, o?.toolName))) return { hit: false };
  const ws =
    o.workspaceId != null && String(o.workspaceId).trim() !== ''
      ? String(o.workspaceId).trim()
      : '';
  if (!ws) return { hit: false };
  const tenantId =
    o.tenantId != null && String(o.tenantId).trim() !== '' ? String(o.tenantId).trim() : null;
  const toolName = String(o.toolName || '').trim();
  const { buildMcpToolCacheKey } = await import('./tool-cache-key.js');
  const cacheKey = await buildMcpToolCacheKey(ws, toolName, o.toolInput ?? {});
  if (!cacheKey) return { hit: false };
  try {
    const cached = await env.DB.prepare(
      `SELECT output_json FROM agentsam_tool_cache
       WHERE cache_key = ?
         AND workspace_id = ?
         AND (expires_at IS NULL OR expires_at > datetime('now'))
       LIMIT 1`,
    )
      .bind(cacheKey, ws)
      .first();
    const out = cached?.output_json != null ? String(cached.output_json) : '';
    if (!out) return { hit: false };
    await env.DB
      .prepare(
        `UPDATE agentsam_tool_cache SET hit_count = COALESCE(hit_count, 0) + 1,
         last_used_at = datetime('now'), updated_at = datetime('now')
         WHERE cache_key = ? AND workspace_id = ?`,
      )
      .bind(cacheKey, ws)
      .run()
      .catch(() => {});
    return { hit: true, value: JSON.parse(out) };
  } catch {
    return { hit: false };
  }
}

/**
 * @param {any} env
 * @param {{
 *   workspaceId?: string | null,
 *   tenantId?: string | null,
 *   toolName: string,
 *   toolInput: unknown,
 *   toolOutput: unknown,
 *   durationMs?: number,
 *   execErr?: unknown,
 * }} o
 */
export async function writeAgentsamToolCacheAfterSuccess(env, o) {
  if (!env?.DB || !(await toolExecutionIsCacheable(env, o?.toolName))) return;
  if (o?.execErr) return;
  const ws =
    o.workspaceId != null && String(o.workspaceId).trim() !== ''
      ? String(o.workspaceId).trim()
      : '';
  if (!ws) return;
  const tenantId =
    o.tenantId != null && String(o.tenantId).trim() !== '' ? String(o.tenantId).trim() : null;
  const toolName = String(o.toolName || '').trim();
  const { buildMcpToolCacheKey } = await import('./tool-cache-key.js');
  const cacheKey = await buildMcpToolCacheKey(ws, toolName, o.toolInput ?? {});
  if (!cacheKey) return;
  const inputHash = await hashToolInputJson(o.toolInput ?? {});
  const inputJson = JSON.stringify(o.toolInput ?? {}).slice(0, 4000);
  const outputJson = JSON.stringify(o.toolOutput ?? null).slice(0, 10000);
  const durationMs = Math.max(0, Math.floor(Number(o.durationMs) || 0));
  try {
    await env.DB.prepare(`DELETE FROM agentsam_tool_cache WHERE cache_key = ?`).bind(cacheKey).run();
    await env.DB
      .prepare(
        `INSERT INTO agentsam_tool_cache
         (id, workspace_id, tenant_id, tool_key, cache_key, input_hash, input_json, output_json,
          execution_ms, expires_at, cache_strategy, hit_count, created_at, updated_at)
         VALUES ('tc_'||lower(hex(randomblob(8))),?,?,?,?,?,?,?,?,datetime('now','+1 hour'),'ttl',0,datetime('now'),datetime('now'))`,
      )
      .bind(ws, tenantId, toolName, cacheKey, inputHash, inputJson, outputJson, durationMs)
      .run();
  } catch (e) {
    console.warn('[agentsam_tool_cache] write', e?.message ?? e);
  }
}

const MCP_EXEC_TABLE = 'agentsam_mcp_tool_execution';

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} tableName
 * @returns {Promise<{ name: string, nameLower: string, type: string, notnull: boolean }[]>}
 */
async function pragmaTableColumns(db, tableName) {
  if (!db || !tableName) return [];
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(tableName)) ? String(tableName) : '';
  if (!safe) return [];
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return (results || []).map((r) => ({
      name: String(r.name),
      nameLower: String(r.name).toLowerCase(),
      type: String(r.type || ''),
      notnull: Number(r.notnull) === 1,
    }));
  } catch {
    return [];
  }
}

/**
 * @param {{ type: string, nameLower: string, notnull: boolean }} col
 * @param {unknown} value
 */
function coerceForColumn(col, value) {
  if (value === null || value === undefined) {
    const t = col.type.toUpperCase();
    if (t.includes('INT')) return col.notnull ? 0 : null;
    if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return col.notnull ? 0 : null;
    return col.notnull ? '' : null;
  }
  const t = col.type.toUpperCase();
  if (t.includes('INT')) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? n : 0;
  }
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return String(value);
}

/**
 * @param {{ type: string, nameLower: string, notnull: boolean }} col
 */
function defaultForMcpExecColumn(col) {
  const n = col.nameLower;
  const t = col.type.toUpperCase();
  if (n === 'created_at') {
    return new Date().toISOString();
  }
  if (n === 'input_json' || n === 'output_json') return '{}';
  if (n === 'policy_decision_json' || n === 'error_detail_json') return '{}';
  if ((n === 'duration_ms' || n === 'latency_ms') && !col.notnull) return null;
  if (t.includes('INT')) return 0;
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 0;
  if (col.notnull) return '';
  return null;
}

/**
 * @param {Record<string, unknown>} fields
 * @param {string} id
 * @returns {Record<string, unknown>}
 */
function normalizeMcpExecutionFields(fields, id) {
  const f = fields && typeof fields === 'object' ? fields : {};
  const pick = (snake, ...alts) => {
    if (f[snake] !== undefined) return f[snake];
    for (const a of alts) {
      if (f[a] !== undefined) return f[a];
    }
    return undefined;
  };

  const errRaw = pick('error_message', 'errorMessage', 'error');
  const errStr = errRaw != null ? String(errRaw).slice(0, 8000) : null;
  let successInt;
  if (pick('success') !== undefined) successInt = pick('success') ? 1 : 0;
  else if (errStr) successInt = 0;
  else successInt = String(pick('status') || '').toLowerCase() === 'error' ? 0 : 1;

  const inputRaw = pick('input_json', 'inputJson', 'input', 'toolArgs');
  const inputJson =
    inputRaw !== undefined
      ? typeof inputRaw === 'string'
        ? inputRaw
        : JSON.stringify(inputRaw ?? {})
      : undefined;

  const outputRaw = pick('output_json', 'outputJson', 'output');
  const outputJson =
    outputRaw !== undefined
      ? typeof outputRaw === 'string'
        ? outputRaw
        : JSON.stringify(outputRaw ?? null)
      : undefined;

  const userId =
    pick('user_id', 'userId', 'invoked_by', 'invokedBy') != null
      ? String(pick('user_id', 'userId', 'invoked_by', 'invokedBy')).trim() || null
      : null;

  const spine = pickRunSpineIds(f);

  const out = {
    id,
    tool_id: pick('tool_id', 'toolId'),
    agentsam_tools_id: pick('agentsam_tools_id', 'agentsamToolsId'),
    tool_name: pick('tool_name', 'toolName'),
    tool_key: pick('tool_key', 'toolKey'),
    tenant_id: pick('tenant_id', 'tenantId'),
    workspace_id: pick('workspace_id', 'workspaceId'),
    user_id: userId,
    person_uuid: pick('person_uuid', 'personUuid'),
    session_id: pick('session_id', 'sessionId'),
    agent_run_id: spine.agent_run_id,
    conversation_id: spine.conversation_id,
    agent_id: pick('agent_id', 'agentId'),
    workflow_id: pick('workflow_id', 'workflowId'),
    input_json: inputJson,
    output_json: outputJson,
    success: successInt,
    error_message: errStr,
    duration_ms: pick('duration_ms', 'durationMs'),
    cost_usd: pick('cost_usd', 'costUsd'),
    input_tokens: pick('input_tokens', 'inputTokens'),
    output_tokens: pick('output_tokens', 'outputTokens'),
    retry_count: pick('retry_count', 'retryCount'),
    requires_approval: pick('requires_approval', 'requiresApproval'),
    status: pick('status'),
    tool_chain_id: pick('tool_chain_id', 'toolChainId'),
    timed_out: pick('timed_out', 'timedOut'),
    sla_breach: pick('sla_breach', 'slaBreach'),
    timeout_ms: pick('timeout_ms', 'timeoutMs'),
    invoked_by: pick('invoked_by', 'invokedBy'),
    latency_ms: pick('latency_ms', 'latencyMs'),
    request_args_json: pick('request_args_json', 'requestArgsJson'),
    action_type: pick('action_type', 'actionType'),
    resource_type: pick('resource_type', 'resourceType'),
    resource_id: pick('resource_id', 'resourceId'),
    actor_type: pick('actor_type', 'actorType'),
    actor_source: pick('actor_source', 'actorSource'),
    policy_decision_json: pick('policy_decision_json', 'policyDecisionJson'),
    denial_code: pick('denial_code', 'denialCode'),
    error_code: pick('error_code', 'errorCode'),
    error_family: pick('error_family', 'errorFamily'),
    error_detail_json: pick('error_detail_json', 'errorDetailJson'),
    error_log_id: pick('error_log_id', 'errorLogId'),
    created_at: pick('created_at', 'createdAt'),
  };

  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

function newExecId() {
  return `mtc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/** Stable id for correlating fire-and-forget execution rows with tool_chain (generate before scheduling). */
export function newMcpToolExecutionId() {
  return newExecId();
}

/**
 * Non-blocking agentsam_mcp_tool_execution insert — prefer for hot paths with ExecutionContext.
 * @returns {string} execution id (same id passed to D1 insert when insert succeeds)
 */
export function scheduleRecordMcpToolExecution(env, ctx, fields) {
  const id =
    fields?.id != null && String(fields.id).trim() !== ''
      ? String(fields.id).trim()
      : newMcpToolExecutionId();
  const merged = { ...fields, id };
  const p = recordMcpToolExecution(env, merged)
    .then((execId) => {
      const succ =
        merged.success !== undefined
          ? !!merged.success
          : !merged.error_message && String(merged.status || '').toLowerCase() !== 'error';
      const ws =
        merged.workspace_id != null && String(merged.workspace_id).trim() !== ''
          ? String(merged.workspace_id).trim()
          : '';
      const tid =
        merged.tenant_id != null && String(merged.tenant_id).trim() !== ''
          ? String(merged.tenant_id).trim()
          : '';
      const uid =
        merged.user_id != null && String(merged.user_id).trim() !== ''
          ? String(merged.user_id).trim()
          : '';
      if (execId && tid && ws) {
        scheduleToolCallLog(env, ctx, {
          tenantId: tid,
          workspaceId: ws,
          userId: uid || undefined,
          sessionId: merged.session_id ?? merged.sessionId ?? null,
          agentRunId: merged.agent_run_id ?? merged.agentRunId ?? null,
          conversationId: merged.conversation_id ?? merged.conversationId ?? null,
          toolName: merged.tool_name || merged.tool_key || 'unknown',
          toolKey: merged.tool_key ?? merged.tool_name ?? undefined,
          agentsamToolsId: merged.agentsam_tools_id ?? merged.agentsamToolsId ?? undefined,
          status: succ ? 'success' : 'error',
          durationMs: Math.max(0, Math.floor(Number(merged.duration_ms ?? merged.latency_ms) || 0)),
          costUsd: Number(merged.cost_usd) || 0,
          inputTokens: Number(merged.input_tokens) || 0,
          outputTokens: Number(merged.output_tokens) || 0,
          errorMessage: merged.error_message ?? merged.errorMessage ?? null,
          inputJson: merged.input_json ?? merged.inputJson,
          outputJson: merged.output_json ?? merged.outputJson,
          policyDecisionJson: merged.policy_decision_json ?? merged.policyDecisionJson,
          toolCategory: 'mcp',
          agentId: merged.agent_id ?? merged.agentId ?? undefined,
          sourceTool: merged.source_tool ?? merged.sourceTool ?? 'mcp_proxy',
        });
      }
      if (
        !succ &&
        ctx &&
        ws &&
        tid &&
        uid &&
        merged.skip_tool_chain_row !== true &&
        merged.skip_tool_chain_row !== 1
      ) {
        void fireForgetAgentToolChainRow(env, {
          toolName: merged.tool_name || merged.tool_key || 'mcp_tool',
          agentSessionId: merged.session_id ?? merged.sessionId ?? null,
          workspaceId: ws,
          userId: uid,
          tenantId: tid,
          error: {
            message:
              merged.error_message != null && String(merged.error_message).trim() !== ''
                ? String(merged.error_message).slice(0, 4000)
                : 'mcp_tool_execution_failed',
          },
          mcpToolCallId: execId,
          durationMs: Math.max(0, Math.floor(Number(merged.duration_ms) || 0)),
          terminalSessionId: merged.terminal_session_id ?? merged.terminalSessionId ?? null,
          agentRunId: merged.agent_run_id ?? merged.agentRunId ?? null,
          conversationId: merged.conversation_id ?? merged.conversationId ?? null,
          toolInputJson:
            merged.input_json != null ? String(merged.input_json).slice(0, 8000) : null,
          ctx,
        });
      }
      return execId;
    })
    .catch((e) => console.warn('[scheduleRecordMcpToolExecution]', e?.message ?? e));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p;
  return id;
}

/**
 * Structured execution row after policy + tool resolution.
 *
 * @param {any} env
 * @param {{
 *   actor: Record<string, unknown>,
 *   tool?: Record<string, unknown>|null,
 *   decision?: Record<string, unknown>|null,
 *   status: string,
 *   inputJson?: unknown,
 *   outputJson?: unknown,
 *   error?: string | null,
 *   sessionId?: string | null,
 *   agentId?: string | null,
 *   actionType?: string | null,
 *   resourceType?: string | null,
 *   resourceId?: string | null,
 *   id?: string | null,
 *   errorCode?: string | null,
 *   errorFamily?: string | null,
 * }} o
 * @returns {Promise<string|null>}
 */
export async function logMcpExecution(env, o) {
  const actor = o?.actor || {};
  const tool = o?.tool || {};
  const decision = o?.decision || {};
  const policyJson = JSON.stringify({
    allowed: decision.allowed,
    requiresApproval: decision.requiresApproval,
    denialCode: decision.denialCode,
    policySource: decision.policySource,
    maxTimeoutMs: decision.maxTimeoutMs,
  });
  const inputJson =
    typeof o.inputJson === 'string' ? o.inputJson : JSON.stringify(o.inputJson ?? {});
  const outputJson =
    typeof o.outputJson === 'string' ? o.outputJson : JSON.stringify(o.outputJson ?? {});
  const toolRowId = tool.id != null ? String(tool.id).trim() : '';
  const toolKey = tool.tool_key != null ? String(tool.tool_key).trim() : '';
  const toolName = tool.tool_name != null ? String(tool.tool_name).trim() : toolKey || 'unknown';

  return recordMcpToolExecution(env, {
    id: o.id,
    tenant_id: actor.tenantId,
    workspace_id: actor.workspaceId,
    user_id: actor.userId,
    person_uuid: actor.personUuid,
    session_id: o.sessionId ?? actor.sessionId,
    agent_id: o.agentId ?? actor.agentId,
    tool_id: toolRowId || null,
    agentsam_tools_id: toolRowId || null,
    tool_key: toolKey || null,
    tool_name: toolName,
    action_type: o.actionType,
    resource_type: o.resourceType,
    resource_id: o.resourceId,
    actor_type: actor.actorType,
    actor_source: actor.actorSource,
    policy_decision_json: policyJson,
    denial_code: decision.denialCode,
    success: String(o.status || '').toLowerCase() === 'success',
    status: o.status,
    error_message: o.error,
    error_code: o.errorCode,
    error_family: o.errorFamily,
    input_json: inputJson,
    output_json: outputJson,
  });
}

/**
 * @param {any} env
 * @param {object} fields
 * @returns {Promise<string|null>} execution id
 */
export async function recordMcpToolExecution(env, fields) {
  if (!env?.DB) return null;

  const columns = await pragmaTableColumns(env.DB, MCP_EXEC_TABLE);
  if (!columns.length) return null;

  const id = fields.id && String(fields.id).trim() !== '' ? String(fields.id).trim() : newExecId();
  const normalized = normalizeMcpExecutionFields(fields, id);

  const colSet = new Set(columns.map((c) => c.nameLower));
  const tenantId =
    normalized.tenant_id != null && String(normalized.tenant_id).trim() !== ''
      ? String(normalized.tenant_id).trim()
      : null;
  if (colSet.has('tenant_id') && !tenantId) {
    return null;
  }

  const workspaceId =
    normalized.workspace_id != null && String(normalized.workspace_id).trim() !== ''
      ? String(normalized.workspace_id).trim()
      : null;
  const userId =
    normalized.user_id != null && String(normalized.user_id).trim() !== ''
      ? String(normalized.user_id).trim()
      : null;

  if (userId && (!workspaceId || workspaceId === '__tenant__')) {
    throw new Error('WORKSPACE_CONTEXT_MISSING');
  }

  if (userId) {
    normalized.user_id = await resolveCanonicalUserId(String(normalized.user_id).trim(), env);
  }

  const names = [];
  const binds = [];

  for (const col of columns) {
    const key = col.nameLower;
    let val = Object.prototype.hasOwnProperty.call(normalized, key) ? normalized[key] : undefined;
    if (val === undefined) val = defaultForMcpExecColumn(col);

    if (
      (key === 'policy_decision_json' || key === 'error_detail_json' || key === 'request_args_json') &&
      val != null &&
      typeof val === 'object'
    ) {
      val = JSON.stringify(val);
    }

    if (key === 'tool_name' && (val === null || val === '')) {
      val = 'unknown';
    }
    if (key === 'input_json') val = String(val ?? '{}').slice(0, 100000);
    if (key === 'output_json') val = String(val ?? '{}').slice(0, 50000);
    if (key === 'error_message' && val != null) val = String(val).slice(0, 8000);
    if (key === 'status' && (val === null || val === '')) {
      const ok = Number(normalized.success) === 1;
      val = String(fields.status || (ok ? 'completed' : 'error')).slice(0, 40);
    }

    val = coerceForColumn(col, val);
    names.push(col.name);
    binds.push(val);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO ${MCP_EXEC_TABLE} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    )
      .bind(...binds)
      .run();

    const st = String(normalized.status || '').toLowerCase();
    const terminal = ['completed', 'success', 'failed', 'error', 'cancelled'].includes(st);
    if (terminal && workspaceId) {
      scheduleMirrorToolCallEventToSupabase(env, null, {
        id,
        workspace_id: workspaceId,
        run_id:
          normalized.supabase_run_id ??
          normalized.workflow_run_id ??
          normalized.agent_run_id ??
          null,
        tool_key: normalized.tool_key ?? normalized.tool_name ?? 'mcp_tool',
        tool_name: normalized.tool_name ?? normalized.tool_key ?? 'mcp_tool',
        tool_category: normalized.tool_category ?? 'mcp',
        status: Number(normalized.success) === 1 || st === 'completed' || st === 'success' ? 'completed' : 'failed',
        input_tokens: Number(normalized.input_tokens) || 0,
        output_tokens: Number(normalized.output_tokens) || 0,
        cost_usd: Number(normalized.cost_usd) || 0,
        duration_ms: Number(normalized.duration_ms ?? normalized.latency_ms) || 0,
      });
    }

    return id;
  } catch (e) {
    console.warn('[recordMcpToolExecution] prod insert failed', e?.message ?? e);
    return null;
  }
}

/**
 * OTLP span for a single MCP/builtin tool invocation (otlp_traces → daily rollup).
 * @param {any} env
 * @param {any} ctx
 * @param {{ tenant_id?: string, workspace_id?: string, toolName: string, start_time_unix_nano: number, end_time_unix_nano: number, execErr?: Error|null }} p
 */
export function recordMcpToolOtlpSpan(env, ctx, p) {
  const tenantId =
    p?.tenant_id != null && String(p.tenant_id).trim() !== '' ? String(p.tenant_id).trim() : '';
  const workspaceId =
    p?.workspace_id != null && String(p.workspace_id).trim() !== ''
      ? String(p.workspace_id).trim()
      : '';
  if (!tenantId || !workspaceId) return;
  const toolName = String(p.toolName || 'unknown').slice(0, 500);
  const t0 = Number(p.start_time_unix_nano);
  const t1 = Number(p.end_time_unix_nano);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return;
  const execErr = p.execErr;
  recordSpan(env, ctx, {
    tenant_id: tenantId,
    workspace_id: workspaceId,
    operation_name: `mcp_tool.${toolName}`,
    kind: 'client',
    status_code: execErr ? 'error' : 'ok',
    status_message: execErr?.message ? String(execErr.message).slice(0, 2000) : null,
    start_time_unix_nano: t0,
    end_time_unix_nano: t1,
    attributes_json: JSON.stringify({ tool: toolName, workspace_id: workspaceId }),
  });
}
