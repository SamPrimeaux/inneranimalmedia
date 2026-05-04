/**
 * src/core/identity.js
 *
 * Resolves authenticated identity from a live request.
 * Returns null if session is missing or expired.
 * Callers must handle null as 401 — never substitute defaults.
 */
import { getSession, getAuthUser } from './auth.js';

export async function resolveIdentity(env, request) {
  if (!env?.DB) return null;

  const session = await getSession(env, request).catch(() => null);
  if (!session?.user_id) return null;

  // tenant_id comes from the verified session row —
  // if it is null, the account is misconfigured, not defaulted
  const tenantId = session.tenant_id ?? null;
  if (!tenantId) return null;

  const [user, defaultWs] = await Promise.all([
    getAuthUser(request, env).catch(() => null),
    env.DB.prepare(`
      SELECT tw.workspace_id AS workspace_id, w.handle AS handle,
             aw.default_model_id
      FROM tenant_workspaces tw
      JOIN workspaces w ON w.id = tw.workspace_id
      LEFT JOIN agentsam_workspace aw ON aw.id = tw.workspace_id
      WHERE tw.tenant_id = ?
        AND tw.is_default = 1
        AND tw.is_active = 1
      LIMIT 1
    `).bind(tenantId).first().catch(() => null),
  ]);

  // No default workspace found — try first active workspace for this tenant.
  // If still null, workspaceId is null. Caller handles this.
  const fallbackWs = defaultWs
    ? null
    : await env.DB.prepare(`
        SELECT w.id AS workspace_id, w.handle AS handle,
               aw.default_model_id
        FROM workspaces w
        LEFT JOIN agentsam_workspace aw ON aw.id = w.id
        WHERE w.status = 'active'
          AND (w.owner_tenant_id = ? OR w.default_tenant_id = ?)
        ORDER BY w.created_at ASC
        LIMIT 1
      `).bind(tenantId, tenantId).first().catch(() => null);

  const ws = defaultWs || fallbackWs || null;

  return {
    userId:         session.user_id,
    tenantId,
    workspaceId:    ws?.workspace_id     ?? null,
    workspaceSlug:  ws?.handle ?? null,
    defaultModelId: ws?.default_model_id ?? null,
    email:          user?.email          ?? null,
    name:           user?.name           ?? null,
    isAdmin:        user?.is_superadmin  === 1,
  };
}

export async function resolveSessionIds(env, request) {
  const id = await resolveIdentity(env, request);
  if (!id) return null;
  return {
    userId:      id.userId,
    tenantId:    id.tenantId,
    workspaceId: id.workspaceId,
  };
}
