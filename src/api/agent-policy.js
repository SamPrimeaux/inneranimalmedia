import { jsonResponse, authContextToLegacyUser } from '../core/auth.js';
import { fetchDashboardBootstrapAgentPolicy } from '../core/dashboard-bootstrap-agent-policy.js';

/**
 * @param {Request} request
 * @param {any} env
 * @param {import('../core/auth.js').AuthContext} authCtx
 */
export async function handleAgentPolicy(request, env, authCtx) {
  if (request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  const authUser = authContextToLegacyUser(authCtx);
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  const workspaceId =
    authCtx?.workspaceId != null && String(authCtx.workspaceId).trim()
      ? String(authCtx.workspaceId).trim()
      : authUser.active_workspace_id != null
        ? String(authUser.active_workspace_id).trim()
        : null;

  if (!workspaceId) return jsonResponse({ ok: true, agent_policy: null });

  const policy = await fetchDashboardBootstrapAgentPolicy(env, authUser, workspaceId).catch(() => null);
  return jsonResponse({ ok: true, agent_policy: policy });
}
