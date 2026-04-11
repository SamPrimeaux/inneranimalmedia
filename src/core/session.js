/**
 * Core Layer: Session Management
 * KV-primary, D1-fallback session store for IAM platform.
 * Sessions are created at login, validated on every authenticated request,
 * and destroyed at logout or expiry.
 */

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_PREFIX = 'session:';

// ─── Creation ────────────────────────────────────────────────────────────────

/**
 * Create a new session for a user and persist it to KV (+ D1 audit row).
 * Returns the session token string.
 */
export async function createSession(env, user, meta = {}) {
  if (!user?.id) throw new Error('createSession: user.id required');

  const token = generateSessionToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;

  const payload = {
    token,
    user_id: String(user.id),
    email: user.email || null,
    role: user.role || 'user',
    tenant_id: user.tenant_id || meta.tenant_id || null,
    created_at: now,
    expires_at: expiresAt,
    ip: meta.ip || null,
    user_agent: meta.user_agent || null,
  };

  // KV primary store
  if (env.SESSION_CACHE) {
    await env.SESSION_CACHE.put(
      SESSION_PREFIX + token,
      JSON.stringify(payload),
      { expirationTtl: SESSION_TTL_SECONDS }
    );
  }

  // D1 audit row (non-blocking — don't fail session creation if DB is slow)
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_sessions
         (token, user_id, email, role, tenant_id, ip, user_agent, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        token,
        payload.user_id,
        payload.email,
        payload.role,
        payload.tenant_id,
        payload.ip,
        payload.user_agent,
        new Date(now * 1000).toISOString(),
        new Date(expiresAt * 1000).toISOString()
      ).run();
    } catch (_) {
      // D1 write failure does not block session creation
    }
  }

  return token;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Resolve a session token to its payload.
 * KV-first, D1 fallback. Returns null if missing or expired.
 */
export async function getSession(env, token) {
  if (!token) return null;
  const clean = token.trim();
  if (!clean) return null;

  // KV lookup
  if (env.SESSION_CACHE) {
    try {
      const raw = await env.SESSION_CACHE.get(SESSION_PREFIX + clean);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isExpired(parsed)) {
          await destroySession(env, clean);
          return null;
        }
        return parsed;
      }
    } catch (_) {}
  }

  // D1 fallback
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT token, user_id, email, role, tenant_id, ip, user_agent, created_at, expires_at
         FROM user_sessions WHERE token = ? LIMIT 1`
      ).bind(clean).first();

      if (!row) return null;

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = Math.floor(new Date(row.expires_at).getTime() / 1000);
      if (expiresAt < now) {
        await destroySession(env, clean);
        return null;
      }

      const payload = {
        token: row.token,
        user_id: row.user_id,
        email: row.email,
        role: row.role,
        tenant_id: row.tenant_id,
        ip: row.ip,
        user_agent: row.user_agent,
        created_at: Math.floor(new Date(row.created_at).getTime() / 1000),
        expires_at: expiresAt,
      };

      // Rehydrate KV from D1 hit
      if (env.SESSION_CACHE) {
        const remaining = expiresAt - now;
        if (remaining > 0) {
          await env.SESSION_CACHE.put(
            SESSION_PREFIX + clean,
            JSON.stringify(payload),
            { expirationTtl: remaining }
          ).catch(() => {});
        }
      }

      return payload;
    } catch (_) {}
  }

  return null;
}

/**
 * Extract bearer token from Authorization header or __session cookie.
 */
export function extractToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]).trim();

  return null;
}

/**
 * Resolve a full session from a request (token extraction + validation).
 * Returns the session payload or null.
 */
export async function resolveSession(env, request) {
  const token = extractToken(request);
  if (!token) return null;
  return getSession(env, token);
}

// ─── Destruction ─────────────────────────────────────────────────────────────

/**
 * Invalidate a session token from KV and D1.
 */
export async function destroySession(env, token) {
  if (!token) return;
  const clean = token.trim();

  if (env.SESSION_CACHE) {
    await env.SESSION_CACHE.delete(SESSION_PREFIX + clean).catch(() => {});
  }

  if (env.DB) {
    await env.DB.prepare(
      `DELETE FROM user_sessions WHERE token = ?`
    ).bind(clean).run().catch(() => {});
  }
}

/**
 * Invalidate all sessions for a given user_id.
 * Used on password change, account lock, or forced logout.
 */
export async function destroyAllUserSessions(env, userId) {
  if (!userId) return;

  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT token FROM user_sessions WHERE user_id = ?`
      ).bind(String(userId)).all();

      if (env.SESSION_CACHE && results?.length) {
        await Promise.allSettled(
          results.map(r => env.SESSION_CACHE.delete(SESSION_PREFIX + r.token))
        );
      }

      await env.DB.prepare(
        `DELETE FROM user_sessions WHERE user_id = ?`
      ).bind(String(userId)).run();
    } catch (_) {}
  }
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

/**
 * Slide the expiry window on an active session (extend TTL on activity).
 * Only slides if session has less than 2 days remaining.
 */
export async function refreshSession(env, token) {
  const session = await getSession(env, token);
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  const remaining = session.expires_at - now;
  if (remaining > 60 * 60 * 48) return session; // still plenty of time, skip

  session.expires_at = now + SESSION_TTL_SECONDS;

  if (env.SESSION_CACHE) {
    await env.SESSION_CACHE.put(
      SESSION_PREFIX + token,
      JSON.stringify(session),
      { expirationTtl: SESSION_TTL_SECONDS }
    ).catch(() => {});
  }

  if (env.DB) {
    await env.DB.prepare(
      `UPDATE user_sessions SET expires_at = ? WHERE token = ?`
    ).bind(new Date(session.expires_at * 1000).toISOString(), token).run().catch(() => {});
  }

  return session;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isExpired(session) {
  if (!session?.expires_at) return true;
  return session.expires_at < Math.floor(Date.now() / 1000);
}
