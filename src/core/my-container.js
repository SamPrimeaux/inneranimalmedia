/**
 * MY_CONTAINER lane — health probe, exec, render dispatch.
 * Image: registry …/inneranimalmedia:sandbox-v3 (basic, 1 GiB).
 * Instance id: inneranimalmedia (matches worker name — single platform pool).
 */

export const CONTAINER_IMAGE_REF =
  'registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/inneranimalmedia:sandbox-v3';
export const CONTAINER_IMAGE_TAG = 'inneranimalmedia:sandbox-v3';

/** Legacy getByName ids from pre-inneranimalmedia pool routing — safe to destroy. */
export const LEGACY_CONTAINER_INSTANCE_NAMES = Object.freeze([
  'meaux-pool',
  'specialist',
  'samprimeaux',
  'sam',
  'engineer',
  'default',
]);

/** Default MY_CONTAINER pool id — must match worker name (wrangler name = inneranimalmedia). */
export const CONTAINER_POOL_ID_DEFAULT = 'inneranimalmedia';

/** @param {any} env */
export function resolveContainerPoolId(env) {
  const fromEnv = String(env?.CONTAINER_POOL_ID || '').trim();
  return fromEnv || CONTAINER_POOL_ID_DEFAULT;
}

const CONTAINER_PORT = 8080;
/** Worker → DO → container HTTP (includes cold start). */
export const CONTAINER_FETCH_TIMEOUT_MS = 90_000;
/** In-container command budget after instance is up (server.mjs caps at 120s). */
export const CONTAINER_EXEC_COMMAND_TIMEOUT_MS = 90_000;
/** Agent/MCP Promise.race budget — cold start (10–20s+) + command headroom. */
export const CONTAINER_TOOL_EXECUTION_BUDGET_MS = 120_000;

/** @param {string} toolName */
export function isContainerExecToolName(toolName) {
  const n = String(toolName || '').trim().toLowerCase();
  return (
    n === 'agentsam_terminal_sandbox' ||
    n === 'agentsam_container_exec' ||
    n === 'terminal_run' ||
    n === 'terminal_execute' ||
    n === 'terminal_wrangler' ||
    n === 'run_command' ||
    n === 'bash'
  );
}

/**
 * @param {any} stub
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function containerFetch(stub, path, init = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CONTAINER_FETCH_TIMEOUT_MS);
  try {
    return await stub.fetch(`http://container${path}`, {
      ...init,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** @param {any} env */
function containerNamespace(env) {
  return env?.MY_CONTAINER || env?.MOVIEMODE_RENDER || null;
}

/**
 * @param {any} env
 * @param {{ ports?: number[] }} [opts]
 */
async function getContainerStub(env) {
  const ns = containerNamespace(env);
  if (!ns?.getByName) return null;
  return ns.getByName(resolveContainerPoolId(env));
}

/**
 * @param {any} env
 */
export async function probeMyContainer(env) {
  const ns = containerNamespace(env);
  if (!ns?.getByName) {
    return { ok: false, bound: false, lane: 'container', image: null };
  }
  try {
    const stub = await getContainerStub(env);
    if (!stub) {
      return { ok: false, bound: false, lane: 'container', image: CONTAINER_IMAGE_TAG };
    }
    const res = await containerFetch(stub, '/health');
    const text = await res.text().catch(() => '');
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { bodyPreview: text.slice(0, 200) };
    }
    return {
      ok: res.ok && json?.ok !== false,
      bound: true,
      lane: 'container',
      status: res.status,
      image: CONTAINER_IMAGE_TAG,
      pool_id: resolveContainerPoolId(env),
      response: json,
    };
  } catch (e) {
    return {
      ok: false,
      bound: true,
      lane: 'container',
      image: CONTAINER_IMAGE_TAG,
      error: String(e?.message || e).slice(0, 400),
    };
  }
}

/** @deprecated use probeMyContainer */
export const probeMoviemodeRenderContainer = probeMyContainer;

/**
 * Single platform container instance — always inneranimalmedia (worker name).
 * zone_slug is metadata + cwd isolation only, not a separate DO instance id.
 * @param {any} env
 * @param {string} [_zoneSlug]
 */
async function getZoneContainerStub(env, _zoneSlug) {
  return getContainerStub(env);
}

/**
 * Per-zone sandbox exec (zone_slug → Container DO instance id).
 * @param {any} env
 * @param {{ command: string, zone_slug?: string, cwd?: string, timeout_ms?: number }} opts
 */
