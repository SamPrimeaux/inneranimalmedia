/**
 * Agent Live Browser Session — one Browser Run CDP session per agent_run_id.
 * Human + agent share the same session via live.browser.run (devtoolsFrontendUrl).
 */
import {
  createBrowserRunSession,
  navigateBrowserRunTab,
  refreshBrowserRunLiveView,
  deleteBrowserRunSession,
} from './browser-run-session.js';
import {
  resolveBrowserRunScopeId,
  getStoredBrowserSession,
  saveBrowserSession,
  closeBrowserRunSession,
} from './browser-session.js';
import { assertBrowserLiveDoAvailable, browserLiveDoRequired } from './browser-live-do-client.js';

/** Cloudflare Live View URL validity (~5 min); refresh before expiry. */
export const LIVE_VIEW_URL_TTL_MS = 5 * 60 * 1000;
export const LIVE_VIEW_REFRESH_MS = 4 * 60 * 1000;
export const DEFAULT_AGENT_KEEP_ALIVE_MS = 600_000;

/**
 * @typedef {Object} AgentLiveBrowserSession
 * @property {string} agentRunId
 * @property {string} sessionId
 * @property {string|null} targetId
 * @property {string|null} currentUrl
 * @property {string|null} [title]
 * @property {string|null} devtoolsFrontendUrl
 * @property {string|null} webSocketDebuggerUrl
 * @property {'tab'|'devtools'} liveViewMode
 * @property {'starting'|'active'|'needs_human'|'paused'|'resuming'|'closed'} status
 * @property {string|null} [expiresAt]
 * @property {number} keepAliveMs
 * @property {string|null} [humanInputReason]
 * @property {'manual'|'navigation'|'selector'} [resumeWhen]
 * @property {string|null} [resumeSelector]
 */

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {string} scopeId
 * @returns {AgentLiveBrowserSession|null}
 */
export function toAgentLiveBrowserSession(raw, scopeId) {
  if (!raw || typeof raw !== 'object') return null;
  const sessionId = String(raw.sessionId || raw.session_id || '').trim();
  if (!sessionId) return null;
  const mode = String(raw.liveViewMode || raw.live_view_mode || 'tab').toLowerCase();
  return {
    agentRunId: scopeId,
    sessionId,
    targetId: raw.targetId != null ? String(raw.targetId) : raw.target_id != null ? String(raw.target_id) : null,
    currentUrl:
      raw.currentUrl != null
        ? String(raw.currentUrl)
        : raw.current_url != null
          ? String(raw.current_url)
          : null,
    title: raw.title != null ? String(raw.title) : null,
    devtoolsFrontendUrl:
      raw.devtoolsFrontendUrl != null
        ? String(raw.devtoolsFrontendUrl)
        : raw.devtools_frontend_url != null
          ? String(raw.devtools_frontend_url)
          : null,
    webSocketDebuggerUrl:
      raw.webSocketDebuggerUrl != null
        ? String(raw.webSocketDebuggerUrl)
        : raw.web_socket_debugger_url != null
          ? String(raw.web_socket_debugger_url)
          : null,
    liveViewMode: mode === 'devtools' ? 'devtools' : 'tab',
    status: normalizeLiveSessionStatus(raw.status),
    expiresAt:
      raw.expiresAt != null
        ? String(raw.expiresAt)
        : raw.devtools_url_expires_at != null
          ? String(raw.devtools_url_expires_at)
          : null,
    keepAliveMs: Number(raw.keepAliveMs ?? raw.keep_alive_ms) || DEFAULT_AGENT_KEEP_ALIVE_MS,
    humanInputReason:
      raw.humanInputReason != null
        ? String(raw.humanInputReason)
        : raw.human_input_reason != null
          ? String(raw.human_input_reason)
          : null,
    resumeWhen: normalizeResumeWhen(raw.resumeWhen ?? raw.resume_when),
    resumeSelector:
      raw.resumeSelector != null
        ? String(raw.resumeSelector)
        : raw.resume_selector != null
          ? String(raw.resume_selector)
          : null,
  };
}

