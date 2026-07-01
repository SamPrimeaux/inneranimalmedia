/** Popup OAuth from dashboard connectors — keeps chat open on mobile. */

export type OAuthPopupResult = {
  ok: boolean;
  provider: string;
  error?: string | null;
};

const POPUP_NAME = 'iam_oauth';
const POPUP_FEATURES = 'popup=yes,width=520,height=720';

export function oauthConnectReturnTo(): string {
  if (typeof window === 'undefined') return '/dashboard/agent';
  return `${window.location.pathname}${window.location.search}` || '/dashboard/agent';
}

/** Append popup=1 so server callbacks return postMessage HTML. */
export function withOAuthPopupParam(connectUrl: string): string {
  if (!connectUrl.startsWith('/')) return connectUrl;
  try {
    const u = new URL(connectUrl, window.location.origin);
    u.searchParams.set('popup', '1');
    if (!u.searchParams.get('return_to')) {
      u.searchParams.set('return_to', oauthConnectReturnTo());
    }
    return `${u.pathname}${u.search}`;
  } catch {
    const sep = connectUrl.includes('?') ? '&' : '?';
    return `${connectUrl}${sep}popup=1`;
  }
}

export function normalizeOAuthPopupProvider(raw: string): string {
  const p = raw.trim().toLowerCase();
  if (p === 'google' || p === 'google_drive') return 'google_drive';
  if (p === 'cloudflare' || p === 'cloudflare_oauth') return 'cloudflare';
  if (p === 'github') return 'github';
  return p;
}

function parseOAuthPopupMessage(data: unknown): OAuthPopupResult | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const type = String(d.type || '');
  if (type !== 'iam_oauth_done' && type !== 'oauth_success' && type !== 'oauth_error') return null;
  const provider = normalizeOAuthPopupProvider(String(d.provider || ''));
  if (type === 'oauth_error' || d.ok === false) {
    return { ok: false, provider, error: d.error != null ? String(d.error) : 'oauth_failed' };
  }
  return { ok: true, provider };
}

export function providerMatchesExpected(messageProvider: string, expectedProviderKey: string): boolean {
  return (
    normalizeOAuthPopupProvider(messageProvider) === normalizeOAuthPopupProvider(expectedProviderKey)
  );
}

/**
 * Open same-origin OAuth in a popup; resolves when callback postMessages or popup closes.
 * Must be called synchronously from a user gesture (iOS Safari).
 */
export function openIntegrationOAuthPopup(
  connectUrl: string,
  expectedProviderKey: string,
): Promise<OAuthPopupResult> {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, provider: expectedProviderKey, error: 'no_window' });
  }

  if (!connectUrl.startsWith('/')) {
    window.open(connectUrl, '_blank', 'noopener,noreferrer');
    return Promise.resolve({ ok: true, provider: expectedProviderKey });
  }

  const popupUrl = withOAuthPopupParam(connectUrl);
  const popup = window.open(popupUrl, POPUP_NAME, POPUP_FEATURES);
  if (!popup) {
    window.location.href = popupUrl;
    return Promise.resolve({ ok: false, provider: expectedProviderKey, error: 'popup_blocked' });
  }

  const expected = normalizeOAuthPopupProvider(expectedProviderKey);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: OAuthPopupResult) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const parsed = parseOAuthPopupMessage(event.data);
      if (!parsed) return;
      if (normalizeOAuthPopupProvider(parsed.provider) !== expected) return;
      finish(parsed);
    };

    window.addEventListener('message', onMessage);

    const poll = window.setInterval(() => {
      if (popup.closed) {
        finish({ ok: true, provider: expected });
      }
    }, 400);

    const timeout = window.setTimeout(() => {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      finish({ ok: false, provider: expected, error: 'oauth_timeout' });
    }, 120_000);
  });
}