export async function tryZoneContainerExec(env, opts) {
  const command = String(opts?.command || '').trim();
  const zoneSlug = String(opts?.zone_slug || 'default').trim() || 'default';
  if (!command) {
    return { ok: false, error: 'command_required', lane: 'container', zone_slug: zoneSlug };
  }

  const ns = containerNamespace(env);
  if (!ns?.getByName) {
    return { ok: false, error: 'container_unbound', lane: 'container', zone_slug: zoneSlug };
  }

  try {
    const stub = await getZoneContainerStub(env, zoneSlug);
    if (!stub) {
      return { ok: false, error: 'container_unbound', lane: 'container', zone_slug: zoneSlug };
    }

    const res = await containerFetch(stub, '/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        cwd: opts.cwd ? String(opts.cwd) : '/tmp',
        timeout_ms:
          opts.timeout_ms != null && Number.isFinite(Number(opts.timeout_ms))
            ? Number(opts.timeout_ms)
            : CONTAINER_EXEC_COMMAND_TIMEOUT_MS,
      }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      lane: 'container',
      zone_slug: zoneSlug,
      pool_id: resolveContainerPoolId(env),
      image: CONTAINER_IMAGE_TAG,
      http_status: res.status,
      ...data,
    };
  } catch (e) {
    const msg = String(e?.message || e);
    const timedOut = /abort|timeout/i.test(msg);
    return {
      ok: false,
      lane: 'container',
      zone_slug: zoneSlug,
      image: CONTAINER_IMAGE_TAG,
      error: timedOut ? 'container_start_timeout' : msg.slice(0, 400),
    };
  }
}

/**
 * @param {any} env
 * @param {{ command: string, cwd?: string, timeout_ms?: number }} opts
 */
export async function tryContainerExec(env, opts) {
  const command = String(opts?.command || '').trim();
  if (!command) {
    return { ok: false, error: 'command_required', lane: 'container' };
  }

  const ns = containerNamespace(env);
  if (!ns?.getByName) {
    return { ok: false, error: 'container_unbound', lane: 'container' };
  }

  try {
    const stub = await getContainerStub(env);
    if (!stub) {
      return { ok: false, error: 'container_unbound', lane: 'container' };
    }

    const res = await containerFetch(stub, '/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        cwd: opts.cwd ? String(opts.cwd) : '/tmp',
        timeout_ms:
          opts.timeout_ms != null && Number.isFinite(Number(opts.timeout_ms))
            ? Number(opts.timeout_ms)
            : CONTAINER_EXEC_COMMAND_TIMEOUT_MS,
      }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      lane: 'container',
      image: CONTAINER_IMAGE_TAG,
      pool_id: resolveContainerPoolId(env),
      http_status: res.status,
      ...data,
    };
  } catch (e) {
    const msg = String(e?.message || e);
    const timedOut = /abort|timeout/i.test(msg);
    return {
      ok: false,
      lane: 'container',
      image: CONTAINER_IMAGE_TAG,
      error: timedOut ? 'container_start_timeout' : msg.slice(0, 400),
    };
  }
}

/**
 * Destroy legacy DO container instances (dashboard clutter from old zone routing).
 * @param {any} env
 * @param {string[]} [names]
 */
export async function purgeLegacyContainerInstances(env, names = LEGACY_CONTAINER_INSTANCE_NAMES) {
  const ns = containerNamespace(env);
  if (!ns?.getByName) {
    return { ok: false, error: 'container_unbound', results: [] };
  }

  const poolId = resolveContainerPoolId(env);
  /** @type {Array<{ name: string, ok: boolean, error?: string }>} */
  const results = [];

  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name || name === poolId) continue;
    try {
      const stub = ns.getByName(name);
      const res = await stub.fetch('http://container/__admin/destroy', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      results.push({ name, ok: res.ok && data?.destroyed !== false, error: data?.error });
    } catch (e) {
      results.push({ name, ok: false, error: String(e?.message || e).slice(0, 200) });
    }
  }

  return { ok: results.every((r) => r.ok), pool_id: poolId, results };
}

/**
 * @param {any} env
 * @param {string} jobId
 * @param {Record<string, unknown>} job
 */
export async function tryMoviemodeRenderOnContainer(env, jobId, job) {
  const ns = containerNamespace(env);
  if (!ns?.getByName) {
    return { handled: false, fallback: true, reason: 'container_unbound' };
  }

  try {
    const stub = await getContainerStub(env);
    if (!stub) {
      return { handled: false, fallback: true, reason: 'container_unbound' };
    }

    const res = await stub.fetch('http://container/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        session: job.session,
        config: job.config,
        outputFilename: job.outputFilename,
        workspaceId: job.workspaceId,
        tenantId: job.tenantId,
        userId: job.userId,
        origin: env.IAM_ORIGIN || 'https://inneranimalmedia.com',
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 404 || res.status === 501 || data.fallback === true) {
      return {
        handled: false,
        fallback: true,
        reason: data.error || `container_http_${res.status}`,
        containerStatus: res.status,
      };
    }

    if (!res.ok) {
      return {
        handled: false,
        fallback: true,
        reason: data.error || `container_http_${res.status}`,
        containerStatus: res.status,
      };
    }

    return { handled: true, fallback: false, result: data };
  } catch (e) {
    return {
      handled: false,
      fallback: true,
      reason: 'container_error',
      error: String(e?.message || e).slice(0, 400),
    };
  }
}
