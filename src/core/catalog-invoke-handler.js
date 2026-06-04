/**
 * POST catalog-invoke — in-app agentsam_tools dispatch (same path as agent chat tools).
 * Mounted at /api/mcp/catalog-invoke and /api/agent/catalog-invoke on the main worker.
 */
import { getAuthUser, jsonResponse } from './auth.js';
import { resolveIamActorContext, resolveIdentity } from './identity.js';
import { dispatchByToolCode } from './dispatch-by-tool-code.js';
import { userHasSuperadminRole } from './resolve-credential.js';
import { loadAgentsamToolRow } from './agentsam-tools-catalog.js';
import { scheduleMirrorToolCallEventToSupabase } from './hyperdrive-write.js';

/**
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} [ctx]
 */
export async function handleCatalogInvokeApi(request, env, ctx) {
  if ((request.method || 'GET').toUpperCase() !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const toolName = String(body.tool_name || body.tool || body.tool_key || '').trim();
  const args =
    body.arguments && typeof body.arguments === 'object'
      ? body.arguments
      : body.params && typeof body.params === 'object'
        ? body.params
        : body.args && typeof body.args === 'object'
          ? body.args
          : {};

  if (!toolName) return jsonResponse({ error: 'tool_name required' }, 400);

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const actorCtx = await resolveIamActorContext(request, env).catch(() => null);
  const identity = await resolveIdentity(env, request).catch(() => null);

  const workspaceId =
    actorCtx?.workspaceId != null && String(actorCtx.workspaceId).trim() !== ''
      ? String(actorCtx.workspaceId).trim()
      : identity?.workspaceId != null
        ? String(identity.workspaceId).trim()
        : authUser.active_workspace_id != null
          ? String(authUser.active_workspace_id).trim()
          : '';
  const userId =
    actorCtx?.userId != null && String(actorCtx.userId).trim() !== ''
      ? String(actorCtx.userId).trim()
      : authUser?.id != null
        ? String(authUser.id).trim()
        : '';
  const tenantId =
    actorCtx?.tenantId != null && String(actorCtx.tenantId).trim() !== ''
      ? String(actorCtx.tenantId).trim()
      : identity?.tenantId != null
        ? String(identity.tenantId).trim()
        : authUser.tenant_id != null
          ? String(authUser.tenant_id).trim()
          : '';

  if (!workspaceId || !userId) {
    return jsonResponse({ error: 'WORKSPACE_CONTEXT_MISSING' }, 400);
  }

  let toolRow = null;
  try {
    toolRow = await loadAgentsamToolRow(env, toolName);
  } catch (_) {}

  const isSuperadmin = userHasSuperadminRole(authUser);
  const execT0 = Date.now();
  const catalogOut = await dispatchByToolCode(env, toolName, args, {
    tenantId,
    userId,
    workspaceId,
    authUser,
    request,
    isOperatorCall: isSuperadmin,
    isInternalAgent: false,
  });
  const invokeDurationMs = Math.max(0, Date.now() - execT0);

  if (catalogOut?.ok === false) {
    scheduleMirrorToolCallEventToSupabase(env, ctx, {
      workspace_id: workspaceId,
      run_id: actorCtx?.supabase_run_id ?? actorCtx?.workflow_run_id ?? null,
      tool_key: toolName,
      tool_name: toolName,
      tool_category: toolRow?.tool_category ?? 'catalog',
      status: 'failed',
      duration_ms: invokeDurationMs,
    });
    return jsonResponse(
      {
        ok: false,
        error: catalogOut.error ?? 'dispatch_failed',
        tool_key: catalogOut.tool_key ?? toolName,
        body: catalogOut.body ?? null,
      },
      422,
    );
  }

  scheduleMirrorToolCallEventToSupabase(env, ctx, {
    workspace_id: workspaceId,
    run_id: actorCtx?.supabase_run_id ?? actorCtx?.workflow_run_id ?? null,
    tool_key: toolName,
    tool_name: toolName,
    tool_category: toolRow?.tool_category ?? 'catalog',
    status: 'completed',
    duration_ms: invokeDurationMs,
  });

  return jsonResponse({
    ok: true,
    result: catalogOut.result ?? catalogOut,
    tool_key: catalogOut.tool_key ?? toolName,
    auth_source: catalogOut.auth_source ?? null,
  });
}