/** @param {unknown} v */
function normalizeLiveSessionStatus(v) {
  const s = String(v || 'active').toLowerCase();
  if (['starting', 'active', 'needs_human', 'paused', 'resuming', 'closed'].includes(s)) return s;
  return 'active';
}

/** @param {unknown} v */
function normalizeResumeWhen(v) {
  const s = String(v || 'manual').toLowerCase();
  if (s === 'navigation' || s === 'selector') return s;
  return 'manual';
}

/**
 * @param {AgentLiveBrowserSession} session
 */
export function serializeAgentLiveBrowserSession(session) {
  const expiresAt =
    session.expiresAt ||
    new Date(Date.now() + LIVE_VIEW_URL_TTL_MS).toISOString();
  return {
    sessionId: session.sessionId,
    targetId: session.targetId,
    current_url: session.currentUrl,
    title: session.title,
    devtools_frontend_url: session.devtoolsFrontendUrl,
    devtoolsFrontendUrl: session.devtoolsFrontendUrl,
    web_socket_debugger_url: session.webSocketDebuggerUrl,
    webSocketDebuggerUrl: session.webSocketDebuggerUrl,
    live_view_mode: session.liveViewMode,
    liveViewMode: session.liveViewMode,
    status: session.status,
    devtools_url_expires_at: expiresAt,
    expiresAt,
    keep_alive_ms: session.keepAliveMs,
    keepAliveMs: session.keepAliveMs,
    human_input_reason: session.humanInputReason,
    resume_when: session.resumeWhen,
    resume_selector: session.resumeSelector,
    human_resume_signal: session.status === 'resuming' ? 1 : 0,
  };
}

/**
 * @param {any} env
 * @param {string} scopeId
 */
export async function getAgentLiveBrowserSession(env, scopeId) {
  const id = String(scopeId || '').trim();
  if (!id) return null;
  if (browserLiveDoRequired(env)) {
    const { getAgentLiveBrowserSessionViaDo } = await import('./browser-live-do-client.js');
    const live = await getAgentLiveBrowserSessionViaDo(env, id);
    if (live) return toAgentLiveBrowserSession(live, id);
    return null;
  }
  const gate = assertBrowserLiveDoAvailable(env);
  if (!gate.ok) return null;
  const raw = await getStoredBrowserSession(env, id);
  return toAgentLiveBrowserSession(raw, id);
}

/**
 * @param {any} env
 * @param {string} scopeId
 * @param {AgentLiveBrowserSession} session
 */
export async function persistAgentLiveBrowserSession(env, scopeId, session) {
  if (browserLiveDoRequired(env)) {
    const { patchAgentLiveBrowserSessionViaDo } = await import('./browser-live-do-client.js');
    await patchAgentLiveBrowserSessionViaDo(env, scopeId, {
      url: session.currentUrl,
      title: session.title,
    }).catch(() => {});
    return;
  }
  await saveBrowserSession(env, scopeId, serializeAgentLiveBrowserSession(session));
}

/**
 * Ensure a Browser Run session exists for this agent run and optionally navigate.
 * Prefers BROWSER_SESSION DO when bound; falls back to KV for local dev without DO.
 * @param {any} env
 * @param {string} scopeId
 * @param {{ url?: string|null, keepAliveMs?: number, liveViewMode?: 'tab'|'devtools', userId?: string, workspaceId?: string, tool_name?: string }} [opts]
 */
export async function ensureAgentLiveBrowserSession(env, scopeId, opts = {}) {
  if (browserLiveDoRequired(env)) {
    const { ensureAgentLiveBrowserSessionViaDo } = await import('./browser-live-do-client.js');
    return ensureAgentLiveBrowserSessionViaDo(env, scopeId, opts);
  }
  const gate = assertBrowserLiveDoAvailable(env);
  if (!gate.ok) return gate;
  return ensureAgentLiveBrowserSessionKv(env, scopeId, opts);
}

