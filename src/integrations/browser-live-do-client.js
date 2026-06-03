/**
 * Worker facade for AgentBrowserLiveV1 (BROWSER_SESSION DO).
 * Auth and trust checks happen at the Worker boundary before proxying.
 */

/**
 * @param {any} env
 */
export function browserLiveDoRequired(env) {
  return Boolean(env?.BROWSER_SESSION);
}

/**
 * @param {any} env
 * @returns {{ ok: true } | { ok: false, error: string, status: number }}
 */
export function assertBrowserLiveDoAvailable(env) {
  if (env?.BROWSER_SESSION) return { ok: true };
  const deployEnv = String(env?.ENVIRONMENT || env?.DEPLOY_ENV || '').toLowerCase();
  if (deployEnv === 'production') {
    return {
      ok: false,
      error: 'BROWSER_SESSION binding required for agent live browser in production',
      status: 503,
    };
  }
  return { ok: false, error: 'BROWSER_SESSION not configured', status: 503 };
}

/**
 * @param {any} env
 * @param {string} agentRunId
 */
export function getBrowserLiveStub(env, agentRunId) {
  const id = String(agentRunId || '').trim();
  if (!id || !env?.BROWSER_SESSION) return null;
  return env.BROWSER_SESSION.get(env.BROWSER_SESSION.idFromName(id));
}

/**
 * @param {any} env
 * @param {string} agentRunId
 * @param {string} userId
 */
export async function assertAgentRunAccess(env, agentRunId, userId) {
  const runId = String(agentRunId || '').trim();
  const uid = String(userId || '').trim();
  if (!runId || !uid) return { ok: false, error: 'agent_run_id and user_id required', status: 400 };
  if (!env?.DB) return { ok: true };

  try {
    const row = await env.DB.prepare(
      'SELECT id, user_id, workspace_id FROM agentsam_agent_run WHERE id = ? LIMIT 1',
    )
      .bind(runId)
      .first();
    if (!row) return { ok: false, error: 'agent run not found', status: 404 };
    if (String(row.user_id) !== uid) {
      return { ok: false, error: 'Forbidden', status: 403 };
    }
    return { ok: true, workspace_id: row.workspace_id ?? null };
  } catch (e) {
    console.warn('[assertAgentRunAccess]', e?.message ?? e);
    return { ok: true };
  }
}

/**
 * @param {any} env
 * @param {string} agentRunId
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function proxyToBrowserLiveDo(env, agentRunId, path, init = {}) {
  const stub = getBrowserLiveStub(env, agentRunId);
  if (!stub) {
    const gate = assertBrowserLiveDoAvailable(env);
    return { ok: false, error: gate.error || 'BROWSER_SESSION not configured', status: gate.status || 503 };
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `https://browser-live.internal${normalized}`;
  const res = await stub.fetch(new Request(url, init));
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = { error: res.statusText || 'DO request failed' };
  }
  return { ...body, ok: body.ok !== false && res.ok, status: res.status };
}

/**
 * @param {any} env
 * @param {string} agentRunId
 * @param {{ url?: string|null, keepAliveMs?: number, liveViewMode?: string, userId?: string, workspaceId?: string, tool_name?: string }} [opts]
 */
export async function ensureAgentLiveBrowserSessionViaDo(env, agentRunId, opts = {}) {
  return proxyToBrowserLiveDo(env, agentRunId, '/session/ensure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_run_id: agentRunId,
      url: opts.url ?? null,
      keep_alive_ms: opts.keepAliveMs,
      live_view_mode: opts.liveViewMode,
      user_id: opts.userId ?? opts.user_id,
      workspace_id: opts.workspaceId ?? opts.workspace_id,
      tool_name: opts.tool_name,
    }),
  });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 */
export async function getAgentLiveBrowserSessionViaDo(env, agentRunId) {
  const out = await proxyToBrowserLiveDo(env, agentRunId, '/session', { method: 'GET' });
  if (!out.ok) return null;
  return out.live_session ?? out.session ?? null;
}

/**
 * @param {any} env
 * @param {string} agentRunId
 */
export async function refreshAgentLiveBrowserUrlViaDo(env, agentRunId) {
  return proxyToBrowserLiveDo(env, agentRunId, '/session/live-url', { method: 'GET' });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 * @param {{ url?: string, title?: string, tool_name?: string, action_phase?: string, ok?: boolean }} patch
 */
export async function patchAgentLiveBrowserSessionViaDo(env, agentRunId, patch) {
  return proxyToBrowserLiveDo(env, agentRunId, '/session/patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 * @param {number} [limit]
 */
export async function getBrowserLiveEventsViaDo(env, agentRunId, limit = 50) {
  const n = Math.min(100, Math.max(1, Number(limit) || 50));
  return proxyToBrowserLiveDo(env, agentRunId, `/events?limit=${n}`, { method: 'GET' });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 * @param {{ reason: string, url?: string, resumeWhen?: string, selector?: string, timeoutMs?: number, userId?: string, workspaceId?: string }} input
 */
export async function requestBrowserHumanInputViaDo(env, agentRunId, input) {
  return proxyToBrowserLiveDo(env, agentRunId, '/human-input/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_run_id: agentRunId,
      reason: input.reason,
      url: input.url,
      resume_when: input.resumeWhen ?? input.resume_when,
      selector: input.selector,
      timeout_ms: input.timeoutMs,
      user_id: input.userId,
      workspace_id: input.workspaceId,
    }),
  });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 */
export async function signalBrowserHumanInputResumeViaDo(env, agentRunId) {
  return proxyToBrowserLiveDo(env, agentRunId, '/human-input/resume', { method: 'POST' });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 */
export async function cancelBrowserHumanInputViaDo(env, agentRunId) {
  return proxyToBrowserLiveDo(env, agentRunId, '/human-input/cancel', { method: 'POST' });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 */
export async function closeAgentLiveBrowserSessionViaDo(env, agentRunId) {
  return proxyToBrowserLiveDo(env, agentRunId, '/session/close', { method: 'DELETE' });
}

/**
 * @param {any} env
 * @param {string} agentRunId
 */
export async function getBrowserLiveDoHealth(env, agentRunId) {
  return proxyToBrowserLiveDo(env, agentRunId, '/health', { method: 'GET' });
}

/**
 * Proxy WebSocket upgrade to the DO /ws handler.
 * @param {any} env
 * @param {string} agentRunId
 * @param {Request} request
 */
export async function proxyBrowserLiveWebSocket(env, agentRunId, request) {
  const stub = getBrowserLiveStub(env, agentRunId);
  if (!stub) {
    return new Response('BROWSER_SESSION not configured', { status: 503 });
  }
  return stub.fetch(
    new Request('https://browser-live.internal/ws', {
      headers: request.headers,
    }),
  );
}
