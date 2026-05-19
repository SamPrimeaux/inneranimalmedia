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

/** Short-lived sessions minted for automation (POST /api/auth/agent-session/mint). */
export const MIN_AGENT_SESSION_TTL_SECONDS = 60;
export const MAX_AGENT_SESSION_TTL_SECONDS = 86400;
export const DEFAULT_AGENT_SESSION_TTL_SECONDS = 900;

/** Canonical browser routes (never send users to legacy `/login` or `/signup`). */
export const AUTH_LOGIN_PATH = '/auth/login';
export const AUTH_SIGNUP_PATH = '/auth/signup';
export const DASHBOARD_AFTER_LOGIN_PATH = '/dashboard/overview';

/**
 * Same-origin relative paths only. Rewrites deprecated `/login` and `/signup`.
 * Rejects scheme-relative `//`, absolute URLs, and paths containing `:`.
 */
export function sanitizeBrowserNextPath(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(s) || s.includes('://')) return null;

  let pathname = s;
  let search = '';
  const q = s.indexOf('?');
  if (q !== -1) {
    pathname = s.slice(0, q);
    search = s.slice(q);
  }
  const lower = pathname.toLowerCase();
  if (lower === '/login' || lower === '/auth/signin') pathname = AUTH_LOGIN_PATH;
  else if (lower === '/signup' || lower === '/auth/register') pathname = AUTH_SIGNUP_PATH;

  return pathname + search;
}

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
 * Loads merged feature flags (global defaults + per-user overrides). Cached ~60s under `ff:{userId}`.
 * Uses agentsam_feature_flag.enabled_globally and agentsam_user_feature_override — schema-driven columns only.
 * @returns {Promise<Record<string, boolean>>}
 */
export async function loadFeatureFlags(env, userId, tenantId) {
  void tenantId;
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid || !env?.DB) return {};
  const kv = env.KV || env.SESSION_CACHE;
  const cacheKey = `ff:${uid}`;
  try {
    if (kv?.get) {
      const raw = await kv.get(cacheKey);
      if (raw) {
        const j = JSON.parse(raw);
        if (j && typeof j === 'object' && j.flags && typeof j.ts === 'number' && Date.now() - j.ts < 60000) {
          return j.flags && typeof j.flags === 'object' ? j.flags : {};
        }
      }
    }
  } catch {
    /* cold cache */
  }
  const out = {};
  try {
    const gRes = await env.DB.prepare(
      `SELECT flag_key FROM agentsam_feature_flag WHERE enabled_globally = 1`,
    ).all();
    for (const r of gRes.results || []) {
      if (r?.flag_key != null && String(r.flag_key).trim() !== '') {
        out[String(r.flag_key)] = true;
      }
    }
    const oRes = await env.DB.prepare(
      `SELECT flag_key, enabled FROM agentsam_user_feature_override WHERE user_id = ?`,
    )
      .bind(uid)
      .all();
    for (const r of oRes.results || []) {
      if (r?.flag_key != null && String(r.flag_key).trim() !== '') {
        out[String(r.flag_key)] = Number(r.enabled) === 1;
      }
    }
  } catch (e) {
    console.warn('[loadFeatureFlags]', e?.message ?? e);
    return {};
  }
  try {
    if (kv?.put) {
      await kv.put(cacheKey, JSON.stringify({ flags: out, ts: Date.now() }), { expirationTtl: 120 });
    }
  } catch {
    /* non-fatal */
  }
  return out;
}

/** Bust per-user feature flag KV cache after override writes. */
export async function invalidateFeatureFlagsCache(env, userId) {
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid) return;
  const kv = env.KV || env.SESSION_CACHE;
  if (!kv?.delete) return;
  try {
    await kv.delete(`ff:${uid}`);
  } catch {
    /* non-fatal */
  }
}

async function attachFeatureFlagsToSession(env, session) {
  if (!session?.user_id) return session;
  try {
    const feature_flags = await loadFeatureFlags(env, session.user_id, session.tenant_id);
    return { ...session, feature_flags };
  } catch {
    return { ...session, feature_flags: {} };
  }
}

/**
 * Outbound fetch gate: when allowlist rows exist for (user, workspace), hostname must match.
 */
