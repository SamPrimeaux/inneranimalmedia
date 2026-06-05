/**
 * Supabase Edge Function: summarize-thread → session_summaries (+ embeddings).
 * Non-blocking callers: compaction cron and one-shot backfill API.
 */
import { isHyperdriveUsable, runHyperdriveQuery } from './hyperdrive-query.js';

const SUMMARIZE_THREAD_PATH = '/functions/v1/summarize-thread';
const MIN_MESSAGES_FOR_SUMMARY = 20;
const DEFAULT_MAX_MESSAGES = 40;

/** @param {any} env */
function supabaseBase(env) {
  const raw = env?.SUPABASE_URL;
  if (!raw || !String(raw).trim()) return null;
  return String(raw).trim().replace(/\/$/, '');
}

/** @param {any} env */
function serviceRoleKey(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  return key && String(key).trim() ? String(key).trim() : null;
}

/**
 * @param {any} env
 * @param {{ session_id: string, tenant_id?: string|null, workspace_id?: string|null, max_messages?: number }} payload
 */
export async function invokeSummarizeThreadEdgeFunction(env, payload) {
  const base = supabaseBase(env);
  const key = serviceRoleKey(env);
  const sessionId = String(payload?.session_id || '').trim();
  if (!base || !key || !sessionId) {
    return { ok: false, skipped: true, reason: 'supabase_not_configured_or_missing_session_id' };
  }

  const body = {
    session_id: sessionId,
    tenant_id: payload.tenant_id != null ? String(payload.tenant_id) : undefined,
    workspace_id: payload.workspace_id != null ? String(payload.workspace_id) : undefined,
    max_messages: Math.min(80, Math.max(1, Number(payload.max_messages) || DEFAULT_MAX_MESSAGES)),
  };

  try {
    const res = await fetch(`${base}${SUMMARIZE_THREAD_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 500) };
    }
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { ok: true, status: res.status, result: json };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * @param {any} env
 * @param {string} sessionId
 */
export async function sessionHasSummaryRow(env, sessionId) {
  const sid = String(sessionId || '').trim();
  if (!sid || !isHyperdriveUsable(env)) return false;
  const out = await runHyperdriveQuery(
    env,
    `SELECT 1 AS ok FROM public.session_summaries WHERE session_id = $1 LIMIT 1`,
    [sid],
  );
  return out.ok && (out.rows || []).length > 0;
}

/**
 * After RAG compaction archives a conversation — optional summarize (never throws).
 * @param {any} env
 * @param {{ sessionId: string, messageCount: number, tenantId?: string|null, workspaceId?: string|null }} opts
 */
export async function maybeSummarizeThreadAfterCompaction(env, opts) {
  const sessionId = String(opts?.sessionId || '').trim();
  const messageCount = Number(opts?.messageCount) || 0;
  if (!sessionId || messageCount <= MIN_MESSAGES_FOR_SUMMARY) {
    return { invoked: false, reason: 'below_message_threshold' };
  }
  if (!supabaseBase(env) || !serviceRoleKey(env)) {
    return { invoked: false, reason: 'supabase_not_configured' };
  }
  try {
    if (await sessionHasSummaryRow(env, sessionId)) {
      return { invoked: false, reason: 'summary_exists' };
    }
    const result = await invokeSummarizeThreadEdgeFunction(env, {
      session_id: sessionId,
      tenant_id: opts.tenantId ?? undefined,
      workspace_id: opts.workspaceId ?? undefined,
      max_messages: DEFAULT_MAX_MESSAGES,
    });
    if (!result.ok) {
      console.debug('[summarize-thread] compaction invoke failed', sessionId, result.error || result.status);
    }
    return { invoked: true, ok: result.ok, result };
  } catch (e) {
    console.debug('[summarize-thread] compaction skipped', sessionId, e?.message ?? e);
    return { invoked: false, reason: 'error', error: String(e?.message || e) };
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} sessionId
 */
export async function d1SessionContext(db, sessionId) {
  try {
    const row = await db
      .prepare(
        `SELECT s.id, s.tenant_id,
          (SELECT COUNT(*) FROM agent_messages am WHERE am.conversation_id = s.id) AS message_count
         FROM agent_sessions s
         WHERE s.id = ?
         LIMIT 1`,
      )
      .bind(sessionId)
      .first();
    if (!row) return null;
    let workspaceId = null;
    try {
      const ws = await db
        .prepare(`SELECT workspace_id FROM agent_sessions WHERE id = ? LIMIT 1`)
        .bind(sessionId)
        .first();
      workspaceId = ws?.workspace_id != null ? String(ws.workspace_id) : null;
    } catch {
      workspaceId = null;
    }
    return {
      session_id: String(row.id),
      tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
      workspace_id: workspaceId,
      message_count: Number(row.message_count) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Sessions in D1 with >20 messages and no Supabase session_summaries row.
 * @param {any} env
 * @param {{ limit?: number }} [opts]
 */
export async function listD1SessionsNeedingSummary(env, opts = {}) {
  const db = env?.DB;
  if (!db) return [];
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 100));
  try {
    const { results } = await db
      .prepare(
        `SELECT s.id AS session_id, s.tenant_id,
          (SELECT COUNT(*) FROM agent_messages am WHERE am.conversation_id = s.id) AS message_count
         FROM agent_sessions s
         WHERE (SELECT COUNT(*) FROM agent_messages am WHERE am.conversation_id = s.id) > ?
         ORDER BY s.updated_at DESC
         LIMIT ?`,
      )
      .bind(MIN_MESSAGES_FOR_SUMMARY, limit * 3)
      .all();
    const rows = results || [];
    const need = [];
    for (const r of rows) {
      const sessionId = String(r.session_id || '').trim();
      if (!sessionId) continue;
      if (await sessionHasSummaryRow(env, sessionId)) continue;
      const ctx = await d1SessionContext(db, sessionId);
      need.push({
        session_id: sessionId,
        tenant_id: ctx?.tenant_id ?? (r.tenant_id != null ? String(r.tenant_id) : null),
        workspace_id: ctx?.workspace_id ?? null,
        message_count: Number(r.message_count) || ctx?.message_count || 0,
      });
      if (need.length >= limit) break;
    }
    return need;
  } catch (e) {
    console.warn('[summarize-thread] listD1SessionsNeedingSummary', e?.message ?? e);
    return [];
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {any} env
 * @param {Array<{ session_id: string, tenant_id?: string|null, workspace_id?: string|null, message_count?: number }>} sessions
 * @param {{ batchSize?: number, delayMs?: number }} [opts]
 */
export async function queueSummarizeThreadBatch(env, sessions, opts = {}) {
  const batchSize = Math.min(10, Math.max(1, Number(opts.batchSize) || 5));
  const delayMs = Math.max(0, Number(opts.delayMs) || 500);
  const results = [];
  for (let i = 0; i < sessions.length; i += batchSize) {
    const chunk = sessions.slice(i, i + batchSize);
    for (const s of chunk) {
      const out = await maybeSummarizeThreadAfterCompaction(env, {
        sessionId: s.session_id,
        messageCount: Number(s.message_count) || MIN_MESSAGES_FOR_SUMMARY + 1,
        tenantId: s.tenant_id,
        workspaceId: s.workspace_id,
      });
      results.push({ session_id: s.session_id, ...out });
    }
    if (i + batchSize < sessions.length && delayMs > 0) await sleep(delayMs);
  }
  return results;
}

/**
 * On-demand /summarize — force invoke edge function (non-blocking, never throws).
 * @param {any} env
 * @param {{
 *   sessionId: string,
 *   tenantId?: string|null,
 *   workspaceId?: string|null,
 *   messageCount?: number,
 *   force?: boolean,
 *   max_messages?: number,
 * }} opts
 */
export async function summarizeThreadOnDemand(env, opts) {
  const sessionId = String(opts?.sessionId || '').trim();
  const messageCount = Number(opts?.messageCount) || 0;
  const force = opts?.force === true;

  if (!sessionId) {
    return { invoked: false, reason: 'missing_session_id' };
  }
  if (!force && messageCount <= MIN_MESSAGES_FOR_SUMMARY) {
    return { invoked: false, reason: 'below_message_threshold' };
  }
  if (!supabaseBase(env) || !serviceRoleKey(env)) {
    return { invoked: false, reason: 'supabase_not_configured' };
  }

  try {
    if (!force && (await sessionHasSummaryRow(env, sessionId))) {
      return { invoked: false, reason: 'summary_exists' };
    }
    const result = await invokeSummarizeThreadEdgeFunction(env, {
      session_id: sessionId,
      tenant_id: opts.tenantId ?? undefined,
      workspace_id: opts.workspaceId ?? undefined,
      max_messages: opts.max_messages,
    });
    if (!result.ok) {
      console.debug('[summarize-thread] on_demand failed', sessionId, result.error || result.status);
    }
    return { invoked: true, ok: result.ok, result };
  } catch (e) {
    console.debug('[summarize-thread] on_demand skipped', sessionId, e?.message ?? e);
    return { invoked: false, reason: 'error', error: String(e?.message || e) };
  }
}

export { MIN_MESSAGES_FOR_SUMMARY, DEFAULT_MAX_MESSAGES };
