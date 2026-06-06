/**
 * P0 data isolation — resolve per-user workspace + D1 binding for dashboard APIs.
 */
import { resolveCanonicalUserId } from '../api/auth.js';
import { authUserIsSuperadmin, fetchAuthUserTenantId } from './auth.js';
import { resolveEffectiveWorkspaceId } from './bootstrap.js';

/**
 * Canonical user + workspace + tenant for scoped D1 reads/writes.
 * @param {unknown} env
 * @param {unknown} authUser
 * @param {unknown} request
 * @param {{ workspaceId?: string, tenantId?: string } | null | undefined} identity
 */
export async function resolveAgentDataScope(env, authUser, request, identity = {}) {
  const rawId = String(authUser?.id || '').trim();
  const userId = rawId ? await resolveCanonicalUserId(rawId, env).catch(() => rawId) : '';
  const wsRes = await resolveEffectiveWorkspaceId(env, request, authUser, identity || {});
  const workspaceId =
    String(identity?.workspaceId || wsRes?.workspaceId || authUser?.active_workspace_id || '')
      .trim() || null;
  let tenantId = String(identity?.tenantId || authUser?.tenant_id || '').trim() || null;
  if (!tenantId && userId) tenantId = await fetchAuthUserTenantId(env, userId).catch(() => null);
  return {
    userId: userId || null,
    workspaceId,
    tenantId,
    isSuperadmin: authUserIsSuperadmin(authUser),
  };
}

/**
 * D1 binding for Database Studio — platform DB only for superadmin when workspace policy allows.
 * @param {unknown} env
 * @param {string} userId
 * @param {unknown} authUser
 * @param {unknown} [request]
 * @returns {Promise<import('@cloudflare/workers-types').D1Database | null>}
 */
export async function resolveUserWorkspaceBinding(env, userId, authUser, request = null) {
  void userId;
  if (!env?.DB) return null;
  if (!authUserIsSuperadmin(authUser)) return null;
  const wsId =
    request?.headers?.get('x-iam-workspace-id') != null
      ? String(request.headers.get('x-iam-workspace-id')).trim()
      : '';
  if (wsId) {
    const { canUsePlatformDataPlane } = await import('./workspace-spend-guard.js');
    if (!(await canUsePlatformDataPlane(env, authUser, wsId))) return null;
  }
  return env.DB;
}

/**
 * SQL AND clause + binds for agentsam_workflow_runs / agentsam_command_run style tables.
 * @param {{ userId?: string | null, workspaceId?: string | null, tenantId?: string | null }} scope
 * @param {{ alias?: string, requireUser?: boolean, requireWorkspace?: boolean }} opts
 */
export function scopeSqlFragment(scope, opts = {}) {
  const alias = opts.alias ? `${opts.alias}.` : '';
  const parts = [];
  const binds = [];
  if (scope.tenantId) {
    parts.push(`${alias}tenant_id = ?`);
    binds.push(scope.tenantId);
  }
  if (scope.workspaceId || opts.requireWorkspace) {
    parts.push(`${alias}workspace_id = ?`);
    binds.push(scope.workspaceId || '');
  }
  if (scope.userId || opts.requireUser) {
    parts.push(`${alias}user_id = ?`);
    binds.push(scope.userId || '');
  }
  return { sql: parts.length ? parts.join(' AND ') : '1=1', binds };
}