export async function assertFetchDomainAllowed(env, userId, workspaceId, targetUrl) {
  const uid = userId != null ? String(userId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!uid || !ws || !env?.DB || !targetUrl) return { ok: true };
  let hostname = '';
  try {
    hostname = new URL(String(targetUrl)).hostname.toLowerCase();
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  try {
    const { results } = await env.DB.prepare(
      `SELECT host FROM agentsam_fetch_domain_allowlist WHERE user_id = ? AND workspace_id = ?`,
    )
      .bind(uid, ws)
      .all();
    const rows = results || [];
    if (!rows.length) return { ok: true };
    const ok = rows.some((r) => String(r.host || '').toLowerCase() === hostname);
    if (!ok) return { ok: false, error: 'Domain not in your fetch allowlist' };
  } catch (e) {
    console.warn('[assertFetchDomainAllowed]', e?.message ?? e);
    return { ok: true };
  }
  return { ok: true };
}

function pathMatchesIgnorePattern(filePath, patternRaw) {
  const pathStr = String(filePath || '');
  const pattern = String(patternRaw || '');
  if (!pattern) return false;
  if (pattern.includes('*') || pattern.includes('?')) {
    try {
      const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp(`^${esc}$`).test(pathStr);
    } catch {
      return false;
    }
  }
  return pathStr === pattern || pathStr.includes(pattern) || pathStr.endsWith(pattern);
}

/**
 * agentsam_ignore_pattern: ordered rules; negation clears a prior deny.
 */
export async function assertPathAllowedByIgnorePatterns(env, userId, workspaceId, filePath) {
  const uid = userId != null ? String(userId).trim() : '';
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (!uid || !ws || !env?.DB) return { ok: true };
  try {
    const { results } = await env.DB.prepare(
      `SELECT pattern, is_negation FROM agentsam_ignore_pattern
       WHERE user_id = ? AND workspace_id = ?
       ORDER BY order_index ASC`,
    )
      .bind(uid, ws)
      .all();
    const rows = results || [];
    if (!rows.length) return { ok: true };
    let denied = false;
    for (const r of rows) {
      if (!pathMatchesIgnorePattern(filePath, r.pattern)) continue;
      if (Number(r.is_negation) === 1) denied = false;
      else denied = true;
    }
    if (denied) return { ok: false, error: 'Path blocked by ignore patterns' };
  } catch (e) {
    console.warn('[assertPathAllowedByIgnorePatterns]', e?.message ?? e);
    return { ok: true };
  }
  return { ok: true };
}

/**
 * When the user has trusted-origin rows in D1, navigation targets must match one of them (open if none).
 */
export async function assertBrowserOriginTrusted(env, opts) {
  const { userId, workspaceId, origin } = opts || {};
  void workspaceId;
  if (!userId || !origin || !env?.DB) return;

  let parsedOrigin;
  try {
    const raw = String(origin);
    parsedOrigin = new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin;
  } catch {
    throw new Error('Browser origin blocked: invalid URL');
  }

  const rows = await env.DB.prepare(
    `
      SELECT origin, trust_scope
      FROM agentsam_browser_trusted_origin
      WHERE user_id = ?
      LIMIT 100
    `,
  )
    .bind(userId)
    .all()
    .catch(() => ({ results: [] }));

  const trusted = rows.results || [];
  if (trusted.length === 0) return;

  const match = trusted.find((r) => String(r.origin || '') === parsedOrigin);

  if (!match) {
    throw new Error(
      `Browser origin not trusted: ${parsedOrigin}. ` +
        'Add it to your trusted origins in settings.',
    );
  }
}

/** PRAGMA cache for auth_sessions column drift (e.g. supabase_user_id). */
let AUTH_SESSIONS_COLUMNS_CACHE = null;

async function authSessionsColumns(env) {
  if (AUTH_SESSIONS_COLUMNS_CACHE) return AUTH_SESSIONS_COLUMNS_CACHE;
  if (!env?.DB) {
    AUTH_SESSIONS_COLUMNS_CACHE = new Set();
    return AUTH_SESSIONS_COLUMNS_CACHE;
  }
  try {
    const out = await env.DB.prepare('PRAGMA table_info(auth_sessions)').all();
    const cols = new Set();
    for (const row of out.results || []) cols.add(String(row.name || '').toLowerCase());
    AUTH_SESSIONS_COLUMNS_CACHE = cols;
  } catch {
    AUTH_SESSIONS_COLUMNS_CACHE = new Set();
  }
  return AUTH_SESSIONS_COLUMNS_CACHE;
}

function trimSessionField(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Safe KV payload for iam_sess_v1:* (cache only; D1 auth_sessions is canonical).
 * @param {string} sessionId
 * @param {object} fields
 */
function buildSessionKvPayload(sessionId, fields = {}) {
  return {
    v: 1,
    session_id: sessionId,
    user_id: trimSessionField(fields.userId ?? fields.user_id) ?? null,
    tenant_id: trimSessionField(fields.tenantId ?? fields.tenant_id) ?? null,
    workspace_id: trimSessionField(fields.workspaceId ?? fields.workspace_id) ?? null,
    person_uuid: trimSessionField(fields.personUuid ?? fields.person_uuid) ?? null,
    supabase_user_id: trimSessionField(fields.supabaseUserId ?? fields.supabase_user_id) ?? null,
    email: trimSessionField(fields.email) ?? null,
    provider: trimSessionField(fields.provider) ?? null,
    display_name: trimSessionField(fields.displayName ?? fields.display_name) ?? null,
    avatar_url: trimSessionField(fields.avatarUrl ?? fields.avatar_url) ?? null,
    provider_subject: trimSessionField(fields.providerSubject ?? fields.provider_subject) ?? null,
    work_session_id: trimSessionField(fields.workSessionId ?? fields.work_session_id) ?? null,
    last_active_at:
      fields.lastActiveAt ?? fields.last_active_at ?? fields.lastActiveAtMs ?? null,
    expires_at: fields.expiresAt ?? fields.expires_at ?? fields.expiresAtIso ?? null,
  };
}

/** @param {object} row D1 auth_sessions row */
function authSessionRowToKvPayload(row) {
  return buildSessionKvPayload(row.id, {
    userId: row.user_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    personUuid: row.person_uuid,
    supabaseUserId: row.supabase_user_id,
    email: row.email,
    provider: row.provider,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    providerSubject: row.provider_subject,
    workSessionId: row.work_session_id,
    lastActiveAt: row.last_active_at,
    expiresAt: row.expires_at,
  });
}

/** Session + KV fields derived from auth_users at login. */
function sessionFieldsFromAuthUser(userRow, sessionProvider, opts = {}) {
  const tenantId =
    trimSessionField(userRow?.active_tenant_id) || trimSessionField(userRow?.tenant_id) || null;
  const workspaceId =
    trimSessionField(opts.workspaceId) ||
    trimSessionField(userRow?.active_workspace_id) ||
    trimSessionField(userRow?.default_workspace_id) ||
    null;
  return {
    tenantId,
    personUuid: userRow?.person_uuid ?? null,
    supabaseUserId: userRow?.supabase_user_id ?? null,
    email: userRow?.email,
    provider: sessionProvider || 'email',
    providerSubject: opts.providerSubject ?? null,
    displayName: userRow?.display_name ?? userRow?.name ?? 'User',
    avatarUrl: userRow?.avatar_url ?? null,
    workspaceId,
  };
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
          return attachFeatureFlagsToSession(env, { ...parsed, session_id: sessionId });
        }
      } catch (e) { }
    }
  }

  if (env.DB) {
    for (const sessionId of sessionCandidates) {
      try {
        const row = await env.DB.prepare(
          `SELECT
             id, user_id, tenant_id, workspace_id, person_uuid, supabase_user_id,
             email, provider, display_name, avatar_url, provider_subject,
             work_session_id, last_active_at, expires_at
           FROM auth_sessions
           WHERE id = ?
             AND datetime(expires_at) > datetime('now')
             AND (revoked_at IS NULL OR TRIM(COALESCE(revoked_at, '')) = '')
           LIMIT 1`,
        )
          .bind(sessionId)
          .first();

        if (row) {
          const payload = authSessionRowToKvPayload(row);
          if (env.SESSION_CACHE) {
            await env.SESSION_CACHE.put(
              IAM_KV_SESSION_KEY_PREFIX + sessionId,
              JSON.stringify(payload),
              { expirationTtl: 3600 },
            );
          }
          return attachFeatureFlagsToSession(env, payload);
        }
      } catch (e) { }
    }
  }
  return null;
}

