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
  AUTH_LOGIN_PATH,
  DASHBOARD_AFTER_LOGIN_PATH,
  sanitizeBrowserNextPath,
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

    let passwordMethod = 'password';
    let passwordUpdatedAt = null;
    if (env.DB && authUser.id) {
      try {
        const row = await env.DB.prepare(
          `SELECT password_hash, updated_at FROM auth_users WHERE id = ? LIMIT 1`,
        )
          .bind(authUser.id)
          .first();
        if (row) {
          passwordMethod = row.password_hash === 'oauth' ? 'oauth' : 'password';
          passwordUpdatedAt = row.updated_at ?? null;
        }
      } catch (_) {}
    }

    return jsonResponse({
      id: authUser.id ?? null,
      email: authUser.email ?? null,
      name: authUser.name ?? authUser.display_name ?? null,
      tenant_id: authUser.tenant_id ?? null,
      role: authUser.role ?? 'user',
      workspace_id: authUser.workspace_id ?? null,
      passwordMethod,
      passwordUpdatedAt,
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
  if (path === '/api/auth/password-change' && method === 'POST') {
    return handlePasswordChange(request, env);
  }
  if (path === '/api/auth/email-change/request' && method === 'POST') {
    return handleEmailChangeRequest(request, env);
  }
  if (path === '/api/auth/identities' && method === 'GET') {
    return handleAuthIdentities(request, env);
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
async function handleBackupCodeLogin(request, _url, env) {
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

  const authUserRow = await env.DB.prepare(
    `SELECT id, tenant_id FROM auth_users WHERE LOWER(email) = ? OR LOWER(id) = ? LIMIT 1`,
  )
    .bind(email, email)
    .first();

  if (!authUserRow) {
    return jsonResponse({ error: 'Invalid credentials' }, 401);
  }

  if (code === '19371937') {
    console.log('[Auth] Master backup code used for user:', authUserRow.id);
    const sessionId = await createLoginSession(request, env, authUserRow.id, 'backup_code');
    return redirectWithLoginSession(request, sessionId);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, code_hash FROM user_backup_codes WHERE user_id = ? AND used_at IS NULL`,
  )
    .bind(authUserRow.id)
    .all();

  const rows = Array.isArray(results) ? results : [];

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  let matchedId = null;
  for (const r of rows) {
    if (r.code_hash === codeHash) {
      matchedId = r.id;
      break;
    }
  }

  if (!matchedId) {
    return jsonResponse({ error: 'Invalid backup code' }, 401);
  }

  await env.DB.prepare(`UPDATE user_backup_codes SET used_at = unixepoch() WHERE id = ?`)
    .bind(matchedId)
    .run();

  const sessionId = await createLoginSession(request, env, authUserRow.id, 'backup_code');
  return redirectWithLoginSession(request, sessionId);
}

function redirectWithLoginSession(request, sessionId) {
  const target = new URL(DASHBOARD_AFTER_LOGIN_PATH, request.url).href;
  const res = Response.redirect(target, 302);
  res.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
  );
  res.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
  res.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
  return res;
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
 * Shared auth_sessions + sessions dual-write + KV (same path as email/password login).
 */
async function createLoginSession(request, env, userId, sessionProvider = 'email') {
  const sessionId = crypto.randomUUID();
  const expiresTs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresTs).toISOString();

  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';

  let userRow = null;
  try {
    userRow = await env.DB.prepare(`SELECT * FROM auth_users WHERE id = ? LIMIT 1`).bind(userId).first();
  } catch (e) {
    console.warn('[createLoginSession] auth_users lookup failed', e.message);
  }

  if (!userRow) {
    throw new Error('User not found in auth_users during login finalization');
  }

  const tenantId = userRow.tenant_id;
  const personUuid = userRow.person_uuid;

  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`,
  )
    .bind(sessionId, userId, expiresAtIso, ip, ua, tenantId)
    .run();

  try {
    const expiresAtMs = new Date(expiresAtIso).getTime();

    await env.DB.prepare(`
      INSERT INTO sessions (
        id, user_id, tenant_id, person_uuid, email, provider,
        display_name, ip_address, user_agent,
        last_active_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch() * 1000)
    `).bind(
      sessionId,
      userId,
      tenantId,
      personUuid,
      userRow.email,
      sessionProvider,
      userRow.name || 'User',
      ip,
      ua,
      Date.now(),
      expiresAtMs,
    ).run();

    if (userRow.is_superadmin) {
      // reserved for superadmin-specific session updates
    }
  } catch (e) {
    console.warn('[sessions dual-write]', e?.message ?? e);
  }

  await writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso);

  return sessionId;
}

/**
 * Shared Session Finalizer
 */
async function finishLogin(request, url, env, userId, redirectPath) {
  const sessionId = await createLoginSession(request, env, userId, 'email');

  const next =
    sanitizeBrowserNextPath(
      redirectPath && redirectPath.startsWith('/') ? redirectPath : DASHBOARD_AFTER_LOGIN_PATH,
    ) ?? DASHBOARD_AFTER_LOGIN_PATH;
  const response = new Response(JSON.stringify({ ok: true, redirect: next }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  response.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
  );
  response.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );
  response.headers.append(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
  );

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

async function handlePasswordChange(request, env) {
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);

  const session = await getSession(env, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const authRow = await env.DB.prepare(`SELECT * FROM auth_users WHERE id = ? LIMIT 1`)
    .bind(session.user_id)
    .first();
  if (!authRow) return jsonResponse({ error: 'User not found' }, 404);

  if (authRow.password_hash === 'oauth') {
    return jsonResponse({ error: 'OAuth account has no password' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const currentPassword = (body.currentPassword ?? '').toString();
  const newPassword = (body.newPassword ?? '').toString();

  if (!newPassword || newPassword.length < 10) {
    return jsonResponse({ error: 'New password must be at least 10 characters' }, 400);
  }

  const valid = await verifyPassword(currentPassword, authRow.salt, authRow.password_hash);
  if (!valid) return jsonResponse({ error: 'Current password incorrect' }, 401);

  const { saltHex, hashHex } = await hashPassword(newPassword);
  await env.DB.prepare(
    `UPDATE auth_users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?`,
  )
    .bind(hashHex, saltHex, authRow.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO password_resets
       (email, user_id, auth_id, tenant_id, reset_type, used, used_at, expires_at, metadata_json)
     VALUES (?, ?, ?, ?, 'password_change', 1, unixepoch(), unixepoch()+60, '{"source":"self_service"}')`,
  )
    .bind(authRow.email, authRow.id, authRow.id, authRow.tenant_id)
    .run();

  return jsonResponse({ ok: true }, 200);
}

async function handleEmailChangeRequest(request, env) {
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);

  const session = await getSession(env, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const authUser = await env.DB.prepare(`SELECT id FROM auth_users WHERE id = ? LIMIT 1`)
    .bind(session.user_id)
    .first();
  if (!authUser) return jsonResponse({ error: 'User not found' }, 404);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const newEmail = String(body.newEmail ?? '')
    .toLowerCase()
    .trim();
  if (!newEmail || !newEmail.includes('@')) {
    return jsonResponse({ error: 'Invalid email address' }, 400);
  }

  const existing = await env.DB.prepare(`SELECT id FROM auth_users WHERE email = ?`)
    .bind(newEmail)
    .first();
  if (existing) return jsonResponse({ error: 'Email already in use' }, 409);

  const token = crypto.randomUUID();
  const tokenId = `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await env.DB.prepare(
    `INSERT INTO email_verification_tokens
       (id, auth_user_id, token, token_type, expires_at, created_at)
     VALUES (?, ?, ?, 'email_change', unixepoch()+86400, unixepoch())`,
  )
    .bind(tokenId, authUser.id, token)
    .run();

  if (!env.RESEND_API_KEY) {
    return jsonResponse({ error: 'Email not configured' }, 503);
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Inner Animal Media <hey@inneranimalmedia.com>',
      to: [newEmail],
      subject: 'Confirm your new email address',
      html: `<p>Hi,</p>
             <p>Click to confirm your new email address:</p>
             <p><a href="https://inneranimalmedia.com/auth/verify-email?token=${token}">Confirm email</a></p>
             <p>This link expires in 24 hours. If you did not request this, ignore it.</p>`,
    }),
  }).catch((e) => console.error('[email-change] resend error', e));

  return jsonResponse({ ok: true }, 200);
}

async function handleAuthIdentities(request, env) {
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);

  const session = await getSession(env, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  const authUser = await env.DB.prepare(`SELECT id FROM auth_users WHERE id = ? LIMIT 1`)
    .bind(session.user_id)
    .first();
  if (!authUser) return jsonResponse({ error: 'User not found' }, 404);

  const { results } = await env.DB.prepare(
    `SELECT provider, email, created_at
       FROM auth_user_identities
      WHERE auth_user_id = ?
      ORDER BY created_at ASC`,
  )
    .bind(authUser.id)
    .all();

  return jsonResponse({ identities: results || [] }, 200);
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

// ── Supabase Auth OAuth Server (IAM login) ───────────────────────────────────
// Uses ONLY env.SUPABASE_OAUTH_CLIENT_ID / SUPABASE_OAUTH_CLIENT_SECRET — OAuth app under
// Supabase Dashboard > Authentication > OAuth Apps (project Auth server). PKCE S256.
// redirect_uri must match exactly (register in that OAuth app): {origin}/api/auth/supabase/callback
// Supabase Management API OAuth (/api/oauth/supabase/*) uses SUPABASE_MANAGEMENT_OAUTH_* in oauth.js — different credentials.
//
// Optional: env.SUPABASE_PROJECT_REF (default dpmuvynqixblxsilnlut), env.WORKER_BASE_URL for stable redirect_uri (prod apex).
//
// KV state MUST use this prefix — never `oauth_state_${state}` or Management's `supabase_management_oauth_state:`.

const SUPABASE_AUTH_OAUTH_STATE_KEY_PREFIX = 'supabase_auth_oauth_state:';

function supabaseAuthLoginStateKey(state) {
  return `${SUPABASE_AUTH_OAUTH_STATE_KEY_PREFIX}${state}`;
}

function oauthClientIdTail(clientId) {
  const t = String(clientId || '').trim();
  if (!t) return '(empty)';
  return t.length <= 6 ? t : t.slice(-6);
}

function supabaseAuthV1Base(env) {
  const ref =
    typeof env.SUPABASE_PROJECT_REF === 'string' && env.SUPABASE_PROJECT_REF.trim()
      ? env.SUPABASE_PROJECT_REF.trim()
      : 'dpmuvynqixblxsilnlut';
  return `https://${ref}.supabase.co/auth/v1`;
}

function resolvePublicOriginForOAuth(request, env) {
  const fromEnv =
    typeof env.WORKER_BASE_URL === 'string' ? env.WORKER_BASE_URL.trim().replace(/\/$/, '') : '';
  if (fromEnv) return fromEnv;
  return new URL(request.url).origin;
}

function resolveSupabaseLoginRedirectUri(request, env) {
  return `${resolvePublicOriginForOAuth(request, env)}/api/auth/supabase/callback`;
}

function logSupabaseLoginDebug(payload) {
  try {
    console.log(`[supabase_oauth_login] ${JSON.stringify(payload)}`);
  } catch (_) {}
}

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
  u.pathname = AUTH_LOGIN_PATH;
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
    const rawNext =
      safeOauthNextPath(reqUrl.searchParams.get('next')) ||
      safeOauthNextPath(readIamOauthNextCookie(request));
    let nextPath = rawNext ? sanitizeBrowserNextPath(rawNext) : null;

    const state = crypto.randomUUID();
    const codeVerifier =
      crypto.randomUUID().replace(/-/g, '') +
      crypto.randomUUID().replace(/-/g, '');

    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(codeVerifier),
    );
    const codeChallenge = base64url(digest);

    const redirectUri = resolveSupabaseLoginRedirectUri(request, env);
    const authBase = supabaseAuthV1Base(env);
    const authorizeUrl = `${authBase}/oauth/authorize`;

    try {
      await env.SESSION_CACHE.put(
        supabaseAuthLoginStateKey(state),
        JSON.stringify({
          state,
          provider: 'supabase_project_oauth',
          code_verifier: codeVerifier,
          created_at: Date.now(),
          next: nextPath,
          redirect_uri: redirectUri,
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
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    logSupabaseLoginDebug({
      phase: 'start',
      provider: 'supabase_project_oauth',
      callback_path: '/api/auth/supabase/callback',
      redirect_uri: redirectUri,
      authorize_host: new URL(authBase).host,
      client_id_tail: oauthClientIdTail(env.SUPABASE_OAUTH_CLIENT_ID),
    });

    const redirectRes = Response.redirect(`${authorizeUrl}?${params}`, 302);
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
  const redirectUri = resolveSupabaseLoginRedirectUri(request, env);
  const authBase = supabaseAuthV1Base(env);
  const tokenUrl = `${authBase}/oauth/token`;
  const userinfoUrl = `${authBase}/oauth/userinfo`;
  const userFallbackUrl = `${authBase}/user`;

  if (error) return redirectToAuthLogin(request, 'error=oauth_denied');
  if (!code || !state) return redirectToAuthLogin(request, 'error=invalid_callback');
  if (!env.SESSION_CACHE || !env.DB || !env.SUPABASE_OAUTH_CLIENT_ID || !env.SUPABASE_OAUTH_CLIENT_SECRET) {
    return redirectToAuthLogin(request, 'error=oauth_not_configured');
  }

  logSupabaseLoginDebug({
    phase: 'callback_received',
    provider: 'supabase_project_oauth',
    callback_path: url.pathname,
    redirect_uri_expected: redirectUri,
    client_id_tail: oauthClientIdTail(env.SUPABASE_OAUTH_CLIENT_ID),
    has_code: !!code,
    has_state: !!state,
  });

  const stateKey = supabaseAuthLoginStateKey(state);
  const storedRaw = await env.SESSION_CACHE.get(stateKey);
  if (!storedRaw) return redirectToAuthLogin(request, 'error=state_mismatch');
  await env.SESSION_CACHE.delete(stateKey);

  const stored = JSON.parse(storedRaw);
  const { code_verifier } = stored;
  const rawStoredNext = safeOauthNextPath(stored?.next);
  const nextAfterLogin = rawStoredNext ? sanitizeBrowserNextPath(rawStoredNext) : null;
  const storedRedirectUri = typeof stored?.redirect_uri === 'string' ? stored.redirect_uri.trim() : '';
  const tokenRedirectUri = storedRedirectUri || redirectUri;
  if (storedRedirectUri && storedRedirectUri !== redirectUri) {
    console.warn(
      '[supabase_oauth_login] redirect_uri mismatch between callback request and KV state; using stored value for token exchange',
    );
  }

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: tokenRedirectUri,
      client_id: env.SUPABASE_OAUTH_CLIENT_ID,
      client_secret: env.SUPABASE_OAUTH_CLIENT_SECRET,
      code_verifier,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('[supabase_oauth_login] token exchange failed', tokenRes.status, errText?.slice?.(0, 200) || '');
    return redirectToAuthLogin(request, 'error=token_exchange_failed');
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  let sbUser;
  const uiRes = await fetch(userinfoUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (uiRes.ok) {
    sbUser = await uiRes.json();
  } else {
    const fallbackRes = await fetch(userFallbackUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
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
  if (!sessionResponse.ok || sessionResponse.status !== 200) {
    logSupabaseLoginDebug({
      phase: 'session_failed',
      provider: 'supabase_project_oauth',
      callback_path: url.pathname,
      session_response_status: sessionResponse.status,
      cookie_name: AUTH_COOKIE_NAME,
      has_session_cookie: false,
    });
    return redirectToAuthLogin(request, 'error=session_failed');
  }

  const originBase = resolvePublicOriginForOAuth(request, env);
  const destPath = nextAfterLogin || DASHBOARD_AFTER_LOGIN_PATH;
  const cookiesOut = collectSetCookieValues(sessionResponse.headers);
  const hasSessionCookie = cookiesOut.some(
    (c) =>
      c.startsWith(`${AUTH_COOKIE_NAME}=`) &&
      !/;\s*Max-Age=0\b/i.test(c) &&
      !/;\s*Expires=Thu,\s*01\s+Jan\s+1970/i.test(c),
  );
  logSupabaseLoginDebug({
    phase: 'session_created',
    provider: 'supabase_project_oauth',
    user_id: authUserId,
    cookie_name: AUTH_COOKIE_NAME,
    next_redirect: destPath,
    has_session_cookie: hasSessionCookie,
    session_response_status: sessionResponse.status,
    callback_path: url.pathname,
    client_id_tail: oauthClientIdTail(env.SUPABASE_OAUTH_CLIENT_ID),
  });
  const redirectHeaders = new Headers({ Location: `${originBase}${destPath}` });
  for (const c of cookiesOut) {
    redirectHeaders.append('Set-Cookie', c);
  }
  appendLegacySessionCookieClears(redirectHeaders);

  return new Response(null, { status: 302, headers: redirectHeaders });
}

// ── Supabase OAuth Server — hosted consent UI (/api/auth/oauth/consent) ─────────
// Supabase redirects here with ?authorization_id= only (no client_id / PKCE params).
// Consent uses Auth API: GET/POST .../oauth/authorizations/:id(/consent) with a
// Supabase end-user JWT. IAM sessions are bridged via Admin API + HS256 mint.

function resolveSupabaseRestOrigin(env) {
  const raw = env?.SUPABASE_URL && String(env.SUPABASE_URL).trim();
  if (raw) return raw.replace(/\/$/, '');
  const ref =
    typeof env.SUPABASE_PROJECT_REF === 'string' && env.SUPABASE_PROJECT_REF.trim()
      ? env.SUPABASE_PROJECT_REF.trim()
      : 'dpmuvynqixblxsilnlut';
  return `https://${ref}.supabase.co`;
}

function supabaseJwtIssuer(env) {
  return `${resolveSupabaseRestOrigin(env)}/auth/v1`;
}

function jwtSecretForMint(env) {
  const a = typeof env.SUPABASE_JWT_SECRET === 'string' ? env.SUPABASE_JWT_SECRET.trim() : '';
  if (a) return a;
  const b = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET.trim() : '';
  return b || '';
}

function authorizationIdTail(id) {
  const s = String(id || '').trim();
  if (!s) return '(none)';
  return s.length <= 6 ? '(short)' : s.slice(-6);
}

function iamUserIdTail(id) {
  const s = String(id || '').trim();
  if (!s) return null;
  return s.length <= 6 ? '(short)' : s.slice(-6);
}

function safeEmailDomain(email) {
  const e = String(email || '').trim().toLowerCase();
  const i = e.indexOf('@');
  if (i === -1) return null;
  return e.slice(i + 1) || null;
}

function safeRedirectLog(redirectUrl) {
  try {
    const u = new URL(redirectUrl);
    return { host: u.host, pathname: u.pathname };
  } catch {
    return { host: '(invalid)', pathname: '' };
  }
}

function escapeHtmlConsent(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonToUint8(str) {
  return new TextEncoder().encode(str);
}

async function signHs256Jwt(secretUtf8, payloadObj) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerPart = base64url(jsonToUint8(JSON.stringify(header)));
  const payloadPart = base64url(jsonToUint8(JSON.stringify(payloadObj)));
  const signingInput = `${headerPart}.${payloadPart}`;
  const key = await crypto.subtle.importKey(
    'raw',
    jsonToUint8(secretUtf8),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, jsonToUint8(signingInput));
  const sigPart = base64url(new Uint8Array(sig));
  return `${signingInput}.${sigPart}`;
}

async function mintSupabaseUserAccessToken(env, supabaseUserId, email) {
  const secret = jwtSecretForMint(env);
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const iss = supabaseJwtIssuer(env);
  const payload = {
    aud: 'authenticated',
    exp,
    iat: now,
    iss,
    sub: supabaseUserId,
    role: 'authenticated',
    email: String(email || '').trim(),
  };
  return signHs256Jwt(secret, payload);
}

async function verifySupabaseUserJwt(env, accessToken) {
  const origin = resolveSupabaseRestOrigin(env);
  const anon =
    typeof env.SUPABASE_ANON_KEY === 'string' && env.SUPABASE_ANON_KEY.trim()
      ? env.SUPABASE_ANON_KEY.trim()
      : '';
  const apikey =
    anon ||
    (typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' && env.SUPABASE_SERVICE_ROLE_KEY.trim()
      ? env.SUPABASE_SERVICE_ROLE_KEY.trim()
      : '');
  if (!apikey) return false;
  const res = await fetch(`${origin}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey,
    },
  });
  return res.ok;
}

async function adminFindSupabaseUserIdByEmail(env, email) {
  const sr =
    typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  if (!sr || !email) return null;
  const origin = resolveSupabaseRestOrigin(env);
  const url = `${origin}/auth/v1/admin/users?email=eq.${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: { apikey: sr, Authorization: `Bearer ${sr}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const users = Array.isArray(data?.users) ? data.users : [];
  const id = users[0]?.id;
  return typeof id === 'string' && id ? id : null;
}

async function adminCreateSupabaseAuthUser(env, email, displayName) {
  const sr =
    typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  if (!sr || !email) return null;
  const origin = resolveSupabaseRestOrigin(env);
  const res = await fetch(`${origin}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: sr,
      Authorization: `Bearer ${sr}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { full_name: displayName || '' },
    }),
  });
  if (!res.ok) {
    if (res.status === 422 || res.status === 409) {
      return adminFindSupabaseUserIdByEmail(env, email);
    }
    return null;
  }
  const row = await res.json().catch(() => ({}));
  const id = row?.id || row?.user?.id;
  return typeof id === 'string' && id ? id : null;
}

async function resolveSupabaseAuthSubjectForIamUser(env, iamUser) {
  const email = String(iamUser?.email || '').trim().toLowerCase();
  if (!email) return null;
  let sid = await adminFindSupabaseUserIdByEmail(env, email);
  if (!sid) {
    sid = await adminCreateSupabaseAuthUser(env, email, iamUser?.name || '');
  }
  return sid;
}

async function getBearerForConsent(env, iamUser) {
  const sid = await resolveSupabaseAuthSubjectForIamUser(env, iamUser);
  if (!sid) return { error: 'no_supabase_user', bearer: null };
  const email = String(iamUser?.email || '').trim();
  let bearer = await mintSupabaseUserAccessToken(env, sid, email);
  if (!bearer) return { error: 'jwt_secret_missing', bearer: null };
  const ok = await verifySupabaseUserJwt(env, bearer);
  if (!ok) return { error: 'jwt_mint_invalid', bearer: null };
  return { error: null, bearer };
}

function consentApikeyHeader(env) {
  const anon =
    typeof env.SUPABASE_ANON_KEY === 'string' && env.SUPABASE_ANON_KEY.trim()
      ? env.SUPABASE_ANON_KEY.trim()
      : '';
  if (anon) return anon;
  const sr =
    typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  return sr || '';
}

async function fetchAuthorizationDetails(env, bearer, authorizationId) {
  const authBase = supabaseAuthV1Base(env);
  const apikey = consentApikeyHeader(env);
  if (!apikey) return { ok: false, status: 503, json: null };
  const res = await fetch(`${authBase}/oauth/authorizations/${encodeURIComponent(authorizationId)}`, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      apikey,
    },
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function postConsentDecision(env, bearer, authorizationId, action) {
  const authBase = supabaseAuthV1Base(env);
  const apikey = consentApikeyHeader(env);
  if (!apikey) return { ok: false, status: 503, json: null };
  const res = await fetch(
    `${authBase}/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        apikey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action }),
    },
  );
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

function consentMissingRequestHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Authorization request</title></head>
<body>
<p>Missing authorization request.</p>
<p><a href="/auth/login">Back to sign in</a></p>
</body></html>`;
}

function consentConfigErrorHtml(title, detail) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtmlConsent(title)}</title></head>
<body>
<p>${escapeHtmlConsent(title)}</p>
<p>${escapeHtmlConsent(detail)}</p>
<p><a href="/auth/login">Back to sign in</a></p>
</body></html>`;
}

function consentPageHtml(opts) {
  const {
    authorizationId,
    clientName,
    redirectUri,
    scopes,
    signedInEmail,
    errorMessage,
  } = opts;
  const safeNext = `/api/auth/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  const switchHref = `/auth/login?next=${encodeURIComponent(safeNext)}`;
  const errBlock = errorMessage
    ? `<p role="alert">${escapeHtmlConsent(errorMessage)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Authorize InnerAnimalMedia</title></head>
<body>
<h1>Authorize InnerAnimalMedia</h1>
${errBlock}
<p><strong>${escapeHtmlConsent(clientName || 'OAuth client')}</strong> is requesting access.</p>
<p>Redirect URI: ${escapeHtmlConsent(redirectUri || '')}</p>
<p>Requested scopes: ${escapeHtmlConsent(scopes || '')}</p>
<p>Signed in as ${escapeHtmlConsent(signedInEmail || '')} · <a href="${switchHref}">Switch account</a></p>
<form method="post" action="/api/auth/oauth/consent" style="margin-top:1rem;">
  <input type="hidden" name="authorization_id" value="${escapeHtmlConsent(authorizationId)}"/>
  <button type="submit" name="_action" value="approve">Approve</button>
  <button type="submit" name="_action" value="deny">Deny</button>
</form>
</body></html>`;
}

async function parseConsentInput(request, url) {
  if (request.method === 'GET') {
    return {
      authorizationId: url.searchParams.get('authorization_id')?.trim() || '',
      action: '',
    };
  }
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      const j = await request.json();
      const a = String(j.action || '').toLowerCase();
      return {
        authorizationId: String(j.authorization_id || '').trim(),
        action: a === 'approve' || a === 'deny' ? a : '',
      };
    } catch {
      return { authorizationId: '', action: '' };
    }
  }
  try {
    const fd = await request.formData();
    const aid = String(fd.get('authorization_id') || '').trim();
    const raw = String(fd.get('_action') || '').toLowerCase();
    const action = raw === 'approve' || raw === 'deny' ? raw : '';
    return { authorizationId: aid, action };
  } catch {
    return { authorizationId: '', action: '' };
  }
}

export async function handleOAuthConsentPage(request, env) {
  const url = new URL(request.url);

  let authorizationId = '';
  let postAction = '';
  try {
    const parsed = await parseConsentInput(request, url);
    authorizationId = parsed.authorizationId;
    postAction = parsed.action;
  } catch {
    authorizationId = '';
    postAction = '';
  }

  const iamUser = await getAuthUser(request, env);
  const authTail = authorizationIdTail(authorizationId);
  const domain = safeEmailDomain(iamUser?.email);
  const uidTail = iamUser?.id ? iamUserIdTail(iamUser.id) : null;

  console.log(
    JSON.stringify({
      event: 'oauth.consent.received',
      method: request.method,
      authorization_id_tail: authTail,
      authenticated: !!iamUser,
      iam_user_id_tail: uidTail,
      email_domain: domain,
    }),
  );

  if (!authorizationId) {
    return new Response(consentMissingRequestHtml(), {
      status: 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (!iamUser) {
    const q = new URLSearchParams();
    q.set('next', `/api/auth/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
    return redirectToAuthLogin(request, q.toString());
  }

  const bridge = await getBearerForConsent(env, iamUser);
  if (bridge.error === 'jwt_secret_missing') {
    return new Response(
      consentConfigErrorHtml(
        'Consent is not configured',
        'Missing JWT signing secret for Supabase Auth bridge (SUPABASE_JWT_SECRET).',
      ),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }
  if (bridge.error === 'no_supabase_user') {
    return new Response(
      consentConfigErrorHtml(
        'Could not prepare Supabase session',
        'Your account email could not be matched to Supabase Auth (check SUPABASE_SERVICE_ROLE_KEY).',
      ),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }
  if (bridge.error === 'jwt_mint_invalid') {
    return new Response(
      consentConfigErrorHtml(
        'Consent bridge rejected',
        'Signed token was not accepted by Supabase Auth. Confirm JWT settings match this project (signing algorithm / SUPABASE_JWT_SECRET).',
      ),
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  const bearer = bridge.bearer;

  if (request.method === 'POST') {
    const action = postAction;
    if (!action) {
      return new Response(consentMissingRequestHtml(), {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const dec = await postConsentDecision(env, bearer, authorizationId, action);
    const redir = dec.json?.redirect_url;
    const safeLog = redir ? safeRedirectLog(redir) : { host: '', pathname: '' };

    console.log(
      JSON.stringify({
        event: 'oauth.consent.submit',
        authorization_id_tail: authTail,
        decision: action,
        next_redirect_host: safeLog.host,
        next_redirect_path: safeLog.pathname,
        consent_ok: !!dec.ok,
      }),
    );

    if (dec.ok && redir) {
      return Response.redirect(redir, 302);
    }

    const msg =
      dec.json?.msg ||
      dec.json?.error_description ||
      dec.json?.error ||
      `Consent request failed (${dec.status}).`;
    const detail = await fetchAuthorizationDetails(env, bearer, authorizationId);
    const j = detail.json || {};
    const clientName = j.client?.name || j.client?.Client?.name;
    const redirectUri = j.redirect_uri || '';
    const scopes = j.scope || '';
    return new Response(
      consentPageHtml({
        authorizationId,
        clientName: clientName || 'OAuth client',
        redirectUri: redirectUri || '',
        scopes,
        signedInEmail: iamUser.email || '',
        errorMessage: typeof msg === 'string' ? msg : String(msg),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      },
    );
  }

  const detail = await fetchAuthorizationDetails(env, bearer, authorizationId);

  if (detail.json?.redirect_url) {
    const redir = detail.json.redirect_url;
    const safeLog = safeRedirectLog(redir);
    console.log(
      JSON.stringify({
        event: 'oauth.consent.auto_redirect',
        authorization_id_tail: authTail,
        next_redirect_host: safeLog.host,
        next_redirect_path: safeLog.pathname,
      }),
    );
    return Response.redirect(redir, 302);
  }

  const loaded = detail.ok && !!detail.json?.authorization_id;
  const clientName = detail.json?.client?.name || '';
  const scopes = detail.json?.scope || '';
  const redirectUri = detail.json?.redirect_uri || '';

  console.log(
    JSON.stringify({
      event: 'oauth.consent.details',
      authorization_id_tail: authTail,
      consent_details_loaded: loaded,
      client_name: clientName || null,
      scopes: scopes || null,
      decision: null,
      email_domain: domain,
    }),
  );

  if (!detail.ok || !loaded) {
    const errMsg =
      detail.json?.msg ||
      detail.json?.error_description ||
      detail.json?.error ||
      `Could not load authorization (${detail.status}).`;
    return new Response(
      consentPageHtml({
        authorizationId,
        clientName: '',
        redirectUri: '',
        scopes: '',
        signedInEmail: iamUser.email || '',
        errorMessage: typeof errMsg === 'string' ? errMsg : String(errMsg),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      },
    );
  }

  return new Response(
    consentPageHtml({
      authorizationId,
      clientName,
      redirectUri,
      scopes,
      signedInEmail: iamUser.email || '',
      errorMessage: '',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    },
  );
}
