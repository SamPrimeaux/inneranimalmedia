/**
 * Login OAuth callbacks (Google / GitHub) — parity with worker.js
 * handleGoogleOAuthCallback / handleGitHubOAuthCallback.
 *
 * Integration OAuth stays in oauth.js (oauth_state_* + user_id payload).
 */
import { getAuthUser, writeIamSessionToKv, resolveTenantAtLogin } from '../core/auth.js';
import { provisionNewUser } from '../core/provisionNewUser.js';

function oauthOrigin(url) {
  return url.origin || 'https://inneranimalmedia.com';
}

/** Match worker.js oauthPostLoginGlobeRedirectUrl */
export function oauthPostLoginGlobeRedirectUrl(originBase, returnToFullUrl) {
  let path = '/dashboard/overview';
  try {
    const u = new URL(returnToFullUrl);
    path = u.pathname + (u.search || '');
  } catch (_) {
    /* keep default */
  }
  if (!path.startsWith('/') || path.startsWith('//')) path = '/dashboard/overview';
  return `${originBase}/auth/login?globe_exit=1&next=${encodeURIComponent(path)}`;
}

/** Match worker.js autoStartWorkSession */
export async function autoStartWorkSession(env, userId, tenantId, pageContext) {
  if (!env?.DB) return null;
  const sessionId = 'ws_' + String(userId || '').slice(-8) + '_' + Date.now();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO work_sessions
      (session_id, tenant_id, started_at, last_activity_at,
       total_active_seconds, project_context, page_context, auto_paused)
    VALUES (?, ?, datetime('now'), datetime('now'), 0, 'inneranimalmedia', ?, 0)
  `).bind(sessionId, tenantId, pageContext || '/dashboard/agent').run().catch(() => {});
  return sessionId;
}

function googleClientSecret(env) {
  return env.GOOGLE_OAUTH_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET || '';
}

/**
 * GitHub login callback — parity with worker.js handleGitHubOAuthCallback.
 * @param {object} [options]
 * @param {string} [options.cachedRedirect] — if set, KV get/delete for github state was already done (e.g. /api/oauth/github/callback dispatch).
 */
export async function handleGitHubLoginOAuthCallback(request, url, env, options = {}) {
  const { cachedRedirect: injected } = options;
  const { searchParams } = url;
  const state = searchParams.get('state');
  const code = searchParams.get('code');
  if (!state || !code || !env.SESSION_CACHE || !env.DB) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=missing`, 302);
  }

  let cachedRedirect = injected;
  if (cachedRedirect === undefined) {
    cachedRedirect = await env.SESSION_CACHE.get(`oauth_state_github_${state}`);
    await env.SESSION_CACHE.delete(`oauth_state_github_${state}`);
  }
  if (!cachedRedirect) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=invalid_state`, 302);
  }

  let redirectUri = cachedRedirect;
  let returnTo = `${oauthOrigin(url)}/dashboard/overview`;
  let connectGitHub = false;
  try {
    const parsed = JSON.parse(cachedRedirect);
    if (parsed.redirectUri) redirectUri = parsed.redirectUri;
    if (parsed.returnTo && parsed.returnTo.startsWith('/')) returnTo = `${oauthOrigin(url)}${parsed.returnTo}`;
    if (parsed.connectGitHub) connectGitHub = true;
  } catch (_) {
    /* legacy string stored as redirectUri only */
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=token_failed`, 302);
  }
  const tokens = await tokenRes.json();
  if (tokens.error) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=token_failed`, 302);
  }
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'User-Agent': 'InnerAnimalMedia-Dashboard/1.0',
    },
  });
  if (!userRes.ok) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=userinfo_failed`, 302);
  }
  const userInfo = await userRes.json();
  let email = userInfo.email;
  if (!email && userInfo.login) {
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'User-Agent': 'InnerAnimalMedia-Dashboard/1.0',
      },
    });
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primary = emails.find((e) => e.primary) || emails[0];
      email = primary?.email;
    }
  }
  const oauthEmail = String(email || userInfo.login || 'unknown').toLowerCase().trim();
  const name = userInfo.name || userInfo.login || oauthEmail;

  const existing = await env.DB.prepare(
    `SELECT id, email, name FROM auth_users WHERE LOWER(email) = ? LIMIT 1`,
  )
    .bind(oauthEmail)
    .first();

  const userId = existing?.id ?? `au_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  if (connectGitHub) {
    const sessionUser = await getAuthUser(request, env);
    if (!sessionUser) {
      return Response.redirect(`${url.origin}/auth/login?error=session_required`, 302);
    }
    const ghUserId = sessionUser.email || sessionUser.id;
    const ghLogin = (userInfo.login || '').toString() || 'github';
    if (tokens.access_token && env.DB) {
      try {
        const expiresAtTs = tokens.expires_in ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in) : null;
        await env.DB.prepare(
          `INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope)
           VALUES (?, 'github', ?, ?, ?, ?, ?)`,
        )
          .bind(ghUserId, ghLogin, tokens.access_token || '', tokens.refresh_token || null, expiresAtTs, (tokens.scope || '').toString())
          .run();
      } catch (e) {
        console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);
      }
    }
    return new Response(
      `<script>window.opener?.postMessage({type:'oauth_success',provider:'github'},window.location.origin);window.close();</script>`,
      { headers: { 'Content-Type': 'text/html' } },
    );
  }

  try {
    if (!existing?.id) {
      await env.DB.prepare(
        `INSERT INTO auth_users (id, email, name, password_hash, salt, created_at, updated_at)
         VALUES (?, ?, ?, 'oauth', 'oauth', datetime('now'), datetime('now'))`,
      )
        .bind(userId, oauthEmail, name)
        .run();
    } else {
      if (!existing.name || !String(existing.name).trim()) {
        await env.DB.prepare(
          `UPDATE auth_users SET name = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(name, userId)
          .run();
      }
    }
  } catch (e) {
    console.warn('[oauth/github/callback] auth_users upsert failed:', e?.message ?? e);
  }
  await provisionNewUser(env, { email: oauthEmail, name, authUserId: userId });
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const tidGh = await resolveTenantAtLogin(env, userId).catch(() => null);
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`,
  )
    .bind(sessionId, userId, expiresAt, ip, ua, tidGh)
    .run();
  autoStartWorkSession(env, userId, tidGh, url.pathname).catch(() => {});
  await writeIamSessionToKv(env, sessionId, userId, tidGh, expiresAt);
  const ghLogin = (userInfo.login || '').toString() || 'github';
  if (tokens.access_token && env.DB) {
    try {
      const expiresAtTs = tokens.expires_in ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in) : null;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope)
         VALUES (?, 'github', ?, ?, ?, ?, ?)`,
      )
        .bind(userId, ghLogin, tokens.access_token || '', tokens.refresh_token || null, expiresAtTs, (tokens.scope || '').toString())
        .run();
    } catch (e) {
      console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);
    }
  }
  const loginHeaders = new Headers({
    Location: oauthPostLoginGlobeRedirectUrl(oauthOrigin(url), returnTo),
  });

  loginHeaders.append(
    'Set-Cookie',
    `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
  );
  loginHeaders.append(
    'Set-Cookie',
    `session=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
  loginHeaders.append(
    'Set-Cookie',
    `session=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );

  return new Response(null, { status: 302, headers: loginHeaders });
}

/**
 * Google login callback — parity with worker.js handleGoogleOAuthCallback.
 * @param {object} [options]
 * @param {string} [options.cachedRedirect] — raw KV payload when get/delete already ran (e.g. /api/oauth/google/callback non-integration path).
 */
export async function handleGoogleLoginOAuthCallback(request, url, env, options = {}) {
  const { cachedRedirect: injected } = options;
  const { searchParams } = url;
  const state = searchParams.get('state');
  const code = searchParams.get('code');
  if (!state || !code || !env.SESSION_CACHE || !env.DB) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=missing`, 302);
  }

  let cachedRedirect = injected;
  if (cachedRedirect === undefined) {
    cachedRedirect = await env.SESSION_CACHE.get(`oauth_state_${state}`);
    await env.SESSION_CACHE.delete(`oauth_state_${state}`);
  }
  if (!cachedRedirect) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=invalid_state`, 302);
  }

  let redirectUri = cachedRedirect;
  let returnTo = `${oauthOrigin(url)}/dashboard/overview`;
  let connectDrive = false;
  try {
    const parsed = JSON.parse(cachedRedirect);
    if (parsed.user_id && !parsed.redirectUri) {
      return Response.redirect(`${oauthOrigin(url)}/auth/login?error=invalid_state`, 302);
    }
    if (parsed.redirectUri) redirectUri = parsed.redirectUri;
    if (parsed.returnTo && parsed.returnTo.startsWith('/')) returnTo = `${oauthOrigin(url)}${parsed.returnTo}`;
    if (parsed.connectDrive) connectDrive = true;
  } catch (_) {
    returnTo = `${oauthOrigin(url)}/dashboard/overview`;
  }

  const clientSecret = googleClientSecret(env);
  if (!clientSecret || !env.GOOGLE_CLIENT_ID) {
    return Response.redirect(
      `${oauthOrigin(url)}/auth/login?error=token_failed&reason=invalid_client&hint=secret_or_id_not_configured`,
      302,
    );
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    let reason = 'unknown';
    try {
      const errJson = JSON.parse(errBody);
      const errCode = (errJson.error || '').toString().toLowerCase();
      const allowed = [
        'invalid_grant',
        'invalid_client',
        'invalid_request',
        'unauthorized_client',
        'unsupported_grant_type',
        'invalid_scope',
      ];
      if (allowed.includes(errCode)) reason = errCode;
    } catch (_) {
      /* ignore */
    }
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=token_failed&reason=${encodeURIComponent(reason)}`, 302);
  }
  const tokens = await tokenRes.json();
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=userinfo_failed`, 302);
  }
  const userInfo = await userRes.json();
  const oauthEmail = String(userInfo.email || '').toLowerCase().trim();
  const name = userInfo.name || oauthEmail || 'User';
  if (!oauthEmail) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=no_email`, 302);
  }

  const existing = await env.DB.prepare(
    `SELECT id, email, name FROM auth_users WHERE LOWER(email) = ? LIMIT 1`,
  )
    .bind(oauthEmail)
    .first();

  const authUserId = existing?.id ?? `au_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  if (connectDrive) {
    const sessionUser = await getAuthUser(request, env);
    if (!sessionUser) {
      return Response.redirect(`${oauthOrigin(url)}/auth/login?error=session_required`, 302);
    }
    const driveUserId = sessionUser.email || sessionUser.id;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope) VALUES (?, 'google_drive', '', ?, ?, ?, ?)`,
    )
      .bind(
        driveUserId,
        tokens.access_token,
        tokens.refresh_token ?? null,
        tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        tokens.scope ?? null,
      )
      .run();
    return new Response(
      `<script>window.opener?.postMessage({type:'oauth_success',provider:'google'},window.location.origin);window.close();</script>`,
      { headers: { 'Content-Type': 'text/html' } },
    );
  }

  try {
    if (!existing?.id) {
      await env.DB.prepare(
        `INSERT INTO auth_users (id, email, name, password_hash, salt, created_at, updated_at)
         VALUES (?, ?, ?, 'oauth', 'oauth', datetime('now'), datetime('now'))`,
      )
        .bind(authUserId, oauthEmail, name)
        .run();
    } else {
      if (!existing.name || !String(existing.name).trim()) {
        await env.DB.prepare(
          `UPDATE auth_users SET name = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(name, authUserId)
          .run();
      }
    }
  } catch (e) {
    console.warn('[OAuth] auth_users upsert:', e?.message ?? e);
  }

  await provisionNewUser(env, { email: oauthEmail, name, authUserId });

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const tidOauth = await resolveTenantAtLogin(env, authUserId).catch(() => null);
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`,
  )
    .bind(sessionId, authUserId, expiresAt, ip, ua, tidOauth)
    .run();

  await writeIamSessionToKv(env, sessionId, authUserId, tidOauth, expiresAt);

  const safeDest =
    returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes(':')
      ? returnTo
      : '/dashboard/overview';
  const headers = new Headers({ Location: `${oauthOrigin(url)}${safeDest}` });

  headers.append(
    'Set-Cookie',
    `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
  );
  headers.append(
    'Set-Cookie',
    `session=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
  headers.append(
    'Set-Cookie',
    `session=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );

  return new Response(null, { status: 302, headers });
}