async function ensureAgentLiveBrowserSessionKv(env, scopeId, opts = {}) {
  const id = String(scopeId || '').trim();
  if (!id) return { ok: false, error: 'agent_run_id required' };

  const keepAliveMs = Math.min(
    600_000,
    Math.max(60_000, Number(opts.keepAliveMs) || DEFAULT_AGENT_KEEP_ALIVE_MS),
  );
  const targetUrl = opts.url != null ? String(opts.url).trim() : '';
  const liveViewMode = opts.liveViewMode === 'devtools' ? 'devtools' : 'tab';

  let stored = await getAgentLiveBrowserSession(env, id);
  let sessionId = stored?.sessionId || '';

  if (!sessionId || stored?.status === 'closed') {
    const created = await createBrowserRunSession(env, { keepAliveMs, targets: true });
    if (!created.ok) return created;
    sessionId = created.sessionId;
    stored = {
      agentRunId: id,
      sessionId,
      targetId: created.targetId ?? null,
      currentUrl: created.url ?? null,
      title: created.title ?? null,
      devtoolsFrontendUrl: created.devtoolsFrontendUrl ?? null,
      webSocketDebuggerUrl: created.webSocketDebuggerUrl ?? null,
      liveViewMode,
      status: 'starting',
      expiresAt: new Date(Date.now() + LIVE_VIEW_URL_TTL_MS).toISOString(),
      keepAliveMs,
    };
  }

  if (targetUrl) {
    const navigated = await navigateBrowserRunTab(env, { sessionId, url: targetUrl });
    if (!navigated.ok) {
      const created = await createBrowserRunSession(env, { keepAliveMs, targets: true });
      if (!created.ok) return created;
      sessionId = created.sessionId;
      const retry = await navigateBrowserRunTab(env, { sessionId, url: targetUrl });
      if (!retry.ok) return retry;
      stored = {
        ...stored,
        sessionId,
        targetId: retry.targetId ?? created.targetId ?? null,
        currentUrl: retry.url ?? targetUrl,
        title: retry.title ?? null,
        devtoolsFrontendUrl: retry.devtoolsFrontendUrl ?? created.devtoolsFrontendUrl ?? null,
        webSocketDebuggerUrl: retry.webSocketDebuggerUrl ?? created.webSocketDebuggerUrl ?? null,
        status: 'active',
        expiresAt: new Date(Date.now() + LIVE_VIEW_URL_TTL_MS).toISOString(),
        keepAliveMs,
        liveViewMode,
      };
    } else {
      stored = {
        ...stored,
        sessionId,
        targetId: navigated.targetId ?? stored?.targetId ?? null,
        currentUrl: navigated.url ?? targetUrl,
        title: navigated.title ?? stored?.title ?? null,
        devtoolsFrontendUrl: navigated.devtoolsFrontendUrl ?? stored?.devtoolsFrontendUrl ?? null,
        webSocketDebuggerUrl: navigated.webSocketDebuggerUrl ?? stored?.webSocketDebuggerUrl ?? null,
        status: 'active',
        expiresAt: new Date(Date.now() + LIVE_VIEW_URL_TTL_MS).toISOString(),
        keepAliveMs,
        liveViewMode,
      };
    }
  } else if (stored) {
    const refreshed = await refreshBrowserRunLiveView(env, {
      sessionId,
      targetId: stored.targetId,
    });
    if (refreshed.ok) {
      stored = {
        ...stored,
        targetId: refreshed.targetId ?? stored.targetId,
        currentUrl: refreshed.url ?? stored.currentUrl,
        title: refreshed.title ?? stored.title,
        devtoolsFrontendUrl: refreshed.devtoolsFrontendUrl ?? stored.devtoolsFrontendUrl,
        webSocketDebuggerUrl: refreshed.webSocketDebuggerUrl ?? stored.webSocketDebuggerUrl,
        status: stored.status === 'starting' ? 'active' : stored.status,
        expiresAt: new Date(Date.now() + LIVE_VIEW_URL_TTL_MS).toISOString(),
        keepAliveMs,
      };
    }
  }

  if (!stored) {
    return { ok: false, error: 'Failed to establish agent live browser session' };
  }

  await persistAgentLiveBrowserSession(env, id, stored);

  return {
    ok: true,
    live_session: liveSessionPayload(stored),
    session_id: stored.sessionId,
    browser_session: {
      scope_id: id,
      session_id: stored.sessionId,
      target_id: stored.targetId,
      web_socket_debugger_url: stored.webSocketDebuggerUrl,
      devtools_frontend_url: stored.devtoolsFrontendUrl,
    },
  };
}

