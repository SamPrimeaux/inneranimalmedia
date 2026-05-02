/**
 * Identity & Access Layer
 * Handles session validation, Superadmin resolution, and Policy checks.
 * Canonical Identity: auth_users.id (au_ prefix).
 */

/** Cached superadmin identifiers: auth_users.id, emails (TTL 5m). */
let SUPERADMIN_IDS_CACHE = null;
let SUPERADMIN_IDS_CACHE_TIME = 0;

export const IAM_KV_SESSION_KEY_PREFIX = 'iam_sess_v1:';
export const AUTH_COOKIE_NAME = 'session';
export const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function invalidateSuperadminIdentifiersCache() {
  SUPERADMIN_IDS_CACHE = null;
  SUPERADMIN_IDS_CACHE_TIME = 0;
}

/**
 * Resolves the list of Superadmin identifiers from D1.
 */
export async function getSuperadminAuthIds(env) {
  if (!env?.DB) {
    return { authIds: new Set(), emails: new Set() };
  }
  const now = Date.now();
  if (SUPERADMIN_IDS_CACHE && now - SUPERADMIN_IDS_CACHE_TIME < 300000) {
    return SUPERADMIN_IDS_CACHE;
  }
  try {
    const result = await env.DB.prepare(
      `SELECT id, email FROM auth_users WHERE COALESCE(is_superadmin, 0) = 1`
    ).all();
    const cache = { authIds: new Set(), emails: new Set() };
    for (const row of result.results || []) {
      if (row.id) cache.authIds.add(row.id);
      if (row.email) cache.emails.add(String(row.email).toLowerCase().trim());
    }
    SUPERADMIN_IDS_CACHE = cache;
    SUPERADMIN_IDS_CACHE_TIME = now;
    return cache;
  } catch (e) {
    console.warn('[getSuperadminAuthIds]', e?.message ?? e);
    return { authIds: new Set(), emails: new Set() };
  }
}

/**
 * Checks if an email belongs to a Superadmin.
 */
