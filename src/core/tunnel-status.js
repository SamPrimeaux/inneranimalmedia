/**
 * GET /api/tunnel/status — shared by src/index.js and src/core/router.js.
 * Kept separate so the worker entry bundle does not pull in all of router.js.
 */
import { jsonResponse } from './responses.js';
import { getAuthUser } from './auth.js';

export const TUNNEL_STATUS_PATH = '/api/tunnel/status';

export async function handleTunnelStatusGet(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ healthy: false, status: 'no-db', connections: 0 });
  try {
    const row = await env.DB.prepare(
      `SELECT tunnel_url, status, connections
       FROM tunnel_sessions
       WHERE user_id = ? AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
    ).bind(String(authUser.id)).first().catch(() => null);

    if (!row) return jsonResponse({ healthy: false, status: 'no-tunnel', connections: 0 });
    return jsonResponse({
      healthy: true,
      status: row.status,
      connections: row.connections ?? 0,
      tunnel_url: row.tunnel_url,
    });
  } catch (e) {
    return jsonResponse({ healthy: false, status: 'error', error: e.message, connections: 0 });
  }
}