/**
 * @param {AgentLiveBrowserSession} session
 */
export function liveSessionPayload(session) {
  return {
    agent_run_id: session.agentRunId,
    session_id: session.sessionId,
    target_id: session.targetId,
    url: session.currentUrl,
    title: session.title,
    devtools_frontend_url: session.devtoolsFrontendUrl,
    web_socket_debugger_url: session.webSocketDebuggerUrl,
    live_view_mode: session.liveViewMode,
    status: session.status,
    expires_at: session.expiresAt,
    keep_alive_ms: session.keepAliveMs,
  };
}

/**
 * @param {any} env
 * @param {{ sessionId: string, scopeId?: string|null, targetId?: string|null }} opts
 */
export async function refreshAgentLiveBrowserLiveUrl(env, opts) {
  const scopeId = opts?.scopeId != null ? String(opts.scopeId).trim() : '';
  if (scopeId && browserLiveDoRequired(env)) {
    const { refreshAgentLiveBrowserUrlViaDo } = await import('./browser-live-do-client.js');
    return refreshAgentLiveBrowserUrlViaDo(env, scopeId);
  }

  const sessionId = String(opts?.sessionId || '').trim();
  if (!sessionId) return { ok: false, error: 'sessionId required' };

  const refreshed = await refreshBrowserRunLiveView(env, {
    sessionId,
    targetId: opts?.targetId,
  });
  if (!refreshed.ok) return refreshed;

  if (scopeId) {
    const stored = await getAgentLiveBrowserSession(env, scopeId);
    if (stored && stored.sessionId === sessionId) {
      const next = {
        ...stored,
        targetId: refreshed.targetId ?? stored.targetId,
        currentUrl: refreshed.url ?? stored.currentUrl,
        title: refreshed.title ?? stored.title,
        devtoolsFrontendUrl: refreshed.devtoolsFrontendUrl,
        webSocketDebuggerUrl: refreshed.webSocketDebuggerUrl ?? stored.webSocketDebuggerUrl,
        expiresAt: new Date(Date.now() + LIVE_VIEW_URL_TTL_MS).toISOString(),
      };
      await persistAgentLiveBrowserSession(env, scopeId, next);
    }
  }

  return {
    ok: true,
    session_id: sessionId,
    target_id: refreshed.targetId,
    devtools_frontend_url: refreshed.devtoolsFrontendUrl,
    web_socket_debugger_url: refreshed.webSocketDebuggerUrl,
    url: refreshed.url,
    title: refreshed.title,
    expires_at: new Date(Date.now() + LIVE_VIEW_URL_TTL_MS).toISOString(),
  };
}

/**
 * @param {any} env
 * @param {string} scopeId
 */
export async function closeAgentLiveBrowserSession(env, scopeId) {
  const id = String(scopeId || '').trim();
  if (!id) return { ok: false, error: 'scope_id required' };
  if (browserLiveDoRequired(env)) {
    const { closeAgentLiveBrowserSessionViaDo } = await import('./browser-live-do-client.js');
    return closeAgentLiveBrowserSessionViaDo(env, id);
  }
  const gate = assertBrowserLiveDoAvailable(env);
  if (!gate.ok) return gate;
  const stored = await getAgentLiveBrowserSession(env, id);
  if (stored?.sessionId) {
    await deleteBrowserRunSession(env, { sessionId: stored.sessionId }).catch(() => {});
  }
  return closeBrowserRunSession(env, id);
}

