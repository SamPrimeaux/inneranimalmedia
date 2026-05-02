/**
 * Identity & Access Layer
 * Handles session validation, Superadmin resolution, and Policy checks.
 * Deconstructed from legacy worker.js.
 */

/** Cached superadmin identifiers: auth_users.id, users.id (OAuth), emails (TTL 5m). */
let SUPERADMIN_IDS_CACHE = null;
let SUPERADMIN_IDS_CACHE_TIME = 0;

/** SESSION_CACHE (production-KV_SESSIONS): fast edge session blob; D1 auth_sessions remains source of truth for expiry audit. */
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
    return { authIds: new Set(), userIds: new Set(), emails: new Set() };
  }
  const now = Date.now();
  if (SUPERADMIN_IDS_CACHE && now - SUPERADMIN_IDS_CACHE_TIME < 300000) {
    return SUPERADMIN_IDS_CACHE;
  }
  try {
    const result = await env.DB.prepare(
      `SELECT au.id AS auth_id, au.email, u.id AS user_id
       FROM auth_users au
       LEFT JOIN users u ON u.auth_id = au.id
       WHERE COALESCE(au.is_superadmin, 0) = 1`
    ).all();
    const cache = { authIds: new Set(), userIds: new Set(), emails: new Set() };
    for (const row of result.results || []) {
      if (row.auth_id) cache.authIds.add(row.auth_id);
      if (row.user_id) cache.userIds.add(row.user_id);
      if (row.email) cache.emails.add(String(row.email).toLowerCase().trim());
    }
    SUPERADMIN_IDS_CACHE = cache;
    SUPERADMIN_IDS_CACHE_TIME = now;
    return cache;
  } catch (e) {
    console.warn('[getSuperadminAuthIds]', e?.message ?? e);
    return { authIds: new Set(), userIds: new Set(), emails: new Set() };
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
    return cache.authIds.has(k) || cache.userIds.has(k);
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
      `SELECT id, email, name, superadmin_group_id FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1`
    ).bind(key).first();
  } else {
    authRow = await env.DB.prepare(
      `SELECT id, email, name, superadmin_group_id FROM auth_users WHERE id = ? LIMIT 1`
    ).bind(key).first();
    if (!authRow) {
      try {
        authRow = await env.DB.prepare(
          `SELECT au.id, au.email, au.name, au.superadmin_group_id
           FROM users u
           INNER JOIN auth_users au ON u.auth_id = au.id
           WHERE u.id = ? LIMIT 1`
        ).bind(key).first();
      } catch (e) {
        console.warn('[buildSuperadminContext] users join', e?.message ?? e);
      }
    }
  }
  if (!authRow?.superadmin_group_id) {
    throw new Error('Superadmin session user missing superadmin_group_id');
  }
  let userProfile = null;
  try {
    userProfile = await env.DB.prepare(
      `SELECT display_name, role, default_workspace_id FROM users WHERE user_key = ? LIMIT 1`
    ).bind(authRow.superadmin_group_id).first();
  } catch (e) {
    console.warn('[buildSuperadminContext] users profile', e?.message ?? e);
  }
  const loginEmail = String(authRow.email || key).toLowerCase();
  const displayName = (userProfile && userProfile.display_name) || authRow.name || 'User';
  const role = (userProfile && userProfile.role) || 'superadmin';
  const workspaceId = (userProfile && userProfile.default_workspace_id) || 'ws_default';
  
  return {
    id: sessionId,
    email: loginEmail,
    user_id: authRow.superadmin_group_id,
    _session_user_id: loginEmail,
    name: displayName,
    role,
    permissions: ['*'],
    tenant_id: null,
    workspace_id: workspaceId,
    is_active: 1,
    is_superadmin: 1,
  };
}

/**
 * Resolves the canonical user key for Agent Sam operations.
 */
export async function resolveAgentsamUserKey(env, authUser) {
  if (!authUser?.id) return null;
  const isSuperAdmin =
    authUser.is_superadmin === 1 ||
    authUser.role === 'superadmin' ||
    authUser.is_super === 1;
  if (isSuperAdmin) return authUser.tenant_id ?? authUser.id;
  if (!env?.DB) return authUser.id;
  try {
    const row = await env.DB.prepare(
      `SELECT superadmin_group_id FROM auth_users WHERE id = ? AND COALESCE(is_superadmin, 0) = 1 LIMIT 1`
    ).bind(authUser.id).first();
    if (row?.superadmin_group_id) return row.superadmin_group_id;
  } catch (_) { }
  const em = String(authUser.email || '').trim();
  if (em) {
    try {
      const byEmail = await env.DB.prepare(
        `SELECT superadmin_group_id FROM auth_users WHERE LOWER(email) = LOWER(?) AND COALESCE(is_superadmin, 0) = 1 LIMIT 1`
      ).bind(em).first();
      if (byEmail?.superadmin_group_id) return byEmail.superadmin_group_id;
    } catch (_) { }
  }
  return authUser.id;
}

