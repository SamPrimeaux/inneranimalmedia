import { platformTenantIdFromEnv } from '../core/auth.js';
import { resolvePlatformD1AuthUserId } from '../core/platform-identity-constants.js';

/** Prefer Workers `TENANT_ID` binding for cron-scoped D1 writes (memory rollups, finance alerts). */
export function cronTenantId(env) {
  return platformTenantIdFromEnv(env) || null;
}

/**
 * Prefer Worker `WORKSPACE_ID` / aliases — never invent a ws_* literal in cron hot paths.
 * @param {any} env
 * @returns {string|null}
 */
export function cronWorkspaceId(env) {
  for (const key of ['WORKSPACE_ID', 'DEFAULT_WORKSPACE_ID', 'IAM_WORKSPACE_ID', 'D1_WORKSPACE_ID']) {
    const v = env?.[key] != null ? String(env[key]).trim() : '';
    if (v) return v;
  }
  return null;
}

/**
 * Resolve D1 workspace id for cron jobs (env first, then operator's active/default workspace).
 * @param {any} env
 * @param {{ userId?: string|null }} [owner]
 * @returns {Promise<string|null>}
 */
export async function resolveCronWorkspaceId(env, owner = null) {
  const fromEnv = cronWorkspaceId(env);
  if (fromEnv) return fromEnv;

  const userId = String(owner?.userId || resolvePlatformD1AuthUserId(env) || '').trim();
  if (env?.DB && userId) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(
         NULLIF(TRIM(active_workspace_id), ''),
         NULLIF(TRIM(default_workspace_id), '')
       ) AS wid
       FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(userId)
      .first()
      .catch(() => null);
    if (row?.wid) return String(row.wid).trim();
  }

  return null;
}

/**
 * Resolve tenant for cron jobs when TENANT_ID secret is unset.
 * Prefer env → auth_users (by userId/email) → workspace row for resolved workspace id.
 * Never embeds a tenant_* or ws_* string literal.
 * @param {*} env
 * @param {{ userId?: string|null, email?: string|null }} [owner]
 */
export async function resolveCronTenantId(env, owner = null) {
  const fromEnv = cronTenantId(env);
  if (fromEnv) return fromEnv;

  const userId = String(owner?.userId || '').trim() || resolvePlatformD1AuthUserId(env);

  if (env?.DB && userId) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(TRIM(active_tenant_id), ''), NULLIF(TRIM(tenant_id), '')) AS tid
       FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(String(userId))
      .first()
      .catch(() => null);
    if (row?.tid) return String(row.tid).trim();
  }

  if (env?.DB && owner?.email) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(TRIM(active_tenant_id), ''), NULLIF(TRIM(tenant_id), '')) AS tid
       FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
    )
      .bind(String(owner.email).trim())
      .first()
      .catch(() => null);
    if (row?.tid) return String(row.tid).trim();
  }

  const workspaceId = await resolveCronWorkspaceId(env, { userId });
  if (env?.DB && workspaceId) {
    const ws = await env.DB.prepare(
      `SELECT tenant_id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
    )
      .bind(workspaceId)
      .first()
      .catch(() => null);
    if (ws?.tenant_id) return String(ws.tenant_id).trim();
  }

  return 'system';
}
