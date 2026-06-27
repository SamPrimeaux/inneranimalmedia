/**
 * MY_CONTAINER lane — health probe, exec, render dispatch (PTY fallback when needed).
 * Image: registry …/meauxcontainer-mycontainer:sandbox-v2 (basic, 1 GiB).
 */

export const CONTAINER_IMAGE_REF =
  'registry.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/meauxcontainer-mycontainer:sandbox-v2';
export const CONTAINER_IMAGE_TAG = 'meauxcontainer-mycontainer:sandbox-v2';

const CONTAINER_POOL_ID = 'meaux-pool';
const CONTAINER_PORT = 8080;

/** @param {any} env */
function containerNamespace(env) {
  return env?.MY_CONTAINER || env?.MOVIEMODE_RENDER || null;
}

/**
 * @param {any} env
 * @param {{ ports?: number[] }} [opts]
 */
async function getContainerStub(env, opts = {}) {
  const ns = containerNamespace(env);
  if (!ns?.getByName) return null;
  const stub = ns.getByName(CONTAINER_POOL_ID);
  await stub.startAndWaitForPorts({ ports: opts.ports || [CONTAINER_PORT] });
  return stub;
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
    const res = await stub.fetch('http://container/health');
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
 * @param {any} env
 * @param {string} zoneSlug
 * @param {{ ports?: number[] }} [opts]
 */
async function getZoneContainerStub(env, zoneSlug, opts = {}) {
  const ns = containerNamespace(env);
  const id = String(zoneSlug || 'default').trim().slice(0, 128) || 'default';
  if (!ns?.getByName) return null;
  const stub = ns.getByName(id);
  await stub.startAndWaitForPorts({ ports: opts.ports || [CONTAINER_PORT] });
  return stub;
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

    const res = await stub.fetch('http://container/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        cwd: opts.cwd ? String(opts.cwd) : '/tmp',
        timeout_ms: opts.timeout_ms,
      }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      lane: 'container',
      zone_slug: zoneSlug,
      image: CONTAINER_IMAGE_TAG,
      http_status: res.status,
      ...data,
    };
  } catch (e) {
    return {
      ok: false,
      lane: 'container',
      zone_slug: zoneSlug,
      image: CONTAINER_IMAGE_TAG,
      error: String(e?.message || e).slice(0, 400),
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

    const res = await stub.fetch('http://container/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command,
        cwd: opts.cwd ? String(opts.cwd) : '/tmp',
        timeout_ms: opts.timeout_ms,
      }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      lane: 'container',
      image: CONTAINER_IMAGE_TAG,
      http_status: res.status,
      ...data,
    };
  } catch (e) {
    return {
      ok: false,
      lane: 'container',
      image: CONTAINER_IMAGE_TAG,
      error: String(e?.message || e).slice(0, 400),
    };
  }
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
