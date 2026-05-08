/**
 * Unified MCP / builtin tool execution ledger (agentsam_mcp_tool_execution).
 * Inserts align with production D1 columns (inneranimalmedia-business).
 */

import { scheduleAgentsamErrorLog } from './agentsam-error-log.js';

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

const NON_CACHEABLE_TOOLS = new Set(['terminal_execute', 'deploy', 'r2_delete', 'd1_write']);

function toolExecutionIsCacheable(toolName) {
  const n = String(toolName || '').trim();
  if (!n || NON_CACHEABLE_TOOLS.has(n)) return false;
  return true;
}

/**
 * @param {any} env
 * @param {{ workspaceId?: string | null, tenantId?: string | null, toolName: string, toolInput: unknown }} o
 * @returns {Promise<{ hit: false } | { hit: true, value: unknown }>}
 */
export async function tryReadAgentsamToolCache(env, o) {
  if (!env?.DB || !toolExecutionIsCacheable(o?.toolName)) return { hit: false };
  const ws =
    o.workspaceId != null && String(o.workspaceId).trim() !== ''
      ? String(o.workspaceId).trim()
      : '';
  if (!ws) return { hit: false };
  const tenantId =
    o.tenantId != null && String(o.tenantId).trim() !== '' ? String(o.tenantId).trim() : null;
  const toolName = String(o.toolName || '').trim();
  const inputHash = await hashToolInputJson(o.toolInput ?? {});
  if (!inputHash) return { hit: false };
  const cacheKey = `${ws}:${toolName}:${inputHash}`;
  try {
    const cached = await env.DB.prepare(
      `SELECT output_json FROM agentsam_tool_cache
       WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
       LIMIT 1`,
    )
      .bind(cacheKey)
      .first();
    const out = cached?.output_json != null ? String(cached.output_json) : '';
    if (!out) return { hit: false };
    await env.DB
      .prepare(
        `UPDATE agentsam_tool_cache SET hit_count = COALESCE(hit_count, 0) + 1,
         last_used_at = datetime('now'), updated_at = datetime('now')
         WHERE cache_key = ?`,
      )
      .bind(cacheKey)
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
  if (!env?.DB || !toolExecutionIsCacheable(o?.toolName)) return;
  if (o?.execErr) return;
  const ws =
    o.workspaceId != null && String(o.workspaceId).trim() !== ''
      ? String(o.workspaceId).trim()
      : '';
  if (!ws) return;
  const tenantId =
    o.tenantId != null && String(o.tenantId).trim() !== '' ? String(o.tenantId).trim() : null;
  const toolName = String(o.toolName || '').trim();
  const inputHash = await hashToolInputJson(o.toolInput ?? {});
  if (!inputHash) return;
  const cacheKey = `${ws}:${toolName}:${inputHash}`;
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
import { recordSpan } from './tracer.js';

async function pragmaTableInfo(db, tableName) {
  if (!db || !tableName) return new Set();
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(tableName)) ? String(tableName) : '';
  if (!safe) return new Set();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
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
      if (succ || !ctx?.waitUntil || !execId) return execId;
      const ws =
        merged.workspace_id != null && String(merged.workspace_id).trim() !== ''
          ? String(merged.workspace_id).trim()
          : '';
      const tid =
        merged.tenant_id != null && String(merged.tenant_id).trim() !== ''
          ? String(merged.tenant_id).trim()
          : '';
      if (!ws || !tid) return execId;
      scheduleAgentsamErrorLog(env, ctx, {
        workspaceId: ws,
        tenantId: tid,
        sessionId: merged.session_id ?? merged.sessionId ?? null,
        errorCode: 'mcp_exec_failed',
        errorType: 'mcp_tool_execution',
        errorMessage:
          merged.error_message != null && String(merged.error_message).trim() !== ''
            ? String(merged.error_message).slice(0, 8000)
            : 'mcp_tool_execution_failed',
        source: 'mcp_tool_execution',
        sourceId: execId,
        contextJson: JSON.stringify({
          tool_name: merged.tool_name,
          input_json:
            merged.input_json != null ? String(merged.input_json).slice(0, 8000) : null,
        }),
      });
      return execId;
    })
    .catch((e) => console.warn('[scheduleRecordMcpToolExecution]', e?.message ?? e));
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p;
  return id;
}

/**
 * @param {any} env
 * @param {object} fields
 * @returns {Promise<string|null>} execution id
 */
