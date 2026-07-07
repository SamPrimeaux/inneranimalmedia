import { platformTenantIdFromEnv } from '../core/auth.js';

/** Prefer Workers `TENANT_ID` binding for cron-scoped D1 writes (memory rollups, finance alerts). */
export function cronTenantId(env) {
  return platformTenantIdFromEnv(env) || null;
}

/**
 * Resolve tenant for cron jobs when TENANT_ID secret is unset.
 * @param {*} env
 * @param {{ userId?: string|null, email?: string|null }} [owner]
 */
export async function resolveCronTenantId(env, owner = null) {
  const fromEnv = cronTenantId(env);
  if (fromEnv) return fromEnv;

  if (env?.DB && owner?.userId) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(TRIM(active_tenant_id), ''), NULLIF(TRIM(tenant_id), '')) AS tid
       FROM auth_users WHERE id = ? LIMIT 1`,
    ).bind(String(owner.userId)).first().catch(() => null);
    if (row?.tid) return String(row.tid).trim();
  }

  if (env?.DB && owner?.email) {
    const row = await env.DB.prepare(
      `SELECT COALESCE(NULLIF(TRIM(active_tenant_id), ''), NULLIF(TRIM(tenant_id), '')) AS tid
       FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
    ).bind(String(owner.email).trim()).first().catch(() => null);
    if (row?.tid) return String(row.tid).trim();
  }

  if (env?.DB) {
    const ws = await env.DB.prepare(
      `SELECT tenant_id FROM agentsam_workspace WHERE id = 'ws_inneranimalmedia' LIMIT 1`,
    ).first().catch(() => null);
    if (ws?.tenant_id) return String(ws.tenant_id).trim();
  }

  return 'system';
}
