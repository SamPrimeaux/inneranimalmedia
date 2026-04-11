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
  if (authUser.id === 'sam_primeaux') return 'sam_primeaux';
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
  if (authUser.id === 'sam_primeaux') return true;
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

/**
 * Legacy Tenant Mapping
 */
export function tenantIdFromEnv(env) {
  if (!env || env.TENANT_ID == null) return null;
  const s = String(env.TENANT_ID).trim();
  return s || null;
}

/** Prefer session/routing tenant, then env TENANT_ID. */
export function resolveTelemetryTenantId(env, explicitTenantId) {
  if (explicitTenantId != null && String(explicitTenantId).trim() !== '') {
    return String(explicitTenantId).trim();
  }
  return tenantIdFromEnv(env);
}

export function resolveTenantIdForWorker(session, env) {
  if (session && session.tenant_id) return session.tenant_id;
  return tenantIdFromEnv(env);
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
        if (data) return JSON.parse(data);
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
          // Success: Repopulate KV so cache is warm for next request
          const payload = { 
            v: 1, 
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
  const payload = { v: 1, user_id: userId, tenant_id: tid, expires_at: expiresAtIso || null };
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
  return null;
}

export async function resolveTenantAtLogin(env, userId) {
  const fromUser = await fetchAuthUserTenantId(env, userId);
  if (fromUser) return fromUser;
  return resolveTenantIdForWorker(null, env);
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

export async function getAuthUser(request, env) {
  const session = await getSession(env, request);
  if (!session) return null;

  let userId = session.user_id;
  let email = session._session_user_id || session.user_id;
  const tenantId = resolveTenantIdForWorker(session, env);

  // Resolve role and superadmin status via the correct join chain:
  //   auth_sessions.user_id ('usr_*')
  //     → users WHERE id = 'usr_*'         → email
  //     → auth_users WHERE email = ?        → is_superadmin
  //
  // NOTE: auth_users uses 'au_*' IDs — never look up auth_users by the usr_* user_id directly.
  // NOTE: Do NOT use auth_users.tenant_id for resolution (au_sam_inneranimalmedia has null).
  let role = 'user';
  let is_superadmin = 0;

  if (env.DB && userId) {
    try {
      // Step 1: Resolve canonical email from users table (works for both usr_* and email-keyed sessions)
      let resolvedEmail = null;
      if (userId.startsWith('usr_')) {
        const userRow = await env.DB.prepare(
          `SELECT email, tenant_id FROM users WHERE id = ? LIMIT 1`
        ).bind(userId).first();
        if (userRow) {
          resolvedEmail = userRow.email || null;
          if (resolvedEmail && (!email || email === userId)) email = resolvedEmail;
          // Prefer users.tenant_id over session tenant_id (auth_users.tenant_id may be null)
          if (userRow.tenant_id && !tenantId) {
            // Note: tenantId is const from above; rebuild below if needed
          }
        }
      } else {
        // Session user_id is already an email or au_* format — use directly
        resolvedEmail = email && email !== userId ? email : userId;
      }

      // Step 2: Look up auth_users by email to get is_superadmin
      const lookupEmail = resolvedEmail || String(email || userId);
      if (lookupEmail) {
        const authRow = await env.DB.prepare(
          `SELECT email, COALESCE(is_superadmin, 0) AS is_superadmin FROM auth_users
           WHERE LOWER(email) = LOWER(?) LIMIT 1`
        ).bind(lookupEmail).first();

        if (authRow && authRow.is_superadmin) {
          is_superadmin = 1;
          role = 'superadmin';
          if (authRow.email && (!email || email === userId)) email = authRow.email;
          // Superadmins bypass all workspace membership checks — universal access
          return { id: userId, email, tenant_id: tenantId, role, is_superadmin };
        }
      }
    } catch (e) {
      console.warn('[getAuthUser Superadmin Resolve Error]', e.message);
    }
  }

  // Non-superadmin: resolve canonical email from the 'users' table for usr_-style IDs
  if (env.DB && userId && userId.startsWith('usr_') && (!email || email === userId)) {
    try {
      const u = await env.DB.prepare(
        `SELECT email FROM users WHERE id = ? LIMIT 1`
      ).bind(userId).first();
      if (u && u.email) email = u.email;
    } catch (e) {
      console.warn('[getAuthUser User Lookup Error]', e.message);
    }
  }

  return { id: userId, email, tenant_id: tenantId, role, is_superadmin };
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
 * Standardized JSON response helper.
 */
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status: Number(status) || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
