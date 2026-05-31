/**
 * GET /api/tunnel/status — shared by src/index.js and src/core/router.js.
 * Live ping only (TERMINAL_WS_URL/health or PTY-derived); no D1.
 */
import { jsonResponse } from './responses.js';
import { getAuthUser } from './auth.js';
import { pingTunnelHealth } from './status-bar-runtime.js';

export const TUNNEL_STATUS_PATH = '/api/tunnel/status';

export async function handleTunnelStatusGet(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  try {
    const result = await pingTunnelHealth(env);
    return jsonResponse({
      healthy: result.healthy,
      status: result.status,
      connections: result.healthy ? 1 : 0,
    });
  } catch (e) {
    return jsonResponse({ healthy: false, status: 'disconnected', connections: 0, error: e.message });
  }
}
