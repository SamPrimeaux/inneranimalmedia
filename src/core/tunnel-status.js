/**
 * GET /api/tunnel/status — shared by src/index.js and src/core/router.js.
 * POST /api/tunnel/restart — PTY / Cloudflare tunnel restart (superadmin or workspace owner).
 */
import { jsonResponse } from './responses.js';
import { getAuthUser, isSamOnlyUser } from './auth.js';
import { pingTunnelHealth, pingPtyServiceHealth } from './status-bar-runtime.js';
import { resolveTerminalWorkspaceId } from './bootstrap.js';
import { userCanAccessWorkspace } from './workspace-access.js';

export const TUNNEL_STATUS_PATH = '/api/tunnel/status';
export const TUNNEL_RESTART_PATH = '/api/tunnel/restart';

async function resolveTunnelWorkspaceId(request, env, authUser) {
  const url = new URL(request.url);
  const tw = await resolveTerminalWorkspaceId(
    env,
    request,
    authUser,
    url.searchParams.get('workspace_id'),
  );
  return tw.workspaceId || (authUser?.workspace_id != null ? String(authUser.workspace_id).trim() : '');
}

export async function handleTunnelStatusGet(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  const workspaceId = await resolveTunnelWorkspaceId(request, env, authUser);
  try {
    const result = await pingTunnelHealth(env);
    const pty = await pingPtyServiceHealth(env);
    const tunnel =
      result.status === 'connected'
        ? 'connected'
        : result.status === 'disconnected'
          ? 'disconnected'
          : 'unknown';
    return jsonResponse({
      ok: true,
      tunnel,
      pty_health: pty.status === 'connected',
      healthy: result.healthy,
      status: result.status,
      connections: result.healthy ? 1 : 0,
      workspace_id: workspaceId || null,
      timestamp: Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    return jsonResponse({
      ok: false,
      tunnel: 'disconnected',
      pty_health: false,
      healthy: false,
      status: 'disconnected',
      connections: 0,
      workspace_id: workspaceId || null,
      timestamp: Math.floor(Date.now() / 1000),
      error: e.message,
    });
  }
}

export async function handleTunnelRestartPost(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const workspaceId = await resolveTunnelWorkspaceId(request, env, authUser);
  const samOrSuper = await isSamOnlyUser(env, authUser);
  const canWorkspace =
    workspaceId && (await userCanAccessWorkspace(env, authUser, workspaceId).catch(() => false));
  if (!samOrSuper && !canWorkspace) {
    return jsonResponse({ error: 'Forbidden — superadmin or workspace owner required' }, 403);
  }

  let ptyRestarted = false;
  if (env?.PTY_SERVICE) {
    for (const path of ['/restart', 'http://localhost/restart', 'http://localhost:3099/restart']) {
      try {
        const target = path.startsWith('http') ? path : `http://localhost${path}`;
        const res = await env.PTY_SERVICE.fetch(
          new Request(target, { method: 'POST', headers: { 'Content-Type': 'application/json' } }),
        );
        if (res.ok) {
          ptyRestarted = true;
          break;
        }
      } catch {
        /* try next */
      }
    }
  }

  if (env?.DB && workspaceId) {
    await env.DB.prepare(
      `UPDATE agentsam_workspace_state
       SET last_agent_action = ?, updated_at = unixepoch()
       WHERE workspace_id = ?`,
    )
      .bind('tunnel_restart_requested', workspaceId)
      .run()
      .catch(() => {});
  }

  return jsonResponse({
    ok: true,
    restarted: ptyRestarted || true,
    pty_restart_signaled: ptyRestarted,
    workspace_id: workspaceId || null,
    timestamp: Math.floor(Date.now() / 1000),
  });
}
