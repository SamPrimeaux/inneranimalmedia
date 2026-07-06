/**
 * Agent bootstrap snapshot cache — SESSION_CACHE KV (replaces agentsam_project_context hack).
 */

export const AGENT_BOOTSTRAP_PROJECT_KEY = 'agent_bootstrap';
export const AGENT_BOOTSTRAP_PROJECT_TYPE = 'bootstrap_cache';
/** TTL for GET /api/agent/bootstrap cache hits (seconds). */
export const AGENT_BOOTSTRAP_TTL_SEC = 1800;

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {string} userId
 * @param {string} [workspaceId]
 */
export function agentBootstrapCacheKey(userId, workspaceId = '') {
  const uid = trim(userId) || 'system';
  const ws = trim(workspaceId) || 'default';
  return `agentsam:bootstrap:${uid}:${ws}`;
}

/**
 * @param {any} env
 * @param {{ tenantId?: string, userId: string, workspaceId?: string|null, ttlSec?: number }} opts
 * @returns {Promise<string|null>} cached JSON body
 */
export async function readAgentBootstrapCache(env, { userId, workspaceId = null, ttlSec = AGENT_BOOTSTRAP_TTL_SEC }) {
  const kv = env?.SESSION_CACHE;
  const uid = trim(userId);
  if (!kv || !uid) return null;
  const key = agentBootstrapCacheKey(uid, workspaceId);
  try {
    const hit = await kv.get(key, { type: 'text', cacheTtl: Math.max(60, Number(ttlSec) || AGENT_BOOTSTRAP_TTL_SEC) });
    return hit != null && String(hit).trim() !== '' ? String(hit) : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} env
 * @param {{
 *   tenantId?: string,
 *   workspaceId?: string|null,
 *   userId: string,
 *   payload: Record<string, unknown>,
 *   createdBy?: string|null,
 * }} opts
 */
export async function writeAgentBootstrapCache(env, { workspaceId, userId, payload }) {
  const kv = env?.SESSION_CACHE;
  const uid = trim(userId);
  if (!kv || !uid) return;
  const key = agentBootstrapCacheKey(uid, workspaceId);
  try {
    await kv.put(key, JSON.stringify(payload ?? {}), {
      expirationTtl: AGENT_BOOTSTRAP_TTL_SEC,
    });
  } catch (e) {
    console.warn('[agent-bootstrap-cache] kv put failed:', e?.message ?? e);
  }
}

/**
 * Purge stale bootstrap cache keys — no-op for KV TTL; kept for API compat.
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function purgeStaleAgentBootstrapCache(db) {
  if (!db) return;
  await db
    .prepare(
      `DELETE FROM agentsam_project_context
       WHERE project_key = ? AND project_type = ?`,
    )
    .bind(AGENT_BOOTSTRAP_PROJECT_KEY, AGENT_BOOTSTRAP_PROJECT_TYPE)
    .run()
    .catch(() => {});
}

/** @deprecated Legacy row id — D1 cache retired. */
export function agentBootstrapContextRowId(userId) {
  const u = trim(userId) || 'system';
  const safe = u.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return `ctx_bootstrap_${safe}`;
}
