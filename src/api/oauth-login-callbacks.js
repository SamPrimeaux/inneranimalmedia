/**
 * Login OAuth callbacks (Google / GitHub) — parity with worker.js
 * handleGoogleOAuthCallback / handleGitHubOAuthCallback.
 *
 * Integration OAuth stays in oauth.js (oauth_state_* + user_id payload).
 */
import {
  AUTH_COOKIE_NAME,
  getAuthUser,
  resolveTenantAtLogin,
  createLoginSession,
  revokeAuthSession,
} from '../core/auth.js';
import { ensureIdentityPlaneBeforeSession } from '../core/ensureIdentityPlaneBeforeSession.js';
import { ensureAppUser } from '../core/ensureAppUser.js';
import { upsertOauthToken } from '../core/oauth-token-store.js';
import { resolveCanonicalWorkspace } from './oauth.js';

function oauthOrigin(url) {
  return url.origin || 'https://inneranimalmedia.com';
}

/** Revoke browser cookie session before issuing a new login session (prevents wrong-account stickiness). */
export async function revokeIncomingCookieSession(request, env, reason = 'oauth_login_replaced') {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
  const sessionId = match ? decodeURIComponent(String(match[1]).trim()) : null;
  if (!sessionId || !env?.DB) return;
  try {
    const row = await env.DB.prepare(`SELECT user_id FROM auth_sessions WHERE id = ? LIMIT 1`)
      .bind(sessionId)
      .first();
    await revokeAuthSession(env, sessionId, reason, row?.user_id ?? null);
  } catch {
    /* non-fatal */
  }
}

/** Clear stale host/domain session cookies, then set the new canonical host-only session. */
export function appendBrowserLoginSessionCookies(headers, sessionId) {
  headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
  );
  headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
  headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
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

// DEPRECATED: use canonical work_session INSERT pattern with the real browser session id.
// See finalizeInboundOAuth(...) Phase 2A implementation.
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
 * Unified inbound OAuth finalize: provision user, identity plane, browser session, time tracking.
 *
 * @param {*} env
 * @param {Request} request
 * @param {{
 *   provider: string,
 *   sessionProvider?: string,
 *   email: string,
 *   name: string,
 *   providerUid: string,
 *   supabaseUserId?: string|null,
 *   source: string,
 *   pageContext?: string,
 * }} input
 * @returns {Promise<
 *   | { ok: true, authUserId: string, sessionId: string, tenantId: string|null }
 *   | { ok: false, error: 'provision_failed' | 'session_failed' }
 * >}
 */