/**
 * @param {*} env
 * @param {string} sessionId
 * @param {string} userId auth_users.id
 * @param {string|null} tenantId
 * @param {string|null} expiresAtIso
 * @param {object} [extra] Optional session context (workspace_id, person_uuid, email, …)
 */
export async function writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso, extra = {}) {
  if (!env.SESSION_CACHE || !sessionId || !userId) return;
  const payload = buildSessionKvPayload(sessionId, {
    userId,
    tenantId,
    expiresAtIso,
    ...(extra && typeof extra === 'object' ? extra : {}),
  });
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
          user_id:       row.id,          // alias for tool / MCP scope resolution
          person_uuid:   row.person_uuid,
          email:         row.email,
          name:          row.name,
          display_name:  row.display_name ?? row.name ?? null,
          avatar_url:    row.avatar_url ?? null,
          tenant_id:     row.tenant_id,
          active_tenant_id: row.active_tenant_id ?? null,
          active_workspace_id: row.active_workspace_id ?? null,
          supabase_user_id: row.supabase_user_id ?? null,
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
    user_id: authId,
    email: session.email || session._session_user_id || null,
    tenant_id: session.tenant_id || null,
    is_superadmin: 0,
    session_id: session.session_id,
    expires_at: session.expires_at ? (typeof session.expires_at === 'number' ? session.expires_at : new Date(session.expires_at).getTime()) : null,
  };
}

