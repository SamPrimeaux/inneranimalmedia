/**
 * OAuth popup completion — postMessage to opener + window.close().
 * Used by integration and login connect flows from dashboard/agent hub.
 */

/** @param {string} provider */
export function normalizeOAuthPopupProvider(provider) {
  const p = String(provider || '')
    .trim()
    .toLowerCase();
  if (p === 'google' || p === 'google_drive') return 'google_drive';
  if (p === 'cloudflare' || p === 'cloudflare_oauth') return 'cloudflare';
  if (p === 'github') return 'github';
  return p || 'unknown';
}

/**
 * @param {Record<string, unknown>|null|undefined} stored
 * @param {string} absReturn
 */
export function integrationOAuthShouldPopup(stored, absReturn) {
  if (stored && stored.popup === true) return true;
  const ret = String(absReturn || '');
  return ret.includes('/dashboard/agent') || ret.includes('/dashboard/artifacts');
}

/**
 * @param {string} provider
 * @param {{ error?: string|null }} [opts]
 */
export function oauthPopupCompleteHtml(provider, opts = {}) {
  const normalized = normalizeOAuthPopupProvider(provider);
  const ok = !opts.error;
  const payload = {
    type: 'iam_oauth_done',
    provider: normalized,
    ok,
    error: opts.error ? String(opts.error) : null,
  };
  const legacyType = ok ? 'oauth_success' : 'oauth_error';
  const legacyProvider = normalized === 'google_drive' ? 'google' : normalized;
  const payloadJson = JSON.stringify(payload);
  const legacyOkJson = JSON.stringify({ type: legacyType, provider: legacyProvider, ok, error: payload.error });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${ok ? 'Connected' : 'Connection failed'}</title></head><body><script>(function(){var p=${payloadJson};var legacy=${legacyOkJson};try{if(window.opener){window.opener.postMessage(p,window.location.origin);if(legacy.type==='oauth_success'){window.opener.postMessage(legacy,window.location.origin);}}}catch(e){}setTimeout(function(){window.close();},120);})();</script><p style="font-family:system-ui,sans-serif;padding:1.5rem;text-align:center;color:#444">${ok ? 'Connected. Closing…' : 'Could not connect. Closing…'}</p></body></html>`;
}
