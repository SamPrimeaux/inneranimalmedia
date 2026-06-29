/**
 * POST /api/internal/terminal/sandbox/exec — zone sandbox via MY_CONTAINER (MCP + bridge).
 * Auth: INTERNAL_API_SECRET or superadmin session.
 */
import { getAuthUser, isSamOnlyUser, jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import { runMcpZoneSandboxCommand, normalizeMcpZoneSlug } from '../core/terminal-sandbox.js';

/**
 * @param {Request} request
 * @param {any} env
 */
export async function handleTerminalSandboxExec(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const internal = verifyInternalApiSecret(request, env);
  if (!internal) {
    const authUser = await getAuthUser(request, env);
    if (!authUser || !(await isSamOnlyUser(env, authUser))) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const command = String(body.command || '').trim();
  if (!command) {
    return jsonResponse({ ok: false, error: 'command_required' }, 400);
  }

  const workspaceId = String(body.workspace_id || body.workspaceId || '').trim();
  if (!workspaceId) {
    return jsonResponse({ ok: false, error: 'workspace_id_required' }, 400);
  }

  const zoneSlug = normalizeMcpZoneSlug(body.zone_slug ?? body.zoneSlug ?? 'engineer');
  const userId = String(body.user_id || body.userId || '').trim() || null;
  const tenantId = String(body.tenant_id || body.tenantId || '').trim() || null;

  const sb = await runMcpZoneSandboxCommand(env, request, {
    command,
    zoneSlug,
    tenantId,
    userId,
    workspaceId,
    sessionId: body.session_id ?? body.sessionId ?? null,
    config: body.config && typeof body.config === 'object' ? body.config : { target_type: 'container' },
    language: body.language,
    path: body.path ?? body.cwd,
  });

  return jsonResponse(
    {
      ok: sb.ok,
      error: sb.error || null,
      ...sb.body,
    },
    sb.ok ? 200 : 502,
  );
}