/**
 * Insert canonical browser session row (auth_sessions only).
 * @param {*} env
 * @param {object} row
 */
async function insertAuthSessionRow(env, row) {
  const email = String(row.email || '').trim();
  if (!email) throw new Error('auth_sessions.email required');

  const cols = await authSessionsColumns(env);
  const colNames = [
    'id',
    'user_id',
    'tenant_id',
    'person_uuid',
    'email',
    'provider',
    'provider_subject',
    'display_name',
    'avatar_url',
    'workspace_id',
    'expires_at',
    'created_at',
    'ip_address',
    'user_agent',
    'last_active_at',
  ];
  const valueExprs = [
    '?',
    '?',
    '?',
    '?',
    '?',
    '?',
    '?',
    '?',
    '?',
    '?',
    '?',
    "datetime('now')",
    '?',
    '?',
    '?',
  ];
  const binds = [
    row.sessionId,
    row.userId,
    row.tenantId ?? null,
    row.personUuid ?? null,
    email,
    row.provider || 'email',
    row.providerSubject ?? null,
    row.displayName ?? null,
    row.avatarUrl ?? null,
    row.workspaceId ?? null,
    row.expiresAtIso,
    row.ip || '',
    row.ua || '',
    row.lastActiveAtMs ?? Date.now(),
  ];

  if (cols.has('supabase_user_id')) {
    colNames.splice(4, 0, 'supabase_user_id');
    valueExprs.splice(4, 0, '?');
    binds.splice(4, 0, row.supabaseUserId ?? null);
  }

  await env.DB.prepare(
    `INSERT INTO auth_sessions (${colNames.join(', ')}) VALUES (${valueExprs.join(', ')})`,
  )
    .bind(...binds)
    .run();
}

export async function establishIamSession(request, env, userId, bodyObj = { ok: true }, sessionProvider = 'iam') {
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);
  const sessionId = crypto.randomUUID();
  const expiresTs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresTs).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';

  let userRow = null;
  try {
    userRow = await env.DB.prepare(`SELECT * FROM auth_users WHERE id = ? LIMIT 1`).bind(userId).first();
  } catch (_) {}

  if (!userRow?.email) {
    return jsonResponse({ error: 'User not found' }, 404);
  }

  const sessionFields = sessionFieldsFromAuthUser(userRow, sessionProvider);
  await insertAuthSessionRow(env, {
    sessionId,
    userId,
    tenantId: sessionFields.tenantId,
    personUuid: sessionFields.personUuid,
    supabaseUserId: sessionFields.supabaseUserId,
    email: sessionFields.email,
    provider: sessionFields.provider,
    providerSubject: sessionFields.providerSubject,
    displayName: sessionFields.displayName,
    avatarUrl: sessionFields.avatarUrl,
    workspaceId: sessionFields.workspaceId,
    ip,
    ua,
    expiresAtIso,
  });

  await writeIamSessionToKv(env, sessionId, userId, sessionFields.tenantId, expiresAtIso, {
    workspaceId: sessionFields.workspaceId,
    personUuid: sessionFields.personUuid,
    supabaseUserId: sessionFields.supabaseUserId,
    email: sessionFields.email,
    provider: sessionFields.provider,
    displayName: sessionFields.displayName,
    avatarUrl: sessionFields.avatarUrl,
    providerSubject: sessionFields.providerSubject,
    lastActiveAt: Date.now(),
  });

  const response = jsonResponse(bodyObj);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
  return response;
}

