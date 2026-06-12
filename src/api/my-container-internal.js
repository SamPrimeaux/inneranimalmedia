/**
 * POST /api/internal/my-container/exec — run command in MY_CONTAINER sandbox-v2.
 * Auth: INTERNAL_API_SECRET or superadmin session.
 */
import { getAuthUser, isSamOnlyUser, jsonResponse, verifyInternalApiSecret } from '../core/auth.js';
import { tryContainerExec } from '../core/my-container.js';

/**
 * @param {Request} request
 * @param {any} env
 */
export async function handleMyContainerExec(request, env) {
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

  const out = await tryContainerExec(env, {
    command,
    cwd: body.cwd,
    timeout_ms: body.timeout_ms,
  });

  return jsonResponse(out, out.ok ? 200 : 502);
}
