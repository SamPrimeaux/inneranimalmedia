/**
 * Lightweight auth for moviemode-service.
 * - Service binding / internal key from inneranimalmedia main worker
 * - Session cookie passthrough when KV + D1 bindings match main platform
 */
import { jsonResponse } from './http.js';

const SERVICE_KEY_HEADER = 'x-iam-service-key';

export async function getAuthUser(request, env) {
  const serviceKey = String(request.headers.get(SERVICE_KEY_HEADER) || '').trim();
  const expected = String(env?.IAM_SERVICE_KEY || env?.INTERNAL_API_SECRET || '').trim();
  if (serviceKey && expected && serviceKey === expected) {
    const ws = String(request.headers.get('X-Workspace-Id') || env.WORKSPACE_ID || '').trim();
    const tenant = String(request.headers.get('X-Tenant-Id') || env.TENANT_ID || '').trim();
    if (ws && tenant) {
      return {
        id: 'service_moviemode',
        workspace_id: ws,
        active_workspace_id: ws,
        tenant_id: tenant,
        active_tenant_id: tenant,
        role: 'service',
      };
    }
  }

  if (typeof env?._parentGetAuthUser === 'function') {
    return env._parentGetAuthUser(request, env);
  }

  const cookie = request.headers.get('Cookie') || '';
  const sessionMatch = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  if (!sessionMatch || !env?.IAM_SESSION) return null;

  try {
    const raw = await env.IAM_SESSION.get(`iam_sess_v1:${sessionMatch[1]}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function requireAuth(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return { error: jsonResponse({ error: 'Unauthorized' }, 401) };
  const workspaceId = authUser.active_workspace_id || authUser.workspace_id || null;
  const tenantId = authUser.tenant_id || authUser.active_tenant_id || null;
  if (!workspaceId || !tenantId) {
    return { error: jsonResponse({ error: 'workspace_id and tenant_id required' }, 400) };
  }
  return {
    authUser,
    workspaceId: String(workspaceId),
    tenantId: String(tenantId),
    userId: authUser?.id != null ? String(authUser.id).trim() : '',
  };
}

export { jsonResponse };