export async function finalizeInboundOAuth(env, request, input) {
  const provider = String(input?.provider || '').trim();
  const sessionProvider = String(input?.sessionProvider || provider).trim() || provider;
  const oauthEmail = String(input?.email || '')
    .toLowerCase()
    .trim();
  const name = String(input?.name || oauthEmail.split('@')[0] || 'User').trim();
  const providerUid = String(input?.providerUid || '').trim();
  const supabaseUserId =
    input?.supabaseUserId != null && String(input.supabaseUserId).trim()
      ? String(input.supabaseUserId).trim()
      : null;
  const source = String(input?.source || `${provider}_oauth`).trim();
  const pageContext = String(input?.pageContext || '/dashboard/overview').trim();

  if (!env?.DB || !oauthEmail || !provider || !providerUid) {
    return { ok: false, error: 'provision_failed' };
  }

  const ensured = await ensureAppUser(
    env,
    {
      email: oauthEmail,
      name,
      supabaseUserId,
      provider,
      provider_uid: providerUid,
      source,
    },
    { allowCreate: true },
  );
  if (!ensured?.authUserId) {
    return { ok: false, error: 'provision_failed' };
  }
  const authUserId = String(ensured.authUserId).trim();

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
    console.warn(`[finalizeInboundOAuth/${provider}] name update:`, e?.message ?? e);
  }

  const identityOk = await ensureIdentityPlaneBeforeSession(env, request, {
    authUserId,
    email: oauthEmail,
    name,
    source,
    provider,
    providerSubject: providerUid,
    supabaseUserId: supabaseUserId || undefined,
  });
  if (!identityOk?.ok) {
    return { ok: false, error: 'provision_failed' };
  }

  await revokeIncomingCookieSession(request, env);

  let sessionId;
  try {
    sessionId = await createLoginSession(request, env, authUserId, sessionProvider, {
      providerSubject: providerUid,
    });
  } catch (e) {
    console.error(`[finalizeInboundOAuth/${provider}] createLoginSession failed`, e?.message ?? e);
    return { ok: false, error: 'session_failed' };
  }

  const tenantId = await resolveTenantAtLogin(env, authUserId).catch(() => null);
  const workspaceId = await resolveCanonicalWorkspace(env, authUserId);
  const sessionDate = new Date().toISOString().slice(0, 10);
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO work_sessions (
        session_id, user_id, tenant_id, workspace_id,
        started_at, last_activity_at, page_context
      ) VALUES (?, ?, ?, ?, unixepoch(), unixepoch(), ?)
    `).bind(
      sessionId,
      authUserId,
      tenantId ?? null,
      workspaceId ?? null,
      pageContext,
    ).run();
  } catch (e) {
    console.warn(`[finalizeInboundOAuth/${provider}] work_sessions insert failed`, e?.message ?? e);
  }
  await env.DB.prepare(`
    UPDATE auth_sessions
    SET workspace_id = ?, work_session_id = ?
    WHERE id = ?
  `).bind(
    workspaceId ?? null,
    sessionId,
    sessionId,
  ).run().catch(() => {});
  await env.DB.prepare(`
    INSERT INTO time_entries
      (user_id, tenant_id, workspace_id, description,
       source, work_session_id, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'auto', ?, unixepoch(), unixepoch(), unixepoch())
  `).bind(
    authUserId,
    tenantId ?? null,
    workspaceId ?? null,
    'Login session — ' + sessionDate,
    sessionId,
  ).run().catch(() => {});
  await env.DB.prepare(`
    INSERT INTO agentsam_analytics
      (tenant_id, workspace_id, period, period_date,
       total_sessions, computed_at)
    VALUES (?, ?, 'session', ?, 1, unixepoch())
    ON CONFLICT(tenant_id, workspace_id, period, period_date)
    DO UPDATE SET
      total_sessions = total_sessions + 1,
      computed_at = unixepoch()
  `).bind(
    tenantId ?? null,
    workspaceId ?? 'ws_unknown',
    sessionDate,
  ).run().catch(() => {});
  const existingProfile = await env.DB.prepare(
    `SELECT id FROM agentsam_subagent_profile WHERE user_id = ? LIMIT 1`,
  ).bind(authUserId).first().catch(() => null);
  if (!existingProfile) {
    await env.DB.prepare(`
      INSERT INTO agentsam_subagent_profile
        (id, user_id, workspace_id, tenant_id, slug,
         display_name, description, icon, agent_type,
         personality_tone, is_active, is_platform_global)
      VALUES (
        'sub_' || lower(hex(randomblob(8))),
        ?, ?, ?, 'agent-sam',
        'Agent Sam', 'Default AI assistant', 'robot',
        'assistant', 'professional', 1, 0
      )
    `).bind(
      authUserId,
      workspaceId ?? '',
      tenantId ?? null,
    ).run().catch(() => {});
  }

  return { ok: true, authUserId, sessionId, tenantId };
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
          workspace_id:
            sessionUser?.active_workspace_id ||
            sessionUser?.default_workspace_id ||
            null,
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

  const ghSubject = String(userInfo.id ?? userInfo.sub ?? oauthEmail).trim();
  const finalizedGh = await finalizeInboundOAuth(env, request, {
    provider: 'github',
    email: oauthEmail,
    name,
    providerUid: ghSubject,
    source: 'github_oauth',
    pageContext: url.pathname,
  });
  if (!finalizedGh.ok) {
    return Response.redirect(
      `${oauthOrigin(url)}/auth/login?error=${finalizedGh.error}`,
      302,
    );
  }
  const { authUserId: userId, sessionId, tenantId: tidGh } = finalizedGh;
  const workspaceId = await resolveCanonicalWorkspace(env, userId);
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
        workspace_id: workspaceId || null,
        metadata_json: null,
      }, { skipRegistry: true });
    } catch (e) {
      console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);
    }
  }
  const loginHeaders = new Headers({
    Location: oauthPostLoginGlobeRedirectUrl(oauthOrigin(url), returnTo),
  });

  appendBrowserLoginSessionCookies(loginHeaders, sessionId);

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
      account_identifier: '',
      account_email: oauthEmail,
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

  const goSubject = String(userInfo.id ?? userInfo.sub ?? oauthEmail).trim();
  const finalizedGo = await finalizeInboundOAuth(env, request, {
    provider: 'google',
    email: oauthEmail,
    name,
    providerUid: goSubject,
    source: 'google_oauth',
    pageContext: url.pathname,
  });
  if (!finalizedGo.ok) {
    return Response.redirect(
      `${oauthOrigin(url)}/auth/login?error=${finalizedGo.error}`,
      302,
    );
  }
  const { sessionId } = finalizedGo;

  const safeDest = safeDashboardLoginRedirectPath(oauthOrigin(url), returnTo);
  const headers = new Headers({ Location: `${oauthOrigin(url)}${safeDest}` });

  appendBrowserLoginSessionCookies(headers, sessionId);

  return new Response(null, { status: 302, headers });
}
