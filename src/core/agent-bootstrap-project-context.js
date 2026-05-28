/**
 * Agent bootstrap snapshot cache — stored in agentsam_project_context (replaces ai_compiled_context_cache).
 * project_key=agent_bootstrap, project_type=bootstrap_cache, payload JSON in notes.
 */

export const AGENT_BOOTSTRAP_PROJECT_KEY = 'agent_bootstrap';
export const AGENT_BOOTSTRAP_PROJECT_TYPE = 'bootstrap_cache';
/** TTL for GET /api/agent/bootstrap cache hits (seconds). */
export const AGENT_BOOTSTRAP_TTL_SEC = 1800;

/**
 * @param {string} userId
 * @returns {string}
 */
export function agentBootstrapContextRowId(userId) {
  const u = String(userId || 'system').trim() || 'system';
  const safe = u.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return `ctx_bootstrap_${safe}`;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ tenantId: string, userId: string, ttlSec?: number }} opts
 * @returns {Promise<string|null>} cached JSON body
 */
export async function readAgentBootstrapCache(db, { tenantId, userId, ttlSec = AGENT_BOOTSTRAP_TTL_SEC }) {
  const tid = String(tenantId || '').trim();
  if (!db || !tid) return null;
  const id = agentBootstrapContextRowId(userId);
  const row = await db
    .prepare(
      `SELECT notes FROM agentsam_project_context
       WHERE id = ?
         AND tenant_id = ?
         AND project_key = ?
         AND project_type = ?
         AND updated_at > unixepoch() - ?
       LIMIT 1`,
    )
    .bind(id, tid, AGENT_BOOTSTRAP_PROJECT_KEY, AGENT_BOOTSTRAP_PROJECT_TYPE, Math.max(60, Number(ttlSec) || AGENT_BOOTSTRAP_TTL_SEC))
    .first()
    .catch(() => null);
  const notes = row?.notes;
  return notes != null && String(notes).trim() !== '' ? String(notes) : null;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{
 *   tenantId: string,
 *   workspaceId?: string|null,
 *   userId: string,
 *   payload: Record<string, unknown>,
 *   createdBy?: string|null,
 * }} opts
 */
export async function writeAgentBootstrapCache(db, { tenantId, workspaceId, userId, payload, createdBy }) {
  const tid = String(tenantId || '').trim();
  if (!db || !tid) return;
  const id = agentBootstrapContextRowId(userId);
  const notes = JSON.stringify(payload ?? {});
  const ws = workspaceId != null && String(workspaceId).trim() !== '' ? String(workspaceId).trim() : null;
  const uid = String(userId || 'system').trim() || 'system';
  const by = createdBy != null && String(createdBy).trim() !== '' ? String(createdBy).trim() : uid;

  await db
    .prepare(
      `INSERT INTO agentsam_project_context (
         id, tenant_id, workspace_id, project_key, project_name, project_type,
         status, priority, description, notes, session_id, agent_id, cost_usd,
         created_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, 'Agent bootstrap snapshot', ?, 'active', 0,
         'Ephemeral R2 daily log + schema memory snapshot for GET /api/agent/bootstrap',
         ?, ?, 'agent-sam', 0, unixepoch(), unixepoch()
       )
       ON CONFLICT(id) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         workspace_id = excluded.workspace_id,
         notes = excluded.notes,
         session_id = excluded.session_id,
         updated_at = unixepoch()`,
    )
    .bind(id, tid, ws, AGENT_BOOTSTRAP_PROJECT_KEY, AGENT_BOOTSTRAP_PROJECT_TYPE, notes, uid, by)
    .run()
    .catch(() => {});
}

/**
 * Purge stale bootstrap cache rows (daily digest invalidation).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ maxAgeSec?: number }} [opts]
 */
export async function purgeStaleAgentBootstrapCache(db, { maxAgeSec = 86400 } = {}) {
  if (!db) return;
  const age = Math.max(300, Number(maxAgeSec) || 86400);
  await db
    .prepare(
      `DELETE FROM agentsam_project_context
       WHERE project_key = ?
         AND project_type = ?
         AND updated_at < unixepoch() - ?`,
    )
    .bind(AGENT_BOOTSTRAP_PROJECT_KEY, AGENT_BOOTSTRAP_PROJECT_TYPE, age)
    .run()
    .catch(() => {});
}