/**
 * @param {any} env
 * @param {string} scopeId
 * @param {{ reason: string, url?: string, resumeWhen?: string, selector?: string, timeoutMs?: number }} input
 */
export async function requestBrowserHumanInput(env, scopeId, input) {
  const reason = String(input?.reason || '').trim();
  if (!reason) return { ok: false, error: 'reason required' };

  if (browserLiveDoRequired(env)) {
    const { requestBrowserHumanInputViaDo } = await import('./browser-live-do-client.js');
    return requestBrowserHumanInputViaDo(env, scopeId, input);
  }
  const gate = assertBrowserLiveDoAvailable(env);
  if (!gate.ok) return gate;

  const ensured = await ensureAgentLiveBrowserSessionKv(env, scopeId, {
    url: input?.url || null,
  });
  if (!ensured.ok) return ensured;

  const stored = await getAgentLiveBrowserSession(env, scopeId);
  if (!stored) return { ok: false, error: 'live session not found after ensure' };

  const resumeWhen = normalizeResumeWhen(input?.resumeWhen ?? input?.resume_when);
  const next = {
    ...stored,
    status: 'needs_human',
    humanInputReason: reason,
    resumeWhen,
    resumeSelector: input?.selector != null ? String(input.selector) : null,
  };
  await persistAgentLiveBrowserSession(env, scopeId, next);

  const timeoutMs = Math.min(
    600_000,
    Math.max(5_000, Number(input?.timeoutMs) || 300_000),
  );
  const resumeUrl = stored.currentUrl || input?.url || null;
  const resumeSelector = next.resumeSelector;

  const resumed = await waitForHumanResume(env, scopeId, {
    timeoutMs,
    resumeWhen,
    resumeUrl,
    resumeSelector,
    sessionId: stored.sessionId,
  });

  const after = await getAgentLiveBrowserSession(env, scopeId);
  if (after) {
    await persistAgentLiveBrowserSession(env, scopeId, {
      ...after,
      status: resumed.ok ? 'active' : after.status,
      humanInputReason: null,
    });
  }

  return {
    ok: resumed.ok,
    human_input_required: true,
    resumed: resumed.ok,
    reason,
    resume_when: resumeWhen,
    live_session: after ? liveSessionPayload(after) : ensured.live_session,
    ...(resumed.error ? { error: resumed.error } : {}),
  };
}

/**
 * @param {any} env
 * @param {string} scopeId
 */
export async function signalHumanInputResume(env, scopeId) {
  const id = String(scopeId || '').trim();
  if (!id) return { ok: false, error: 'agent_run_id required' };

  if (browserLiveDoRequired(env)) {
    const { signalBrowserHumanInputResumeViaDo } = await import('./browser-live-do-client.js');
    return signalBrowserHumanInputResumeViaDo(env, id);
  }
  const gate = assertBrowserLiveDoAvailable(env);
  if (!gate.ok) return gate;

  const stored = await getAgentLiveBrowserSession(env, id);
  if (!stored) return { ok: false, error: 'live session not found' };

  await persistAgentLiveBrowserSession(env, id, {
    ...stored,
    status: 'resuming',
    human_resume_signal: 1,
  });
  return { ok: true, agent_run_id: id, session_id: stored.sessionId };
}

export async function cancelBrowserHumanInput(env, scopeId) {
  const id = String(scopeId || '').trim();
  if (!id) return { ok: false, error: 'agent_run_id required' };
  if (browserLiveDoRequired(env)) {
    const { cancelBrowserHumanInputViaDo } = await import('./browser-live-do-client.js');
    return cancelBrowserHumanInputViaDo(env, id);
  }
  return { ok: false, error: 'BROWSER_SESSION not configured' };
}