export async function isSuperadminEmail(env, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || !env?.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT 1 FROM auth_users WHERE LOWER(email) = ? AND COALESCE(is_superadmin, 0) = 1 LIMIT 1`
    ).bind(em).first();
    return !!row;
  } catch (e) {
    console.warn('[isSuperadminEmail]', e?.message ?? e);
    return false;
  }
}

/**
 * Checks if a session user key belongs to a Superadmin.
 */
export async function isSuperadminSessionUserKey(env, userKey) {
  const k = String(userKey || '').trim();
  if (!k || !env?.DB) return false;
  try {
    const cache = await getSuperadminAuthIds(env);
    if (k.includes('@')) return cache.emails.has(k.toLowerCase());
    return cache.authIds.has(k);
  } catch (e) {
    console.warn('[isSuperadminSessionUserKey]', e?.message ?? e);
    return false;
  }
}

/**
 * Builds a stateful context for a Superadmin session.
 */
export async function buildSuperadminContext(env, sessionId, sessionUserKey) {
  const key = String(sessionUserKey || '').trim();
  if (!key) throw new Error('empty session user key');
  let authRow = null;
  if (key.includes('@')) {
    authRow = await env.DB.prepare(
      `SELECT * FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1`
    ).bind(key).first();
  } else {
    authRow = await env.DB.prepare(
      `SELECT * FROM auth_users WHERE id = ? LIMIT 1`
    ).bind(key).first();
  }
  
  if (!authRow) {
    throw new Error('Superadmin session user not found');
  }

  return {
    id: sessionId,
    email: authRow.email,
    user_id: authRow.id,
    _session_user_id: authRow.email,
    name: authRow.name || 'Superadmin',
    role: 'superadmin',
    permissions: ['*'],
    tenant_id: authRow.tenant_id,
    person_uuid: authRow.person_uuid,
    is_active: 1,
    is_superadmin: 1,
  };
}

/**
 * Zero Trust Gate: Limits high-privilege operations to Sam or Superadmins.
 */
export async function isSamOnlyUser(env, authUser) {
  if (!authUser) return false;
  if (authUser.is_superadmin === 1) return true;
  if (!env?.DB) return false;
  const email = String(authUser.email || '').toLowerCase();
  if (email && (await isSuperadminEmail(env, email))) return true;
  const uid = String(authUser.id || '').trim();
  if (uid) {
    const ids = await getSuperadminAuthIds(env);
    if (ids.authIds.has(uid)) return true;
  }
  return false;
}

export function sessionIsPlatformSuperadmin(session) {
  return !!(session && (session.is_superadmin === 1 || session.is_superadmin === true));
}

export function authUserIsSuperadmin(authUser) {
  return !!(authUser && (authUser.is_superadmin === 1 || authUser.is_superadmin === true));
}

/** Session + auth user for handlers that need both. */
export async function getSamContext(request, env) {
  const session = await getSession(env, request).catch(() => null);
  const authUser = await getAuthUser(request, env);
  return { session, authUser };
}

/**
 * Returns the apex domain for cookie setting.
 */
export function getApexDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    if (hostname.endsWith('inneranimalmedia.com')) return 'inneranimalmedia.com';
    if (hostname.endsWith('.workers.dev') || hostname.endsWith('.pages.dev')) return '';
    return parts.slice(-2).join('.');
  }
  return hostname;
}

/**
 * Global Session Retrieval (KV + Context)
 */
export async function getSession(env, request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const regex = new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`, 'g');
  let match;
  const sessionCandidates = [];
  while ((match = regex.exec(cookieHeader)) !== null) {
    sessionCandidates.push(match[1]);
  }
  if (sessionCandidates.length === 0) return null;

  for (const sessionId of sessionCandidates) {
    if (env.SESSION_CACHE) {
      try {
        const data = await env.SESSION_CACHE.get(IAM_KV_SESSION_KEY_PREFIX + sessionId);
        if (data) {
          const parsed = JSON.parse(data);
          return { ...parsed, session_id: sessionId };
        }
      } catch (e) { }
    }
  }

  if (env.DB) {
    for (const sessionId of sessionCandidates) {
      try {
        const row = await env.DB.prepare(
          `SELECT id, user_id, expires_at, tenant_id FROM auth_sessions 
           WHERE id = ? AND datetime(expires_at) > datetime('now') 
           LIMIT 1`
        ).bind(sessionId).first();

        if (row) {
          const payload = { 
            v: 1,
            session_id: row.id,
            user_id: row.user_id, 
            tenant_id: row.tenant_id, 
            expires_at: row.expires_at 
          };
          if (env.SESSION_CACHE) {
            await env.SESSION_CACHE.put(
              IAM_KV_SESSION_KEY_PREFIX + sessionId, 
              JSON.stringify(payload), 
              { expirationTtl: 3600 }
            );
          }
          return payload;
        }
      } catch (e) { }
    }
  }
  return null;
}

export async function writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso) {
  if (!env.SESSION_CACHE || !sessionId || !userId) return;
  const payload = {
    v: 1,
    session_id: sessionId,
    user_id: userId,
    tenant_id: tenantId || null,
    expires_at: expiresAtIso || null,
  };
  try {
    const ms = expiresAtIso ? new Date(expiresAtIso).getTime() - Date.now() : 0;
    const ttl = ms > 0 ? Math.max(300, Math.min(AUTH_SESSION_TTL_SECONDS, Math.floor(ms / 1000))) : AUTH_SESSION_TTL_SECONDS;
    await env.SESSION_CACHE.put(IAM_KV_SESSION_KEY_PREFIX + sessionId, JSON.stringify(payload), {
      expirationTtl: ttl,
    });
  } catch (e) { }
}

