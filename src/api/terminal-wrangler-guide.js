/**
 * GET /api/terminal/wrangler-guide — lane-aware Wrangler auth paths (no secrets).
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';
import {
  WRANGLER_GENERAL_COMMANDS,
  WRANGLER_DOCS_URL,
  wranglerAuthGuideForLane,
} from '../core/wrangler-terminal-guidance.js';
import { probeMyContainer } from '../core/my-container.js';

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
export async function handleTerminalWranglerGuide(request, url, env) {
  if (request.method.toUpperCase() !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const laneParam = url.searchParams.get('lane') || 'sandbox';
  const lane =
    laneParam === 'local' || laneParam === 'remote' || laneParam === 'sandbox' || laneParam === 'auto'
      ? laneParam
      : 'sandbox';

  const guide = wranglerAuthGuideForLane(lane);
  const probe = await probeMyContainer(env);
  let wrangler_whoami = null;
  if (probe.ok && lane === 'sandbox') {
    const { prepareContainerShellCommand } = await import('../core/wrangler-terminal-guidance.js');
    const { tryContainerExec } = await import('../core/my-container.js');
    const prep = prepareContainerShellCommand(
      env,
      authUser,
      'wrangler whoami --json 2>&1 || wrangler whoami 2>&1',
      'sandbox',
    );
    if (prep.ok) {
      wrangler_whoami = await tryContainerExec(env, {
        command: prep.command,
        cwd: '/tmp',
        timeout_ms: 25_000,
        authUser,
        skip_wrangler_normalize: true,
      });
    } else {
      wrangler_whoami = { ok: false, error: prep.error, guidance: prep.guidance };
    }
  }

  return jsonResponse({
    ok: true,
    docs: WRANGLER_DOCS_URL,
    lane,
    guide,
    general_commands: WRANGLER_GENERAL_COMMANDS,
    container_probe: probe,
    wrangler_whoami,
    checked_at: Date.now(),
  });
}
