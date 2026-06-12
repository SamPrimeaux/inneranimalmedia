/**
 * MY_CONTAINER lane — health probe + exec/render dispatch (PTY fallback when needed).
 * Image: registry …/meauxcontainer-mycontainer:6d6f76d2 (lite, 256 MiB).
 */

const CONTAINER_POOL_ID = 'meaux-pool';
const CONTAINER_PORT = 8080;

/** @param {any} env */
function containerNamespace(env) {
  return env?.MY_CONTAINER || env?.MOVIEMODE_RENDER || null;
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
    const stub = ns.getByName(CONTAINER_POOL_ID);
    await stub.startAndWaitForPorts({ ports: [CONTAINER_PORT] });
    const res = await stub.fetch('http://container/');
    const text = await res.text().catch(() => '');
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { bodyPreview: text.slice(0, 200) };
    }
    return {
      ok: res.ok,
      bound: true,
      lane: 'container',
      status: res.status,
      image: 'meauxcontainer-mycontainer:6d6f76d2',
      response: json,
    };
  } catch (e) {
    return {
      ok: false,
      bound: true,
      lane: 'container',
      image: 'meauxcontainer-mycontainer:6d6f76d2',
      error: String(e?.message || e).slice(0, 400),
    };
  }
}

/** @deprecated use probeMyContainer */
export const probeMoviemodeRenderContainer = probeMyContainer;

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
    const stub = ns.getByName(CONTAINER_POOL_ID);
    await stub.startAndWaitForPorts({ ports: [CONTAINER_PORT] });
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
