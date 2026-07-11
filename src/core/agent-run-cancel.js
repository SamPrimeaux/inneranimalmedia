/**
 * Agent run cancel — D1 flag the tool loop polls between steps.
 */

import { pragmaTableInfo } from './retention.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {any} env
 * @param {string} runId
 * @param {{ userId?: string|null, workspaceId?: string|null, tenantId?: string|null }} auth
 */
export async function requestAgentRunCancel(env, runId, auth = {}) {
  const rid = trim(runId);
  if (!env?.DB || !rid) return { ok: false, error: 'missing_run_id' };

  const row = await env.DB.prepare(
    `SELECT id, status, user_id, workspace_id, tenant_id FROM agentsam_agent_run WHERE id = ? LIMIT 1`,
  )
    .bind(rid)
    .first()
    .catch(() => null);

  if (!row?.id) return { ok: false, error: 'run_not_found' };

  const uid = trim(auth.userId);
  const ws = trim(auth.workspaceId);
  if (uid && row.user_id && trim(row.user_id) !== uid) {
    return { ok: false, error: 'forbidden' };
  }
  if (ws && row.workspace_id && trim(row.workspace_id) !== ws) {
    return { ok: false, error: 'forbidden' };
  }

  const st = trim(row.status).toLowerCase();
  if (st && !['running', 'cancelling', 'pending'].includes(st)) {
    return { ok: true, already_terminal: true, status: st };
  }

  const cols = await pragmaTableInfo(env.DB, 'agentsam_agent_run');
  const sets = [];
  const binds = [];
  if (cols.has('cancel_requested')) {
    sets.push('cancel_requested = 1');
  }
  if (cols.has('status')) {
    sets.push("status = 'cancelling'");
  }
  if (cols.has('error_message')) {
    sets.push("error_message = 'agent_run_cancelled'");
  }
  if (cols.has('completed_at')) {
    sets.push('completed_at = COALESCE(completed_at, ?)');
    binds.push(new Date().toISOString());
  }
  if (!sets.length) return { ok: false, error: 'cancel_columns_missing' };

  binds.push(rid);
  await env.DB.prepare(`UPDATE agentsam_agent_run SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();

  return { ok: true, run_id: rid, status: 'cancelling' };
}

/**
 * @param {any} env
 * @param {string|null|undefined} runId
 * @param {{ cache?: { at: number, value: boolean } }} [opts]
 */
export async function isAgentRunCancelRequested(env, runId, opts = {}) {
  const rid = trim(runId);
  if (!rid || !env?.DB) return false;

  const cache = opts.cache;
  const now = Date.now();
  if (cache && now - cache.at < 350) return cache.value;

  const row = await env.DB.prepare(
    `SELECT cancel_requested, status FROM agentsam_agent_run WHERE id = ? LIMIT 1`,
  )
    .bind(rid)
    .first()
    .catch(() => null);

  const cancelled =
    Number(row?.cancel_requested) === 1 ||
    trim(row?.status).toLowerCase() === 'cancelling' ||
    trim(row?.status).toLowerCase() === 'cancelled';

  if (cache) {
    cache.at = now;
    cache.value = cancelled;
  }
  return cancelled;
}
