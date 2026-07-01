/**
 * Authenticated sandbox API — proxies to MY_CONTAINER Go HTTP service.
 * Surfaces in existing agent/editor UI via status bar + Context tab (no /dashboard/lab).
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';
import {
  probeMyContainer,
  proxySandboxContainer,
  runSandboxSmokeExec,
  fetchSandboxContainerJson,
} from '../core/my-container.js';
import {
  sandboxR2FusePublicSummary,
  sandboxR2FuseConfigured,
} from '../core/sandbox-r2-fuse-env.js';

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 */
export async function handleSandboxApi(request, url, env) {
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/$/, '') || '/';

  const authUser = await getAuthUser(request, env);
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (path === '/api/sandbox/health' && method === 'GET') {
    const probe = await probeMyContainer(env);
    let exec_smoke = null;
    let mounts = null;
    if (probe.ok) {
      exec_smoke = await runSandboxSmokeExec(env);
      mounts = await fetchSandboxContainerJson(env, '/v1/mounts');
    }
    const r2_fuse = sandboxR2FusePublicSummary(env, mounts);
    return jsonResponse({
      ok: probe.ok && exec_smoke?.ok !== false,
      probe,
      exec_smoke,
      mounts,
      r2_fuse,
      r2_fuse_configured: sandboxR2FuseConfigured(env),
      image: probe.image || null,
      checked_at: Date.now(),
    });
  }

  if (path.startsWith('/api/sandbox/v1/')) {
    const subpath = path.slice('/api/sandbox'.length);
    return proxySandboxContainer(env, request, subpath);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

/**
 * Compact runtime summary for status bundle + mobile Context tab.
 * @param {any} env
 */
export async function fetchSandboxRuntimeSummary(env) {
  const probe = await probeMyContainer(env);
  if (!probe.ok) {
    return {
      ok: false,
      lane: 'container',
      label: probe.error || 'Container unavailable',
      image: probe.image || null,
    };
  }
  const exec_smoke = await runSandboxSmokeExec(env);
  const mounts = await fetchSandboxContainerJson(env, '/v1/mounts');
  const r2_fuse = sandboxR2FusePublicSummary(env, mounts);
  return {
    ok: exec_smoke?.ok === true,
    lane: 'container',
    label: exec_smoke?.ok ? 'CF sandbox ready' : exec_smoke?.error || 'Container exec failed',
    image: probe.image || null,
    stdout: exec_smoke?.stdout?.trim()?.slice(0, 120) || null,
    r2_fuse,
  };
}
