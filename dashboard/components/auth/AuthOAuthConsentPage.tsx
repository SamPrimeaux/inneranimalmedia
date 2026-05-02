import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

const SUPABASE_OAUTH_AUTHORIZE = 'https://dpmuvynqixblxsilnlut.supabase.co/auth/v1/oauth/authorize';

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Verify your identity (OpenID)',
  profile: 'Read your basic profile',
  email: 'Read your email address',
};

function buildDenyUrl(redirectUri: string, state: string): string {
  try {
    const u = new URL(redirectUri);
    u.searchParams.set('error', 'access_denied');
    if (state) u.searchParams.set('state', state);
    return u.toString();
  } catch {
    const join = redirectUri.includes('?') ? '&' : '?';
    return `${redirectUri}${join}error=access_denied&state=${encodeURIComponent(state)}`;
  }
}

export function AuthOAuthConsentPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [checkedAuth, setCheckedAuth] = useState(false);
  const [authOk, setAuthOk] = useState(false);

  const clientId = searchParams.get('client_id') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const scopeRaw = searchParams.get('scope') || '';
  const state = searchParams.get('state') || '';
  const responseType = searchParams.get('response_type') || '';
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || '';

  const scopes = useMemo(
    () => scopeRaw.split(/\s+/).map((s) => s.trim()).filter(Boolean),
    [scopeRaw],
  );

  const requiredOk =
    !!clientId &&
    !!redirectUri &&
    !!scopeRaw &&
    !!state &&
    !!responseType;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (cancelled) return;
        if (res.ok) {
          setAuthOk(true);
        } else {
          const next = encodeURIComponent(`${location.pathname}${location.search || ''}`);
          window.location.replace(`${window.location.origin}/auth/login?next=${next}`);
          return;
        }
      } catch {
        if (!cancelled) {
          const next = encodeURIComponent(`${location.pathname}${location.search || ''}`);
          window.location.replace(`${window.location.origin}/auth/login?next=${next}`);
        }
      } finally {
        if (!cancelled) setCheckedAuth(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  function onAllow() {
    const p = new URLSearchParams();
    searchParams.forEach((v, k) => {
      if (v != null && v !== '') p.set(k, v);
    });
    window.location.assign(`${SUPABASE_OAUTH_AUTHORIZE}?${p.toString()}`);
  }

  function onDeny() {
    if (!redirectUri) return;
    window.location.assign(buildDenyUrl(redirectUri, state));
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-app)',
    }}>
      <div style={{
        width: 420, padding: 32,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 20,
        }}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" aria-hidden>
            <path d="M13.5 2.5L3 14h9l-1.5 7.5L21 10h-9l1.5-7.5z" fill="#3ECF8E" />
          </svg>
          <div style={{
            color: 'var(--solar-cyan)', fontSize: 16, fontWeight: 500,
            fontFamily: 'var(--font-mono)',
          }}>
            Inner Animal Media
          </div>
        </div>

        {!checkedAuth && (
          <div style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-app)',
            color: 'var(--text-muted)',
            fontSize: 12,
          }}>
            Checking session…
          </div>
        )}

        {checkedAuth && authOk && !requiredOk && (
          <div style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(248,113,113,0.08)',
            color: 'rgba(254,226,226,0.95)',
            fontSize: 12,
          }}>
            Missing required OAuth parameters (client_id, redirect_uri, scope, state, response_type).
          </div>
        )}

        {checkedAuth && authOk && requiredOk && (
          <>
            <div style={{
              marginBottom: 12,
              fontSize: 13,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              An application is requesting access using your Supabase account.
            </div>
            <div style={{
              marginBottom: 8,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}>
              Application
            </div>
            <div style={{
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-main)',
              wordBreak: 'break-all',
            }}>
              {clientId}
            </div>
            {!!codeChallenge && (
              <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                PKCE: {codeChallengeMethod || 'S256'}
              </div>
            )}
            <div style={{
              marginBottom: 8,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}>
              Requested permissions
            </div>
            <ul style={{
              listStyle: 'none',
              margin: '0 0 20px 0',
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-app)',
            }}>
              {scopes.length === 0 ? (
                <li style={{ fontSize: 12, color: 'var(--text-muted)' }}>{scopeRaw || '(none listed)'}</li>
              ) : (
                scopes.map((s) => (
                  <li
                    key={s}
                    style={{
                      fontSize: 12,
                      color: 'var(--text-main)',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    {SCOPE_LABELS[s] || s}
                  </li>
                ))
              )}
            </ul>

            <button
              type="button"
              onClick={onAllow}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 6,
                border: '1px solid rgba(62, 207, 142, 0.55)',
                background: 'rgba(62, 207, 142, 0.18)',
                color: 'var(--text-main)',
                cursor: 'pointer',
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              Allow
            </button>
            <button
              type="button"
              onClick={onDeny}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Deny
            </button>
          </>
        )}

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <a href="/auth/login" style={{ color: 'var(--solar-cyan)', textDecoration: 'none' }}>
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}
