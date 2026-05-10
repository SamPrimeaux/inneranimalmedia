/**
 * Shared auth gate for dashboard Worker APIs (tenant/workspace from session — never from body).
 *
 * Kanban: boards/tasks are additionally scoped by the authenticated user via `kanban_boards.owner_id`
 * (see `kanban-scope.js`). Workspace membership only proves access to the app context, not “all boards in the workspace.”
 */
import { jsonResponse } from '../core/auth.js';
import { resolveIdentity } from '../core/identity.js';
import { userHasWorkspaceMembership } from '../core/workspace-provisioning.js';

/**
 * @param {Request} request
 * @param {any} env
 * @returns {Promise<{ ok: true, identity: Record<string, any> } | { ok: false, response: Response }>}
 */
export async function requireDashboardIdentity(request, env) {
  if (!env?.DB) {
    return { ok: false, response: jsonResponse({ error: 'Database not configured' }, 503) };
  }
  const identity = await resolveIdentity(env, request);
  if (!identity?.userId || !identity.tenantId) {
    return { ok: false, response: jsonResponse({ error: 'unauthenticated' }, 401) };
  }
  if (!identity.isSuperadmin) {
    if (!identity.workspaceId || identity.error) {
      return {
        ok: false,
        response: jsonResponse(
          { error: 'no_workspace', detail: identity.error || 'WORKSPACE_CONTEXT_MISSING' },
          403,
        ),
      };
    }
    const member = await userHasWorkspaceMembership(env, identity.userId, identity.workspaceId);
    if (!member) {
      return { ok: false, response: jsonResponse({ error: 'workspace_forbidden' }, 403) };
    }
  }
  return { ok: true, identity };
}
