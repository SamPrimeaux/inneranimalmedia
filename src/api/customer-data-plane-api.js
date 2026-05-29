/**
 * /api/data-plane/* — BYO infrastructure + public learning (non-owner safe).
 */
import { jsonResponse } from '../core/responses.js';
import { getAuthUser, authUserIsSuperadmin } from '../core/auth.js';
import { resolveAgentDataScope } from '../core/data-isolation-scope.js';
import { resolveCustomerDataPlane } from '../core/customer-data-plane-router.js';
import { dispatchCustomerDataPlaneOperation } from '../core/customer-data-plane-dispatch.js';
import { customerSupabaseListProjects, customerSupabaseSelectProjectForWorkspace } from '../core/customer-supabase-dispatch.js';
import { customerCloudflareListAccounts } from '../core/customer-cloudflare-dispatch.js';
import { listWorkspaceDataBindings } from '../core/workspace-data-bindings.js';
import { getUserSupabaseToken } from './oauth.js';
import { getOAuthToken } from '../core/user-oauth-token.js';

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
export async function handleCustomerDataPlaneApi(request, url, env) {
  const pathLower = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const scope = await resolveAgentDataScope(env, authUser, request);
  const userId = scope.userId || '';
  const workspaceId = scope.workspaceId || '';
  const tenantId = scope.tenantId || '';

  if (pathLower === '/api/data-plane/context' && method === 'GET') {
    const plane = await resolveCustomerDataPlane(env, {
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      message: '',
      authUser,
    });
    const supabaseTok = userId ? await getUserSupabaseToken(env, userId, workspaceId) : null;
    const cfTok = userId ? await getOAuthToken(env, userId, 'cloudflare') : null;
    const bindings = workspaceId ? await listWorkspaceDataBindings(env, workspaceId) : [];

    return jsonResponse({
      active_data_plane: plane.data_plane,
      owner_type: plane.owner_type,
      degraded_reason: plane.degraded_reason,
      is_owner: authUserIsSuperadmin(authUser),
      is_superadmin: scope.isSuperadmin,
      platform_available: scope.isSuperadmin,
      connections: {
        supabase: Boolean(supabaseTok?.access_token),
        cloudflare: Boolean(cfTok),
      },
      bindings,
      sections: [
        ...(scope.isSuperadmin
          ? [
              { id: 'platform_d1', label: 'IAM Platform D1', owner_only: true },
              { id: 'platform_supabase_agentsam', label: 'IAM Platform Supabase (agentsam.*)', owner_only: true },
            ]
          : []),
        { id: 'public_learning', label: 'Public Learning (public.iam_*)', read_only: true },
        { id: 'customer_supabase', label: 'My Supabase', requires_connection: true },
        { id: 'customer_cloudflare_d1', label: 'My Cloudflare D1', requires_connection: true },
      ],
      banner:
        plane.data_plane === 'platform_supabase_agentsam'
          ? 'Agent Sam is operating on: IAM platform data — owner only'
          : plane.data_plane === 'customer_supabase' && plane.project_ref
            ? `Agent Sam is operating on: your Supabase project ${plane.project_ref}`
            : plane.data_plane === 'public_learning'
              ? 'Agent Sam is operating on: IAM public learning tables (read-only)'
              : 'Connect your data source to run queries on your infrastructure',
    });
  }

  if (pathLower === '/api/data-plane/public-learning/tables' && method === 'GET') {
    const out = await dispatchCustomerDataPlaneOperation(env, {
      operation: 'list_tables',
      data_plane: 'public_learning',
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      authUser,
    });
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  if (pathLower === '/api/data-plane/public-learning/query' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await dispatchCustomerDataPlaneOperation(env, {
      operation: 'run_readonly_sql',
      data_plane: 'public_learning',
      sql: body?.sql,
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      authUser,
    });
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  if (pathLower === '/api/data-plane/customer-supabase/projects' && method === 'GET') {
    const out = await customerSupabaseListProjects(env, userId, workspaceId);
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  if (pathLower === '/api/data-plane/customer-supabase/select' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await customerSupabaseSelectProjectForWorkspace(env, {
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      project_id: String(body?.project_id || body?.project_ref || ''),
      project_ref: body?.project_ref,
      display_name: body?.display_name,
    });
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  if (pathLower === '/api/data-plane/customer-supabase/query' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await dispatchCustomerDataPlaneOperation(env, {
      operation: 'run_readonly_sql',
      data_plane: 'customer_supabase',
      sql: body?.sql,
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      authUser,
    });
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  if (pathLower === '/api/data-plane/customer-cloudflare/accounts' && method === 'GET') {
    const out = await customerCloudflareListAccounts(env, userId);
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  if (pathLower === '/api/data-plane/dispatch' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await dispatchCustomerDataPlaneOperation(env, {
      operation: String(body?.operation || ''),
      message: body?.message,
      requested_provider: body?.provider,
      user_id: userId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      sql: body?.sql,
      migration_sql: body?.migration_sql,
      table: body?.table,
      schema: body?.schema,
      approval_id: body?.approval_id,
      authUser,
    });
    return jsonResponse(out, out.ok ? 200 : 400);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}
