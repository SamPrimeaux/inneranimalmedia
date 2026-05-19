/**
 * Login OAuth callbacks (Google / GitHub) — parity with worker.js
 * handleGoogleOAuthCallback / handleGitHubOAuthCallback.
 *
 * Integration OAuth stays in oauth.js (oauth_state_* + user_id payload).
 */
import { getAuthUser, resolveTenantAtLogin, createLoginSession } from '../core/auth.js';
import { provisionAuthenticatedUser } from '../core/provisionAuthenticatedUser.js';
import { ensureAppUser } from '../core/ensureAppUser.js';
import { upsertOauthToken } from '../core/oauth-token-store.js';

function oauthOrigin(url) {
  return url.origin || 'https://inneranimalmedia.com';
}

const DASHBOARD_LOGIN_FALLBACK = '/dashboard/overview';

/**
 * Path (pathname + search) for same-origin post-OAuth app login redirect.
 * Never send users to Integrations from a social **login** callback.
 */
function safeDashboardLoginRedirectPath(originBase, returnTo) {
  if (!returnTo || typeof returnTo !== 'string') return DASHBOARD_LOGIN_FALLBACK;
  const t = returnTo.trim();
  if (!t) return DASHBOARD_LOGIN_FALLBACK;
  if (t.startsWith('/') && !t.startsWith('//') && !t.includes(':')) {
    if (t.startsWith('/dashboard/settings/integrations')) return DASHBOARD_LOGIN_FALLBACK;
    if (!t.startsWith('/dashboard')) return DASHBOARD_LOGIN_FALLBACK;
    return t;
  }
  try {
    const u = new URL(t);
    const ob = new URL(originBase);
    if (u.origin !== ob.origin) return DASHBOARD_LOGIN_FALLBACK;
    const p = u.pathname + (u.search || '');
    if (p.startsWith('/dashboard/settings/integrations')) return DASHBOARD_LOGIN_FALLBACK;
    if (!p.startsWith('/dashboard')) return DASHBOARD_LOGIN_FALLBACK;
    return p;
  } catch (_) {
    return DASHBOARD_LOGIN_FALLBACK;
  }
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
  if (path.startsWith('/dashboard/settings/integrations')) path = '/dashboard/overview';
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
 * Best-effort time tracking + analytics after OAuth login. Never throws.
 * @param {*} db — env.DB (D1)
 * @param {string} browserSessionId — `auth_sessions.id` from createLoginSession (cookie session UUID)
 * @param {string} userId — auth_users.id
 */
async function tryOAuthLoginTimeTracking(db, browserSessionId, userId) {
  if (!db || !browserSessionId || !userId) return;
  try {
    let au = null;
    try {
      au = await db
        .prepare(`SELECT tenant_id, active_workspace_id FROM auth_users WHERE id = ? LIMIT 1`)
        .bind(userId)
        .first();
    } catch (_) {
      au = null;
    }
    const tenantId = au?.tenant_id ?? null;
    const activeWs = au?.active_workspace_id ?? null;

    const wsSessionId =
      'wss_' +
      Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    await db
      .prepare(
        `INSERT INTO work_sessions
           (session_id, user_id, tenant_id, workspace_id,
            started_at, last_activity_at, created_at)
         VALUES (?, ?, ?, ?, unixepoch(), unixepoch(), unixepoch())`,
      )
      .bind(wsSessionId, userId, tenantId, activeWs)
      .run();

    await db
      .prepare(
        `UPDATE auth_sessions SET workspace_id = ?, work_session_id = ?
         WHERE id = ?`,
      )
      .bind(activeWs ?? null, wsSessionId, browserSessionId)
      .run();

    await db
      .prepare(
        `INSERT INTO time_entries
           (user_id, tenant_id, workspace_id, description,
            source, work_session_id, started_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'auto', ?, unixepoch(), unixepoch(), unixepoch())`,
      )
      .bind(
        userId,
        tenantId,
        activeWs,
        'Login session — ' + new Date().toISOString().slice(0, 10),
        wsSessionId,
      )
      .run();

    await db
      .prepare(
        `INSERT INTO agentsam_analytics
           (tenant_id, workspace_id, period, period_date,
            total_sessions, computed_at)
         VALUES (?, ?, 'session', ?, 1, unixepoch())
         ON CONFLICT(tenant_id, workspace_id, period, period_date)
         DO UPDATE SET
           total_sessions = total_sessions + 1,
           computed_at = unixepoch()`,
      )
      .bind(tenantId, activeWs ?? 'ws_unknown', new Date().toISOString().slice(0, 10))
      .run();

    const existingProfile = await db
      .prepare(`SELECT id FROM agentsam_subagent_profile WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first();

    if (!existingProfile) {
      await db
        .prepare(
          `INSERT INTO agentsam_subagent_profile
             (id, user_id, workspace_id, tenant_id, slug,
              display_name, description, icon, agent_type,
              personality_tone, is_active, is_platform_global)
           VALUES (
             'sub_' || lower(hex(randomblob(8))),
             ?, ?, ?, 'agent-sam',
             'Agent Sam', 'Default AI assistant', 'robot',
             'assistant', 'professional', 1, 0
           )`,
        )
        .bind(userId, activeWs ?? '', tenantId)
        .run();
    }
  } catch (e) {
    console.error('[time_tracking] failed to create work session:', e?.message ?? e);
  }
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

  if (connectGitHub) {
    const sessionUser = await getAuthUser(request, env);
    if (!sessionUser) {
      return Response.redirect(`${url.origin}/auth/login?error=session_required`, 302);
    }
    /** Match `integrationUserId` / `oauthTokenUserKey`: rows keyed by `auth_users.id`, not email. */
    const ghUserId =
      sessionUser?.id != null && String(sessionUser.id).trim() !== ''
        ? String(sessionUser.id).trim()
        : String(sessionUser.email || '').trim();
    const ghLogin = (userInfo.login || '').toString() || 'github';
    if (tokens.access_token && env.DB) {
      try {
        await upsertOauthToken(env, {
          user_id: ghUserId,
          tenant_id: sessionUser.tenant_id ?? sessionUser.active_tenant_id ?? null,
          provider: 'github',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          scope: (tokens.scope || '').toString() || null,
          expires_at: tokens.expires_in
            ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in)
            : null,
          account_identifier: ghLogin,
          account_email: email ?? null,
          account_display: name ?? null,
          workspace_id: null,
          metadata_json: null,
        }, { skipRegistry: true });
      } catch (e) {
        console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);
      }
    }
    return new Response(
      `<script>window.opener?.postMessage({type:'oauth_success',provider:'github'},window.location.origin);window.close();</script>`,
      { headers: { 'Content-Type': 'text/html' } },
    );
  }

  const ensuredGh = await ensureAppUser(
    env,
    { email: oauthEmail, name, source: 'github_oauth' },
    { allowCreate: true },
  );
  if (!ensuredGh?.authUserId) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=provision_failed`, 302);
  }
  const userId = ensuredGh.authUserId;

  try {
    const nm = await env.DB.prepare(`SELECT name FROM auth_users WHERE id = ? LIMIT 1`)
      .bind(userId)
      .first();
    if (!nm?.name || !String(nm.name).trim()) {
      await env.DB.prepare(`UPDATE auth_users SET name = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(name, userId)
        .run();
    }
  } catch (e) {
    console.warn('[oauth/github/callback] auth_users name update:', e?.message ?? e);
  }
  await provisionAuthenticatedUser(env, request, {
    authUserId: userId,
    email: oauthEmail,
    name,
    source: 'github_oauth',
  });
  const sessionId = await createLoginSession(request, env, userId, 'github');
  await env.DB.prepare(
    `UPDATE auth_users SET
       active_workspace_id = (
         SELECT workspace_id FROM workspace_members
         WHERE user_id = ? AND is_active = 1
         ORDER BY created_at ASC LIMIT 1
       ),
       active_tenant_id = (
         SELECT tenant_id FROM auth_users WHERE id = ?
       )
     WHERE id = ? AND active_workspace_id IS NULL`,
  )
    .bind(userId, userId, userId)
    .run();
  await tryOAuthLoginTimeTracking(env.DB, sessionId, userId);
  const tidGh = await resolveTenantAtLogin(env, userId).catch(() => null);
  autoStartWorkSession(env, userId, tidGh, url.pathname).catch(() => {});
  const ghLogin = (userInfo.login || '').toString() || 'github';
  if (tokens.access_token && env.DB) {
    try {
      await upsertOauthToken(env, {
        user_id: userId,
        tenant_id: tidGh ?? null,
        provider: 'github',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        scope: (tokens.scope || '').toString() || null,
        expires_at: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in)
          : null,
        account_identifier: ghLogin,
        account_email: oauthEmail ?? null,
        account_display: name ?? null,
        workspace_id: null,
        metadata_json: null,
      }, { skipRegistry: true });
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

  if (connectDrive) {
    const sessionUser = await getAuthUser(request, env);
    if (!sessionUser) {
      return Response.redirect(`${oauthOrigin(url)}/auth/login?error=session_required`, 302);
    }
    /** Match `integrationUserId` / `oauthTokenUserKey`: rows keyed by `auth_users.id`, not email. */
    const driveUserId =
      sessionUser?.id != null && String(sessionUser.id).trim() !== ''
        ? String(sessionUser.id).trim()
        : String(sessionUser.email || '').trim();
    const driveTenantId = sessionUser?.tenant_id || env.TENANT_ID;
    await upsertOauthToken(env, {
      user_id: driveUserId,
      tenant_id: driveTenantId,
      provider: 'google_drive',
      account_identifier: oauthEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
      scope: tokens.scope ?? null,
    });
    await env.DB.prepare(
      `INSERT OR REPLACE INTO integration_registry (tenant_id, provider_key, status, connected_at)
       VALUES (?, 'google_drive', 'connected', datetime('now'))`,
    )
      .bind(driveTenantId)
      .run();
    return new Response(
      `<script>window.opener?.postMessage({type:'oauth_success',provider:'google'},window.location.origin);window.close();</script>`,
      { headers: { 'Content-Type': 'text/html' } },
    );
  }

  const ensuredGo = await ensureAppUser(
    env,
    { email: oauthEmail, name, source: 'google_oauth' },
    { allowCreate: true },
  );
  if (!ensuredGo?.authUserId) {
    return Response.redirect(`${oauthOrigin(url)}/auth/login?error=provision_failed`, 302);
  }
  const authUserId = ensuredGo.authUserId;

  try {
    const nm = await env.DB.prepare(`SELECT name FROM auth_users WHERE id = ? LIMIT 1`)
      .bind(authUserId)
      .first();
    if (!nm?.name || !String(nm.name).trim()) {
      await env.DB.prepare(`UPDATE auth_users SET name = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(name, authUserId)
        .run();
    }
  } catch (e) {
    console.warn('[OAuth] auth_users name update:', e?.message ?? e);
  }

  await provisionAuthenticatedUser(env, request, {
    authUserId,
    email: oauthEmail,
    name,
    source: 'google_oauth',
  });

  const sessionId = await createLoginSession(request, env, authUserId, 'google');
  await env.DB.prepare(
    `UPDATE auth_users SET
       active_workspace_id = (
         SELECT workspace_id FROM workspace_members
         WHERE user_id = ? AND is_active = 1
         ORDER BY created_at ASC LIMIT 1
       ),
       active_tenant_id = (
         SELECT tenant_id FROM auth_users WHERE id = ?
       )
     WHERE id = ? AND active_workspace_id IS NULL`,
  )
    .bind(authUserId, authUserId, authUserId)
    .run();
  await tryOAuthLoginTimeTracking(env.DB, sessionId, authUserId);

  const safeDest = safeDashboardLoginRedirectPath(oauthOrigin(url), returnTo);
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