export async function recordMcpToolExecution(env, fields) {
  if (!env?.DB) return null;
  const cols = await pragmaTableInfo(env.DB, 'agentsam_mcp_tool_execution');
  if (!cols.size) return null;

  const id = fields.id && String(fields.id).trim() !== '' ? String(fields.id).trim() : newExecId();
  const tenantId =
    fields.tenant_id != null && String(fields.tenant_id).trim() !== ''
      ? String(fields.tenant_id).trim()
      : null;
  const workspaceId =
    fields.workspace_id != null && String(fields.workspace_id).trim() !== ''
      ? String(fields.workspace_id).trim()
      : null;
  const userId =
    fields.user_id != null && String(fields.user_id).trim() !== ''
      ? String(fields.user_id).trim()
      : fields.invoked_by != null && String(fields.invoked_by).trim() !== ''
        ? String(fields.invoked_by).trim()
        : null;
  const personUuid =
    fields.person_uuid != null && String(fields.person_uuid).trim() !== ''
      ? String(fields.person_uuid).trim()
      : fields.personUuid != null && String(fields.personUuid).trim() !== ''
        ? String(fields.personUuid).trim()
        : null;
  const sessionId = fields.session_id ?? fields.sessionId ?? null;
  const toolId =
    fields.tool_id != null && String(fields.tool_id).trim() !== ''
      ? String(fields.tool_id).trim()
      : null;
  const toolName = String(fields.tool_name || fields.toolName || 'unknown').slice(0, 500);
  const inputJson =
    fields.input_json != null
      ? String(fields.input_json)
      : JSON.stringify(fields.input ?? fields.toolArgs ?? {});
  const outputJson =
    fields.output_json != null
      ? String(fields.output_json)
      : fields.output != null
        ? String(fields.output)
        : '';
  const success =
    fields.success !== undefined
      ? !!fields.success
      : !fields.error_message && String(fields.status || '').toLowerCase() !== 'error';
  const successInt = success ? 1 : 0;
  const err = fields.error_message != null ? String(fields.error_message).slice(0, 8000) : null;
  const costUsd = Number(fields.cost_usd ?? fields.costUsd ?? 0) || 0;
  const inTok = Math.max(0, Math.floor(Number(fields.input_tokens ?? fields.inputTokens ?? 0) || 0));
  const outTok = Math.max(0, Math.floor(Number(fields.output_tokens ?? fields.outputTokens ?? 0) || 0));
  const dur = Math.max(0, Math.floor(Number(fields.duration_ms ?? fields.durationMs ?? 0) || 0));
  const retry = Math.max(0, Math.floor(Number(fields.retry_count ?? fields.retryCount ?? 0) || 0));
  const reqAppr = Number(fields.requires_approval ?? 0) === 1 ? 1 : 0;

  // Hard rule: authenticated execution rows must have a real workspace_id.
  // '__tenant__' is reserved for true platform/system rows, not user actions.
  if (userId && (!workspaceId || workspaceId === '__tenant__')) {
    throw new Error('WORKSPACE_CONTEXT_MISSING');
  }
  if (cols.has('tenant_id') && !tenantId) {
    return null;
  }

  try {
    const insertCols = [
      cols.has('id') && 'id',
      cols.has('tool_id') && 'tool_id',
      cols.has('tool_name') && 'tool_name',
      cols.has('tenant_id') && 'tenant_id',
      cols.has('workspace_id') && 'workspace_id',
      cols.has('user_id') && 'user_id',
      cols.has('person_uuid') && 'person_uuid',
      cols.has('session_id') && 'session_id',
      cols.has('input_json') && 'input_json',
      cols.has('output_json') && 'output_json',
      cols.has('success') && 'success',
      cols.has('error_message') && 'error_message',
      cols.has('duration_ms') && 'duration_ms',
      cols.has('cost_usd') && 'cost_usd',
      cols.has('input_tokens') && 'input_tokens',
      cols.has('output_tokens') && 'output_tokens',
      cols.has('retry_count') && 'retry_count',
      cols.has('requires_approval') && 'requires_approval',
      cols.has('status') && 'status',
      cols.has('created_at') && 'created_at',
    ].filter(Boolean);

    const insertVals = [];
    const binds = [];
    const push = (col, valExpr, bindVal) => {
      insertVals.push(valExpr);
      if (valExpr === '?') binds.push(bindVal);
    };
    for (const c of insertCols) {
      switch (c) {
        case 'id':
          push(c, '?', id);
          break;
        case 'tool_id':
          push(c, '?', toolId);
          break;
        case 'tool_name':
          push(c, '?', toolName);
          break;
        case 'tenant_id':
          push(c, '?', tenantId);
          break;
        case 'workspace_id':
          push(c, '?', workspaceId);
          break;
        case 'user_id':
          push(c, '?', userId);
          break;
        case 'person_uuid':
          push(c, '?', personUuid);
          break;
        case 'session_id':
          push(c, '?', sessionId);
          break;
        case 'input_json':
          push(c, '?', inputJson.slice(0, 100000));
          break;
        case 'output_json':
          push(c, '?', outputJson.slice(0, 50000));
          break;
        case 'success':
          push(c, '?', successInt);
          break;
        case 'error_message':
          push(c, '?', err);
          break;
        case 'duration_ms':
          push(c, '?', dur);
          break;
        case 'cost_usd':
          push(c, '?', costUsd);
          break;
        case 'input_tokens':
          push(c, '?', inTok);
          break;
        case 'output_tokens':
          push(c, '?', outTok);
          break;
        case 'retry_count':
          push(c, '?', retry);
          break;
        case 'requires_approval':
          push(c, '?', reqAppr);
          break;
        case 'status':
          push(c, '?', String(fields.status || (success ? 'completed' : 'error')).slice(0, 40));
          break;
        case 'created_at':
          push(c, `datetime('now')`, null);
          break;
        default:
          push(c, '?', null);
          break;
      }
    }

    await env.DB.prepare(
      `INSERT INTO agentsam_mcp_tool_execution (${insertCols.join(', ')})
       VALUES (${insertVals.join(', ')})`,
    )
      .bind(...binds)
      .run();
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