/**
 * Creates auth_sessions + KV (email / OAuth / signup login).
 * @returns {Promise<string>} session id
 */
export async function createLoginSession(request, env, userId, sessionProvider = 'email', opts = {}) {
  const sessionId = crypto.randomUUID();
  let expiresTs;
  if (opts != null && opts.ttlSeconds != null) {
    const raw = Number(opts.ttlSeconds);
    const sec = Number.isFinite(raw)
      ? Math.min(
          MAX_AGENT_SESSION_TTL_SECONDS,
          Math.max(MIN_AGENT_SESSION_TTL_SECONDS, raw),
        )
      : DEFAULT_AGENT_SESSION_TTL_SECONDS;
    expiresTs = Date.now() + sec * 1000;
  } else {
    expiresTs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  }
  const expiresAtIso = new Date(expiresTs).toISOString();

  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';

  let userRow = null;
  try {
    userRow = await env.DB.prepare(`SELECT * FROM auth_users WHERE id = ? LIMIT 1`).bind(userId).first();
  } catch (e) {
    console.warn('[createLoginSession] auth_users lookup failed', e.message);
  }

  if (!userRow?.email) {
    throw new Error('User not found in auth_users during login finalization');
  }

  const sessionFields = sessionFieldsFromAuthUser(userRow, sessionProvider, {
    workspaceId: opts.workspaceId,
    providerSubject: opts.providerSubject,
  });
  await insertAuthSessionRow(env, {
    sessionId,
    userId,
    tenantId: sessionFields.tenantId,
    personUuid: sessionFields.personUuid,
    supabaseUserId: sessionFields.supabaseUserId,
    email: sessionFields.email,
    provider: sessionFields.provider,
    providerSubject: sessionFields.providerSubject,
    displayName: sessionFields.displayName,
    avatarUrl: sessionFields.avatarUrl,
    workspaceId: sessionFields.workspaceId,
    ip,
    ua,
    expiresAtIso,
  });

  await writeIamSessionToKv(env, sessionId, userId, sessionFields.tenantId, expiresAtIso, {
    workspaceId: sessionFields.workspaceId,
    personUuid: sessionFields.personUuid,
    supabaseUserId: sessionFields.supabaseUserId,
    email: sessionFields.email,
    provider: sessionFields.provider,
    displayName: sessionFields.displayName,
    avatarUrl: sessionFields.avatarUrl,
    providerSubject: sessionFields.providerSubject,
    lastActiveAt: Date.now(),
  });

  return sessionId;
}

/**
 * Revoke a browser session (soft-delete). Clears KV cache for that session id.
 */
export async function revokeAuthSession(env, sessionId, reason = 'logout') {
  const id = String(sessionId || '').trim();
  if (!id || !env?.DB) return;
  try {
    await env.DB.prepare(
      `UPDATE auth_sessions
       SET revoked_at = datetime('now'), revoke_reason = ?
       WHERE id = ? AND (revoked_at IS NULL OR TRIM(COALESCE(revoked_at, '')) = '')`,
    )
      .bind(reason, id)
      .run();
  } catch (e) {
    console.warn('[revokeAuthSession]', e?.message ?? e);
  }
  if (env.SESSION_CACHE) {
    try {
      await env.SESSION_CACHE.delete(IAM_KV_SESSION_KEY_PREFIX + id);
    } catch (_) {}
  }
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

/**
 * Automation-only: mint short-lived browser sessions (see POST /api/auth/agent-session/mint).
 * Use Worker secret AGENT_SESSION_MINT_SECRET — narrower blast radius than INTERNAL_API_SECRET.
 */
export function verifyAgentSessionMintSecret(request, env) {
  const secret = env?.AGENT_SESSION_MINT_SECRET;
  if (!secret || String(secret).trim() === '') return false;
  const s = String(secret).trim();
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = (request.headers.get('X-Agent-Session-Mint-Secret') || '').trim();
  return bearer === s || header === s;
}

function jsonStringifySafe(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export function jsonResponse(body, status = 200) {
  return new Response(jsonStringifySafe(body), {
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