/**
 * Zero Trust Gate: Limits high-privilege operations to Sam or Superadmins.
 */
export async function isSamOnlyUser(env, authUser) {
  if (!authUser) return false;
  const isSuperAdmin =
    authUser.is_superadmin === 1 ||
    authUser.role === 'superadmin' ||
    authUser.is_super === 1;
  if (isSuperAdmin) return true;
  if (!env?.DB) return false;
  const email = String(authUser.email || '').toLowerCase();
  if (email && (await isSuperadminEmail(env, email))) return true;
  const uid = String(authUser.id || '').trim();
  if (uid) {
    const ids = await getSuperadminAuthIds(env);
    if (ids.authIds.has(uid) || ids.userIds.has(uid)) return true;
  }
  return false;
}

export function sessionIsPlatformSuperadmin(session) {
  return !!(session && (session.is_superadmin === 1 || session.is_superadmin === true));
}

/** True when the resolved auth user is a platform superadmin (D1 `is_superadmin`). */
export function authUserIsSuperadmin(authUser) {
  return !!(authUser && (authUser.is_superadmin === 1 || authUser.is_superadmin === true));
}

/**
 * Deprecated: worker plaintext TENANT_ID removed — tenant always from session / D1 user rows.
 */
export function tenantIdFromEnv(_env) {
  return null;
}

/** Telemetry tenant: explicit routing value only (no env fallback). */
export function resolveTelemetryTenantId(_env, explicitTenantId) {
  if (explicitTenantId != null && String(explicitTenantId).trim() !== '') {
    return String(explicitTenantId).trim();
  }
  return null;
}

/**
 * Tenant for anonymous / bootstrap worker paths only.
 * Authenticated requests must carry tenant_id on the session (or resolve via fetchAuthUserTenantId at login).
 */
export function resolveTenantIdForWorker(session, _env) {
  if (session?.tenant_id != null && String(session.tenant_id).trim() !== '') {
    return String(session.tenant_id).trim();
  }
  if (session?.user_id != null && String(session.user_id).trim() !== '') return null;
  return null;
}

/** Session + auth user for handlers that need both (replaces env-based tenant defaults). */
export async function getSamContext(request, env) {
  const session = await getSession(env, request).catch(() => null);
  const authUser = await getAuthUser(request, env);
  return { session, authUser };
}

/**
 * Returns the apex domain for cookie setting (e.g. inneranimalmedia.com).
 */
export function getApexDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    // Basic logic for inneranimalmedia.com ecosystem
    if (hostname.endsWith('inneranimalmedia.com')) return 'inneranimalmedia.com';
    
    // Safety check for public suffixes like .workers.dev where Domain cookies fail
    if (hostname.endsWith('.workers.dev') || hostname.endsWith('.pages.dev')) return '';
    
    // Return the apex domain (e.g., example.com) without a leading dot.
    return parts.slice(-2).join('.');
  }
  return hostname;
}

/**
 * Global Session Retrieval (KV + Context)
 */