export async function getAuthUser(request, env) {
  const session = await getSession(env, request);
  if (!session) return null;

  const authId = session.user_id; // au_ prefix
  
  if (env.DB && authId) {
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM auth_users WHERE id = ? LIMIT 1`
      ).bind(authId).first();

      if (row) {
        return {
          id:            row.id,          // au_ prefix — canonical
          auth_id:       row.id,          // legacy compat
          person_uuid:   row.person_uuid,
          email:         row.email,
          name:          row.name,
          tenant_id:     row.tenant_id,
          is_superadmin: row.is_superadmin ? 1 : 0,
          session_id:    session.session_id,
          expires_at:    session.expires_at ? (typeof session.expires_at === 'number' ? session.expires_at : new Date(session.expires_at).getTime()) : null,
        };
      }
    } catch (e) {
      console.warn('[getAuthUser Error]', e.message);
    }
  }

  return {
    id: authId,
    auth_id: authId,
    email: session._session_user_id || null,
    tenant_id: session.tenant_id || null,
    is_superadmin: 0,
    session_id: session.session_id,
    expires_at: session.expires_at ? (typeof session.expires_at === 'number' ? session.expires_at : new Date(session.expires_at).getTime()) : null,
  };
}

export async function establishIamSession(request, env, userId, bodyObj = { ok: true }) {
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);
  const sessionId = crypto.randomUUID();
  const expiresTs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresTs).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  
  // Resolve tenant
  let tid = null;
  try {
    const u = await env.DB.prepare(`SELECT tenant_id FROM auth_users WHERE id = ? LIMIT 1`).bind(userId).first();
    tid = u?.tenant_id || null;
  } catch (_) {}

  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`
  ).bind(sessionId, userId, expiresAtIso, ip, ua, tid).run();
  
  await writeIamSessionToKv(env, sessionId, userId, tid, expiresAtIso);
  
  const response = jsonResponse(bodyObj);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
  return response;
}

export function isIngestSecretAuthorized(request, env) {
  const h = request.headers.get('X-Ingest-Secret');
  return !!(env.INGEST_SECRET && h && h === env.INGEST_SECRET);
}

export function verifyInternalApiSecret(request, env) {
  const secret = env?.INTERNAL_API_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = (request.headers.get('X-Internal-Secret') || '').trim();
  return bearer === secret || header === secret;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status: Number(status) || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 
 * Legacy/Helper: Resolves tenant ID for telemetry events.
 */
export function resolveTelemetryTenantId(_env, explicitTenantId) {
  if (explicitTenantId != null && String(explicitTenantId).trim() !== '') {
    return String(explicitTenantId).trim();
  }
  return null;
}

/** Workers `TENANT_ID` binding — platform default tenant (never hardcode a personal id in code). */
export function platformTenantIdFromEnv(env) {
  const t = env?.TENANT_ID != null ? String(env.TENANT_ID).trim() : '';
  return t || null;
}

/** Fallback when no request/session tenant applies (cron, internal jobs). */
export function fallbackSystemTenantId(env) {
  return platformTenantIdFromEnv(env) || 'system';
}

/**
 * Legacy/Helper: Fetches the tenant ID for a user.
 */
export async function fetchAuthUserTenantId(env, userKey) {
  if (!env?.DB || userKey == null || String(userKey).trim() === '') return null;
  const k = String(userKey).trim();
  try {
    const u = await env.DB.prepare(
      `SELECT tenant_id FROM auth_users WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1`
    ).bind(k, k).first();
    if (u && u.tenant_id != null && String(u.tenant_id).trim() !== '') return String(u.tenant_id).trim();
  } catch (e) {
    console.warn('[fetchAuthUserTenantId]', e?.message ?? e);
  }
  return null;
}

/**
 * Legacy/Helper: Alias for fetchAuthUserTenantId.
 */
export async function resolveTenantAtLogin(env, userId) {
  return await fetchAuthUserTenantId(env, userId);
}

/**
 * Legacy/Helper: Empty stub for user enrichment.
 */
export async function resolveUserEnrichment(env, authUser) {
  return authUser;
}

/**
 * Internal: Hex string to Uint8Array.
 */
function hexToBytes(hex) {
  const arr = [];
  for (let i = 0; i < hex.length; i += 2) arr.push(parseInt(hex.slice(i, i + 2), 16));
  return new Uint8Array(arr);
}

/**
 * Security: Verify password against PBKDF2-SHA256 stored hash and salt.
 */
export async function verifyPassword(password, saltHex, hashHex) {
  try {
    const salt = hexToBytes(saltHex);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      key,
      256
    );
    const derivedHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return derivedHex === hashHex.toLowerCase();
  } catch (e) {
    console.warn('[verifyPassword] failed', e.message);
    return false;
  }
}

/**
 * Security: Generate new salt and PBKDF2-SHA256 hash.
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const hashHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { saltHex, hashHex };
}
