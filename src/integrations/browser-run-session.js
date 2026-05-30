/**
 * Cloudflare Browser Run — HTTP CDP session management (live.browser.run Live View).
 * @see https://developers.cloudflare.com/browser-run/cdp/session-management/
 */

const DEFAULT_KEEP_ALIVE_MS = 300_000;

/**
 * @param {any} env
 */
function resolveBrowserRunApiCredentials(env) {
  const accountId = String(env?.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = String(env?.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    return { ok: false, error: 'Cloudflare Browser Run API credentials not configured' };
  }
  return { ok: true, accountId, apiToken };
}

/**
 * @param {any} env
 * @param {string} path — e.g. `/devtools/browser`
 * @param {{ method?: string, query?: Record<string, string> }} [opts]
 */
async function browserRunApiFetch(env, path, opts = {}) {
  const creds = resolveBrowserRunApiCredentials(env);
  if (!creds.ok) return creds;

  const method = String(opts.method || 'GET').toUpperCase();
  const qs =
    opts.query && Object.keys(opts.query).length
      ? `?${new URLSearchParams(opts.query).toString()}`
      : '';
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/browser-rendering${path}${qs}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      Accept: 'application/json',
    },
  }).catch((e) => ({ ok: false, status: 0, _err: e }));

  if (!res?.ok) {
    const status = res?.status ?? 0;
    let detail = res?._err?.message ?? res?.statusText ?? 'Browser Run API request failed';
    try {
      const text = await res.text?.();
      if (text) {
        const json = JSON.parse(text);
        detail = json?.errors?.[0]?.message || json?.error || detail;
      }
    } catch {
      /* ignore parse */
    }
    return { ok: false, error: detail, status };
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: 'Browser Run API returned non-JSON response' };
  }

  const payload = json?.result != null ? json.result : json;
  return { ok: true, data: payload, raw: json };
}

/**
 * @param {any} env
 * @param {{ keepAliveMs?: number }} [opts]
 */
export async function createBrowserRunSession(env, opts = {}) {
  const keepAliveMs = Math.min(
    600_000,
    Math.max(60_000, Number(opts.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS) || DEFAULT_KEEP_ALIVE_MS),
  );
  const out = await browserRunApiFetch(env, '/devtools/browser', {
    method: 'POST',
    query: { keep_alive: String(keepAliveMs) },
  });
  if (!out.ok) return out;
  const sessionId = String(out.data?.sessionId || out.data?.session_id || '').trim();
  if (!sessionId) {
    return { ok: false, error: 'Browser Run session create did not return sessionId' };
  }
  return { ok: true, sessionId, keepAliveMs };
}

/**
 * @param {any} env
 * @param {{ sessionId: string, url: string }} opts
 */
export async function navigateBrowserRunTab(env, opts) {
  const sessionId = String(opts?.sessionId || '').trim();
  const url = String(opts?.url || '').trim();
  if (!sessionId) return { ok: false, error: 'sessionId required' };
  if (!url) return { ok: false, error: 'url required' };

  const out = await browserRunApiFetch(env, `/devtools/browser/${encodeURIComponent(sessionId)}/json/new`, {
    method: 'PUT',
    query: { url },
  });
  if (!out.ok) return out;

  const target = out.data && typeof out.data === 'object' ? out.data : {};
  const devtoolsFrontendUrl = String(
    target.devtoolsFrontendUrl || target.devtools_frontend_url || '',
  ).trim();
  if (!devtoolsFrontendUrl) {
    return { ok: false, error: 'Browser Run navigate did not return devtoolsFrontendUrl' };
  }

  return {
    ok: true,
    sessionId,
    devtoolsFrontendUrl,
    targetId: target.id != null ? String(target.id) : null,
    url: target.url != null ? String(target.url) : url,
    title: target.title != null ? String(target.title) : null,
  };
}

/**
 * @param {any} env
 * @param {{ sessionId: string }} opts
 */
export async function deleteBrowserRunSession(env, opts) {
  const sessionId = String(opts?.sessionId || '').trim();
  if (!sessionId) return { ok: false, error: 'sessionId required' };

  const out = await browserRunApiFetch(env, `/devtools/browser/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!out.ok) return out;
  return { ok: true, sessionId, status: out.data?.status ?? 'closing' };
}

/**
 * Open (or reuse) a Browser Run session, navigate to url, return embeddable Live View URL.
 * @param {any} env
 * @param {{ url: string, sessionId?: string|null, keepAliveMs?: number }} opts
 */
export async function openBrowserRunLiveView(env, opts) {
  const url = String(opts?.url || '').trim();
  if (!url) return { ok: false, error: 'url required' };

  let sessionId = opts?.sessionId != null ? String(opts.sessionId).trim() : '';
  if (!sessionId) {
    const created = await createBrowserRunSession(env, { keepAliveMs: opts?.keepAliveMs });
    if (!created.ok) return created;
    sessionId = created.sessionId;
  }

  let navigated = await navigateBrowserRunTab(env, { sessionId, url });
  if (!navigated.ok && opts?.sessionId) {
    const created = await createBrowserRunSession(env, { keepAliveMs: opts?.keepAliveMs });
    if (!created.ok) return created;
    sessionId = created.sessionId;
    navigated = await navigateBrowserRunTab(env, { sessionId, url });
  }
  if (!navigated.ok) return navigated;

  return {
    ok: true,
    session_id: sessionId,
    devtools_frontend_url: navigated.devtoolsFrontendUrl,
    url: navigated.url,
    title: navigated.title,
    target_id: navigated.targetId,
  };
}