/**
 * @param {any} env
 * @param {string} scopeId
 * @param {{ timeoutMs: number, resumeWhen: string, resumeUrl?: string|null, resumeSelector?: string|null, sessionId: string }} opts
 */
async function waitForHumanResume(env, scopeId, opts) {
  const deadline = Date.now() + opts.timeoutMs;
  let lastUrl = opts.resumeUrl || null;

  while (Date.now() < deadline) {
    const raw = await getStoredBrowserSession(env, scopeId);
    if (raw?.human_resume_signal || raw?.status === 'resuming') {
      return { ok: true };
    }

    if (opts.resumeWhen === 'navigation' && opts.sessionId) {
      const refreshed = await refreshBrowserRunLiveView(env, {
        sessionId: opts.sessionId,
      });
      if (refreshed.ok && refreshed.url && lastUrl && refreshed.url !== lastUrl) {
        return { ok: true, resumed_by: 'navigation', url: refreshed.url };
      }
      if (refreshed.ok && refreshed.url) lastUrl = refreshed.url;
    }

    if (opts.resumeWhen === 'selector' && opts.resumeSelector && opts.sessionId) {
      /* selector resume requires Playwright — handled by tool re-invocation; poll signal only */
    }

    await sleepMs(2000);
  }

  return { ok: false, error: 'human input resume timed out' };
}

/** @param {number} ms */
function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { resolveBrowserRunScopeId };

const BROWSER_TOOL_RE = /^(browser_|cdt_|playwright_screenshot)/;

/**
 * Emit live-browser SSE events from agent tool lifecycle.
 * @param {(type: string, payload: Record<string, unknown>) => void} emit
 * @param {'start'|'done'} phase
 * @param {string} toolName
 * @param {unknown} execResult
 */
export function emitBrowserLiveSessionSse(emit, phase, toolName, execResult) {
  if (typeof emit !== 'function' || !BROWSER_TOOL_RE.test(String(toolName || ''))) return;

  if (phase === 'start') {
    emit('browser_session_starting', { tool_name: toolName });
    emit('browser_action_started', { tool_name: toolName });
    return;
  }

  if (phase !== 'done' || !execResult || typeof execResult !== 'object') return;
  let body = /** @type {Record<string, unknown>} */ (execResult);
  if (body.body && typeof body.body === 'object' && !body.live_session) {
    body = /** @type {Record<string, unknown>} */ (body.body);
  }
  const live = body.live_session && typeof body.live_session === 'object' ? body.live_session : null;
  const liveRec = live ? /** @type {Record<string, unknown>} */ (live) : null;

  if (liveRec) {
    emit('browser_session_ready', liveRec);
    if (liveRec.devtools_frontend_url) {
      emit('browser_live_view_ready', {
        session_id: liveRec.session_id,
        target_id: liveRec.target_id,
        live_view_url: liveRec.devtools_frontend_url,
        url: liveRec.url,
        title: liveRec.title,
        expires_at: liveRec.expires_at,
        live_view_mode: liveRec.live_view_mode ?? 'tab',
      });
    }
  }

  if (toolName === 'browser_request_human_input' || body.human_input_required) {
    emit('browser_human_input_required', {
      session_id: liveRec?.session_id ?? body.session_id ?? null,
      target_id: liveRec?.target_id ?? null,
      live_view_url: liveRec?.devtools_frontend_url ?? null,
      reason: body.reason ?? liveRec?.human_input_reason ?? 'Human input required',
      expires_at: liveRec?.expires_at ?? null,
      resume_when: body.resume_when ?? 'manual',
    });
    if (body.resumed) {
      emit('browser_human_input_resumed', {
        session_id: liveRec?.session_id ?? null,
        target_id: liveRec?.target_id ?? null,
      });
    }
  }

  emit('browser_action_done', {
    tool_name: toolName,
    ok: body.ok !== false && !body.error,
    url: body.url ?? liveRec?.url ?? null,
    live_session: liveRec,
  });
}