export async function getSession(env, request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  
  // Find all occurrences of the session cookie
  const sessionCandidates = [];
  const regex = new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`, 'g');
  let match;
  while ((match = regex.exec(cookieHeader)) !== null) {
    sessionCandidates.push(match[1]);
  }

  if (sessionCandidates.length === 0) return null;

  // 1. Try KV for speed
  for (const sessionId of sessionCandidates) {
    if (env.SESSION_CACHE) {
      try {
        const data = await env.SESSION_CACHE.get(IAM_KV_SESSION_KEY_PREFIX + sessionId);
        if (data) {
          const parsed = JSON.parse(data);
          const merged = { ...parsed, session_id: sessionId };
          if (
            env.DB &&
            merged.user_id &&
            (merged.tenant_id == null || String(merged.tenant_id).trim() === '')
          ) {
            void fetchAuthUserTenantId(env, merged.user_id).then((tid) => {
              if (!tid) return;
              patchAuthSessionTenantIfMissing(env, sessionId, tid, merged.user_id, merged.expires_at);
            });
          }
          return merged;
        }
      } catch (e) { }
    }
  }

  // 2. Try D1 Fallback (P0 fix for auth loops)
  if (env.DB) {
    for (const sessionId of sessionCandidates) {
      try {
        const row = await env.DB.prepare(
          `SELECT id, user_id, expires_at, tenant_id FROM auth_sessions 
           WHERE id = ? AND datetime(expires_at) > datetime('now') 
           LIMIT 1`
        ).bind(sessionId).first();

        if (row) {
          if (
            (row.tenant_id == null || String(row.tenant_id).trim() === '') &&
            row.user_id
          ) {
            void fetchAuthUserTenantId(env, row.user_id).then((tid) => {
              if (!tid) return;
              patchAuthSessionTenantIfMissing(env, row.id, tid, row.user_id, row.expires_at);
            });
          }
          // Success: Repopulate KV so cache is warm for next request
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
      } catch (e) {
        console.warn('[getSession D1 Fallback Error]', e.message);
      }
    }
  }

  return null;
}

export async function writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso) {
  if (!env.SESSION_CACHE || !sessionId || !userId) return;
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  const payload = {
    v: 1,
    session_id: sessionId,
    user_id: userId,
    tenant_id: tid,
    expires_at: expiresAtIso || null,
  };
  try {
    await env.SESSION_CACHE.put(IAM_KV_SESSION_KEY_PREFIX + sessionId, JSON.stringify(payload), {
      expirationTtl: ttlSecondsFromExpiresAtIso(expiresAtIso),
    });
  } catch (e) {
    console.warn('[writeIamSessionToKv]', e?.message ?? e);
  }
}

export function ttlSecondsFromExpiresAtIso(expiresAtIso) {
  if (!expiresAtIso) return AUTH_SESSION_TTL_SECONDS;
  const ms = new Date(expiresAtIso).getTime() - Date.now();
  return Math.max(300, Math.min(AUTH_SESSION_TTL_SECONDS, Math.floor(ms / 1000)));
}

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
  if (k.startsWith('usr_')) {
    try {
      const row = await env.DB
        .prepare(
          `SELECT au.tenant_id AS tenant_id
           FROM users u
           INNER JOIN auth_users au ON au.id = u.auth_id
           WHERE u.id = ?
           LIMIT 1`,
        )
        .bind(k)
        .first();
      if (row?.tenant_id != null && String(row.tenant_id).trim() !== '') return String(row.tenant_id).trim();
    } catch (e) {
      console.warn('[fetchAuthUserTenantId join]', e?.message ?? e);
    }
    try {
      const only = await env.DB
        .prepare(`SELECT tenant_id FROM users WHERE id = ? LIMIT 1`)
        .bind(k)
        .first();
      if (only?.tenant_id != null && String(only.tenant_id).trim() !== '') return String(only.tenant_id).trim();
    } catch (e) {
      console.warn('[fetchAuthUserTenantId users]', e?.message ?? e);
    }
  }
  return null;
}

/** Tenant persisted on new auth_sessions rows — D1 only, never env.TENANT_ID (avoids stamping every login with the worker default tenant). */
export async function resolveTenantAtLogin(env, userId) {
  return await fetchAuthUserTenantId(env, userId);
}

/** Hex string to Uint8Array for PBKDF2 salt. */
function hexToBytes(hex) {
  const arr = [];
  for (let i = 0; i < hex.length; i += 2) arr.push(parseInt(hex.slice(i, i + 2), 16));
  return new Uint8Array(arr);
}

/** Verify password against PBKDF2-SHA256 stored hash (hex) and salt (hex). Returns true if match. */
export async function verifyPassword(password, saltHex, hashHex) {
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const derivedHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return derivedHex === hashHex.toLowerCase();
}

/** Generate new salt (32 bytes hex) and PBKDF2-SHA256 hash for change-password. Returns { saltHex, hashHex }. */
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

export async function writeIamSessionToKv_old(env, sessionId, userId, tenantId, expiresAtIso) {
    // Legacy mapping (superseded by writeIamSessionToKv)
    return writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso);
}

function patchAuthSessionTenantIfMissing(env, sessionId, tenantId, userId, expiresAtIso) {
  if (!env?.DB || !sessionId || tenantId == null || String(tenantId).trim() === '') return;
  const tid = String(tenantId).trim();
  env.DB
    .prepare(
      `UPDATE auth_sessions SET tenant_id = ? WHERE id = ? AND (tenant_id IS NULL OR TRIM(COALESCE(tenant_id,'')) = '')`,
    )
    .bind(tid, sessionId)
    .run()
    .catch((e) => console.warn('[auth_sessions tenant patch]', e?.message ?? e));
  writeIamSessionToKv(env, sessionId, userId, tid, expiresAtIso).catch((e) =>
    console.warn('[KV tenant patch]', e?.message ?? e),
  );
}

export async function getAuthUser(request, env) {
  const session = await getSession(env, request);
  if (!session) return null;

  let userId = session.user_id;
  let email = session._session_user_id || session.user_id;
  const sessionTenant =
    session.tenant_id != null && String(session.tenant_id).trim() !== ''
      ? String(session.tenant_id).trim()
      : null;

  let role = 'user';
  let is_superadmin = 0;
  let usersTenantId = null;
  let resolvedEmail = null;

  if (env.DB && userId) {
    try {
      if (String(userId).startsWith('usr_')) {
        const userRow = await env.DB.prepare(`SELECT email, tenant_id FROM users WHERE id = ? LIMIT 1`).bind(userId).first();
        if (userRow) {
          resolvedEmail = userRow.email || null;
          if (userRow.tenant_id != null && String(userRow.tenant_id).trim() !== '') {
            usersTenantId = String(userRow.tenant_id).trim();
          }
          if (resolvedEmail && (!email || email === userId)) email = resolvedEmail;
        }
      } else {
        resolvedEmail = email && email !== userId ? email : userId;
      }

      const lookupEmail = resolvedEmail || String(email || userId);
      if (lookupEmail) {
        const authRow = await env.DB
          .prepare(
            `SELECT email, tenant_id, COALESCE(is_superadmin, 0) AS is_superadmin FROM auth_users
             WHERE LOWER(email) = LOWER(?) LIMIT 1`,
          )
          .bind(lookupEmail)
          .first();

        const authTenant =
          authRow?.tenant_id != null && String(authRow.tenant_id).trim() !== ''
            ? String(authRow.tenant_id).trim()
            : null;

        if (authRow && authRow.is_superadmin) {
          is_superadmin = 1;
          role = 'superadmin';
          if (authRow.email && (!email || email === userId)) email = authRow.email;
          const effectiveTenant = sessionTenant || usersTenantId || authTenant || null;
          const sid = session.session_id;
          if (sid && effectiveTenant && !sessionTenant) {
            patchAuthSessionTenantIfMissing(env, sid, effectiveTenant, userId, session.expires_at);
          }
          return { id: userId, email, tenant_id: effectiveTenant, role, is_superadmin };
        }
      }
    } catch (e) {
      console.warn('[getAuthUser Superadmin Resolve Error]', e.message);
    }
  }

  if (env.DB && userId && String(userId).startsWith('usr_') && (!email || email === userId)) {
    try {
      const u = await env.DB.prepare(`SELECT email FROM users WHERE id = ? LIMIT 1`).bind(userId).first();
      if (u && u.email) email = u.email;
    } catch (e) {
      console.warn('[getAuthUser User Lookup Error]', e.message);
    }
  }

  const lookupEmail2 = resolvedEmail || String(email || userId);
  let authTenant2 = null;
  if (env.DB && lookupEmail2) {
    try {
      const ar = await env.DB
        .prepare(`SELECT tenant_id FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1`)
        .bind(lookupEmail2)
        .first();
      if (ar?.tenant_id != null && String(ar.tenant_id).trim() !== '') {
        authTenant2 = String(ar.tenant_id).trim();
      }
    } catch (e) {
      console.warn('[getAuthUser auth tenant]', e?.message ?? e);
    }
  }
  let fromKey = null;
  if (env.DB && (!sessionTenant || !usersTenantId) && (!authTenant2)) {
    fromKey = await fetchAuthUserTenantId(env, userId);
  }

  const effectiveTenant = sessionTenant || usersTenantId || authTenant2 || fromKey || null;
  const sid = session.session_id;
  if (sid && effectiveTenant && !sessionTenant) {
    patchAuthSessionTenantIfMissing(env, sid, effectiveTenant, userId, session.expires_at);
  }

  return { id: userId, email, tenant_id: effectiveTenant, role, is_superadmin };
}

/**
 * Create D1 + KV session for a platform user id and return JSON + session cookies.
 * Used when a user completes a trusted, token-gated step (e.g. onboarding intake).
 */
export async function establishIamSession(request, env, userId, bodyObj = { ok: true }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const sessionId = crypto.randomUUID();
  const expiresTs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresTs).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const tid = await resolveTenantAtLogin(env, userId).catch(() => null);
  await env.DB
    .prepare(
      `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`,
    )
    .bind(sessionId, userId, expiresAtIso, ip, ua, tid)
    .run();
  await writeIamSessionToKv(env, sessionId, userId, tid, expiresAtIso);
  const response = new Response(JSON.stringify(bodyObj), {
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
 * True when X-Ingest-Secret matches vault/env INGEST_SECRET (MCP / trusted automation).
 */
export function isIngestSecretAuthorized(request, env) {
  const h = request.headers.get('X-Ingest-Secret');
  const ingestSecret = env.INGEST_SECRET;
  return !!(ingestSecret && h && h === ingestSecret);
}

/**
 * INTERNAL_API_SECRET via X-Internal-Secret or Authorization: Bearer (deploy hooks, notify).
 */
export function verifyInternalApiSecret(request, env) {
  const secret = env?.INTERNAL_API_SECRET;
  if (!secret || typeof secret !== 'string') return false;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = (request.headers.get('X-Internal-Secret') || '').trim();
  return bearer === secret || header === secret;
}

/**
 * Standardized JSON response helper.
 */
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status: Number(status) || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
