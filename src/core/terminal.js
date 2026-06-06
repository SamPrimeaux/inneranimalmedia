/**
 * Core Layer: Terminal Execution
 * Handles PTY workshops, WebSocket runs, and workspace path resolution.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, fetchAuthUserTenantId } from './auth';
import {
  resolveTerminalWorkspaceId,
  WORKSPACE_CONTEXT_MISSING,
  WORKSPACE_ROOT_CONTEXT_MISSING,
} from './bootstrap.js';
import { resolvePtyTenantIdForUser, buildPtySessionWorkingDir } from './pty-workspace-paths.js';
import { notifySam } from './notifications';
import { resolveUserPtyToken, USER_PTY_TOKEN_SENTINEL } from './user-secrets.js';

/**
 * Deterministic SHA-256 for `terminal_sessions.auth_token_hash` (never store raw session secrets in D1).
 * Pepper order: TERMINAL_SESSION_PEPPER → PTY_AUTH_TOKEN → INTERNAL_API_SECRET → dev fallback.
 * @param {Record<string, unknown>} env
 * @param {string} sessionId
 * @returns {Promise<string>} 64-char hex
 */
export async function computeTerminalSessionAuthTokenHash(env, sessionId) {
  const sid = String(sessionId || '').trim();
  const pepper = String(
    env?.TERMINAL_SESSION_PEPPER ||
      env?.PTY_AUTH_TOKEN ||
      env?.INTERNAL_API_SECRET ||
      'iam-terminal-session-pepper',
  ).trim();
  const payload = `${sid}:${pepper}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const VALID_TARGET_TYPES = ['platform_vm', 'user_hosted_tunnel', 'ssh_target', 'sandbox'];

export const VALID_TERMINAL_PLATFORMS = ['macos', 'windows', 'linux'];

/** @type {Record<string, string[]>} */
export const VALID_TERMINAL_SHELLS = {
  macos: ['/bin/zsh', '/bin/bash', '/bin/sh'],
  windows: ['powershell', 'pwsh'],
  linux: ['/bin/bash', '/bin/zsh', '/bin/sh'],
};

/**
 * @param {string} platform
 * @param {string} shell
 * @returns {{ platform: string, shell: string }}
 */
export function normalizeProvisionPlatformShell(platform, shell) {
  const pRaw = String(platform || '').trim().toLowerCase();
  const platformNorm = VALID_TERMINAL_PLATFORMS.includes(pRaw) ? pRaw : 'linux';
  const allowed = VALID_TERMINAL_SHELLS[platformNorm] || VALID_TERMINAL_SHELLS.linux;
  const sRaw = String(shell || '').trim();
  const shellNorm = allowed.includes(sRaw) ? sRaw : allowed[0];
  return { platform: platformNorm, shell: shellNorm };
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} userId
 * @param {string} workspaceId
 */
/**
 * Load auth_users row for PTY backend register (Bearer user token path).
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} userId
 */
export async function loadAuthUserRowForPty(db, userId) {
  if (!db || !userId) return null;
  try {
    return await db
      .prepare(`SELECT id, email, person_uuid, tenant_id, active_tenant_id FROM auth_users WHERE id = ? LIMIT 1`)
      .bind(String(userId).trim())
      .first();
  } catch (_) {
    return null;
  }
}

/**
 * Validate iam-pty Bearer against platform or per-user encrypted token.
 * @param {Record<string, unknown>} env
 * @param {string} token
 * @param {string} [userId]
 * @param {string} [workspaceId]
 */
export async function ptyBackendBearerValid(env, token, userId = '', workspaceId = '') {
  const t = String(token || '').trim();
  if (!t) return false;
  if (t === String(env?.PTY_AUTH_TOKEN || '').trim()) return true;
  if (t === String(env?.TERMINAL_SECRET || '').trim()) return true;
  const uid = String(userId || '').trim();
  const wid = String(workspaceId || '').trim();
  if (uid) {
    const userTok = await resolveUserPtyToken(env, uid, wid);
    if (userTok && t === userTok) return true;
  }
  return false;
}

export async function getUserHostedTunnelConnection(db, userId, workspaceId) {
  if (!db || !userId || !workspaceId) return null;
  try {
    return await db
      .prepare(
        `SELECT id, workspace_id, tenant_id, user_id, name, ws_url, target_type,
                platform, shell, is_active, is_default, cwd_strategy, updated_at
         FROM terminal_connections
         WHERE user_id = ? AND workspace_id = ? AND target_type = 'user_hosted_tunnel'
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .bind(String(userId).trim(), String(workspaceId).trim())
      .first();
  } catch (_) {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} env
 * @param {import('./auth.js').AuthUser} authUser
 * @param {string} workspaceId
 * @param {{ platform?: string, shell?: string }} body
 */
export async function provisionUserHostedTunnelConnection(env, authUser, workspaceId, body = {}) {
  if (!env?.DB || !authUser?.id || !workspaceId) {
    return { ok: false, error: 'missing_context', status: 400 };
  }
  const userId = String(authUser.id).trim();
  const wid = String(workspaceId).trim();
  const canPty = await userCanRunPtyFromPolicy(env, userId, wid);
  if (!canPty) return { ok: false, error: 'terminal_not_enabled', status: 403 };

  const tenantId = await resolvePtyTenantIdForUser(env, authUser, userId);
  if (!tenantId) return { ok: false, error: 'tenant_missing', status: 403 };

  const { platform, shell } = normalizeProvisionPlatformShell(body.platform, body.shell);

  const existing = await getUserHostedTunnelConnection(env.DB, userId, wid);
  if (existing?.id) {
    return {
      ok: true,
      connection: {
        id: String(existing.id),
        platform: existing.platform ?? platform,
        shell: existing.shell ?? shell,
        is_active: Number(existing.is_active) === 1,
        ws_url_present: !!(existing.ws_url && String(existing.ws_url).trim()),
      },
      created: false,
    };
  }

  const connId = `conn_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO terminal_connections
         (id, workspace_id, tenant_id, user_id, name, type, connection_type,
          ws_url, target_type, cwd_strategy, platform, shell, is_default, is_active,
          self_service_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Local Terminal', 'pty', 'pty_tunnel',
          '', 'user_hosted_tunnel', 'host_default', ?, ?, 0, 0, 1, ?, ?)`,
    )
      .bind(connId, wid, tenantId, userId, platform, shell, now, now)
      .run();
  } catch (e) {
    return { ok: false, error: 'provision_failed', detail: e?.message || String(e), status: 500 };
  }

  const row = await getUserHostedTunnelConnection(env.DB, userId, wid);
  if (!row?.id) return { ok: false, error: 'provision_failed', status: 500 };

  return {
    ok: true,
    created: true,
    connection: {
      id: String(row.id),
      platform: row.platform ?? platform,
      shell: row.shell ?? shell,
      is_active: Number(row.is_active) === 1,
      ws_url_present: !!(row.ws_url && String(row.ws_url).trim()),
    },
  };
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeUserHostedTunnelWsUrl(raw) {
  let value = String(raw || '').trim();
  if (!value) return null;
  if (value.startsWith('https://')) value = `wss://${value.slice(8)}`;
  else if (value.startsWith('http://')) value = `ws://${value.slice(7)}`;
  else if (!value.startsWith('wss://') && !value.startsWith('ws://')) value = `wss://${value.replace(/^\/+/, '')}`;
  try {
    const u = new URL(value.split('?')[0]);
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return null;
    if (!u.hostname) return null;
    return value.split('?')[0];
  } catch (_) {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} env
 * @param {import('./auth.js').AuthUser} authUser
 * @param {string} workspaceId
 * @param {{ connection_id?: string, ws_url?: string }} body
 */
export async function activateUserHostedTunnelConnection(env, authUser, workspaceId, body = {}) {
  if (!env?.DB || !authUser?.id || !workspaceId) {
    return { ok: false, error: 'missing_context', status: 400 };
  }
  const userId = String(authUser.id).trim();
  const wid = String(workspaceId).trim();
  const canPty = await userCanRunPtyFromPolicy(env, userId, wid);
  if (!canPty) return { ok: false, error: 'terminal_not_enabled', status: 403 };

  const wsUrl = normalizeUserHostedTunnelWsUrl(body.ws_url);
  if (!wsUrl) return { ok: false, error: 'invalid_ws_url', status: 400 };

  const connId = String(body.connection_id || '').trim();
  let row = null;
  if (connId) {
    row = await env.DB.prepare(
      `SELECT id, user_id, workspace_id, target_type FROM terminal_connections WHERE id = ? LIMIT 1`,
    )
      .bind(connId)
      .first();
    if (!row || String(row.user_id) !== userId || String(row.workspace_id) !== wid) {
      return { ok: false, error: 'connection_forbidden', status: 403 };
    }
    if (String(row.target_type) !== 'user_hosted_tunnel') {
      return { ok: false, error: 'invalid_target_type', status: 400 };
    }
  } else {
    row = await getUserHostedTunnelConnection(env.DB, userId, wid);
    if (!row?.id) return { ok: false, error: 'connection_missing', status: 404 };
  }

  const id = String(row.id);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE terminal_connections
     SET ws_url = ?, is_active = 1, updated_at = ?
     WHERE id = ? AND user_id = ? AND workspace_id = ?`,
  )
    .bind(wsUrl, now, id, userId, wid)
    .run();

  return {
    ok: true,
    connection: {
      id,
      ws_url_present: true,
      is_active: true,
    },
  };
}

/**
 * @param {Record<string, unknown>} env
 * @param {string} sessionId
 * @param {string} userId
 */
export async function closeTerminalSessionRecord(env, sessionId, userId) {
  if (!env?.DB || !sessionId || !userId) return false;
  try {
    await env.DB.prepare(
      `UPDATE terminal_sessions
       SET status = 'closed', closed_at = unixepoch(), updated_at = unixepoch()
       WHERE id = ? AND user_id = ? AND status != 'closed'`,
    )
      .bind(String(sessionId).trim(), String(userId).trim())
      .run();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Delete closed / stale terminal_sessions (on-connect + cron).
 * @param {Record<string, unknown>} env
 * @returns {Promise<number>}
 */
export async function purgeStaleTerminalSessions(env) {
  if (!env?.DB) return 0;
  try {
    const r = await env.DB.prepare(
      `DELETE FROM terminal_sessions
       WHERE status = 'closed'
         AND closed_at IS NOT NULL
         AND closed_at < unixepoch() - 86400`,
    ).run();
    return Number(r.meta?.changes ?? r.changes ?? 0) || 0;
  } catch (e) {
    console.warn('[purgeStaleTerminalSessions]', e?.message ?? e);
    return 0;
  }
}

/**
 * Recent terminal input lines for cross-session shell history (user-scoped).
 * @param {Record<string, unknown>} env
 * @param {string} userId
 * @param {number} [limit]
 */
export async function getTerminalInputHistory(env, userId, limit = 200) {
  if (!env?.DB || !userId) return [];
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 200);
  const uid = String(userId).trim();
  try {
    const res = await env.DB.prepare(
      `SELECT th.content, th.recorded_at
       FROM terminal_history th
       INNER JOIN terminal_sessions ts ON ts.id = th.terminal_session_id
       WHERE ts.user_id = ? AND th.direction = 'input'
         AND th.content IS NOT NULL AND trim(th.content) != ''
       ORDER BY th.recorded_at DESC
       LIMIT ?`,
    )
      .bind(uid, lim)
      .all();
    const rows = res?.results || [];
    const seen = new Set();
    const commands = [];
    for (const row of rows) {
      const raw = String(row.content || '').replace(/[\r\n]+$/, '').trim();
      if (!raw || raw.startsWith('/') || seen.has(raw)) continue;
      seen.add(raw);
      commands.push(raw);
    }
    return commands.reverse();
  } catch (e) {
    console.warn('[getTerminalInputHistory]', e?.message ?? e);
    return [];
  }
}

export const DEFAULT_TERMINAL_PREFS = {
  terminal_mode: 'shell',
  terminal_ai_enabled: false,
  active_agent_slug: null,
  active_model_key: null,
  assist_modes: ['ask', 'explain', 'error', 'fix'],
};

const TERMINAL_CONN_SELECT = `
  id, ws_url, auth_token_secret_name, connection_type, ollama_url,
  shell, platform, user_id, workspace_id, tenant_id, auth_mode, token_verify_endpoint,
  target_type, target_priority, self_service_enabled, last_health_status, last_health_at,
  health_error, cwd_strategy, is_default, is_active, updated_at`;

/**
 * Authoritative terminal_connections row selection for routing.
 * Never selects another user's machine.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {{
 *   userId?: string | null,
 *   workspaceId?: string | null,
 *   tenantId?: string | null,
 *   connectionId?: string | null,
 *   targetType?: string | null,
 * }} opts
 * @returns {Promise<{ connection: Record<string, unknown> | null, error: string | null }>}
 */
export async function getSelectedTerminalConnection(db, opts = {}) {
  if (!db) return { connection: null, error: 'connection_missing' };

  const uid =
    opts.userId != null && String(opts.userId).trim() !== '' ? String(opts.userId).trim() : null;
  const wid =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : null;
  const tid =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : null;
  const tt =
    opts.targetType != null && String(opts.targetType).trim() !== ''
      ? String(opts.targetType).trim()
      : null;

  if (tt && !VALID_TARGET_TYPES.includes(tt)) {
    return { connection: null, error: 'unsupported_target_type' };
  }

  try {
    const connectionId =
      opts.connectionId != null && String(opts.connectionId).trim() !== ''
        ? String(opts.connectionId).trim()
        : null;

    if (connectionId) {
      const row = await db
        .prepare(
          `SELECT ${TERMINAL_CONN_SELECT}
           FROM terminal_connections
           WHERE id = ? AND is_active = 1
           LIMIT 1`,
        )
        .bind(connectionId)
        .first();
      if (!row) return { connection: null, error: 'connection_missing' };
      const rowWid = row.workspace_id != null ? String(row.workspace_id).trim() : '';
      if (wid && rowWid && rowWid !== wid) {
        return { connection: null, error: 'connection_forbidden' };
      }
      const rowUid = row.user_id != null ? String(row.user_id).trim() : '';
      if (rowUid && uid && rowUid !== uid) {
        return { connection: null, error: 'connection_forbidden' };
      }
      if (tt) {
        const rowTt = String(row.target_type || 'platform_vm').trim();
        if (rowTt !== tt) return { connection: null, error: 'connection_forbidden' };
      }
      return { connection: row, error: null };
    }

    if (uid && wid) {
      let sql = `SELECT ${TERMINAL_CONN_SELECT}
         FROM terminal_connections
         WHERE user_id = ? AND workspace_id = ? AND is_active = 1`;
      const binds = [uid, wid];
      if (tt) {
        sql += ' AND target_type = ?';
        binds.push(tt);
      }
      if (tid) {
        sql += " AND (tenant_id = ? OR tenant_id IS NULL OR tenant_id = '')";
        binds.push(tid);
      }
      sql += ' ORDER BY is_default DESC, target_priority ASC, updated_at DESC LIMIT 1';
      const row = await db.prepare(sql).bind(...binds).first();
      if (row) return { connection: row, error: null };
    }

    return { connection: null, error: 'connection_missing' };
  } catch (e) {
    console.warn('[getSelectedTerminalConnection]', e?.message ?? e);
    return { connection: null, error: 'connection_missing' };
  }
}

/**
 * Resolve PTY bridge row from D1 (terminal_connections).
 * Wrapper around getSelectedTerminalConnection — defaults to platform_vm.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} workspaceId
 * @param {{ targetType?: string | null, connectionId?: string | null, tenantId?: string | null }} [opts]
 */
export async function getDefaultTerminalConnection(db, userId = null, workspaceId = null, opts = {}) {
  const targetType = opts.targetType != null ? opts.targetType : 'platform_vm';
  const sel = await getSelectedTerminalConnection(db, {
    userId,
    workspaceId,
    tenantId: opts.tenantId ?? null,
    connectionId: opts.connectionId ?? null,
    targetType,
  });
  if (sel.connection) return sel.connection;
  if (targetType !== 'platform_vm') {
    const fallback = await getSelectedTerminalConnection(db, {
      userId,
      workspaceId,
      tenantId: opts.tenantId ?? null,
      connectionId: opts.connectionId ?? null,
      targetType: null,
    });
    return fallback.connection;
  }
  return null;
}

export function parseTerminalPrefs(json) {
  const base = { ...DEFAULT_TERMINAL_PREFS, assist_modes: [...DEFAULT_TERMINAL_PREFS.assist_modes] };
  try {
    const parsed = JSON.parse(json || '{}');
    if (parsed && typeof parsed === 'object') {
      return { ...base, ...parsed };
    }
  } catch (_) {}
  return base;
}

export async function loadTerminalSessionPrefs(env, sessionId) {
  if (!env?.DB || !sessionId) return parseTerminalPrefs('{}');
  try {
    const row = await env.DB.prepare(
      'SELECT prefs_json FROM terminal_sessions WHERE id = ? LIMIT 1',
    )
      .bind(String(sessionId).trim())
      .first();
    return parseTerminalPrefs(row?.prefs_json);
  } catch (_) {
    return parseTerminalPrefs('{}');
  }
}

export async function saveTerminalSessionPrefs(env, sessionId, prefs, userId, workspaceId) {
  if (!env?.DB || !sessionId || !userId || !workspaceId) return false;
  try {
    const row = await env.DB.prepare(
      'SELECT user_id, workspace_id FROM terminal_sessions WHERE id = ? LIMIT 1',
    )
      .bind(String(sessionId).trim())
      .first();
    if (!row) return false;
    if (String(row.user_id).trim() !== String(userId).trim()) return false;
    if (String(row.workspace_id).trim() !== String(workspaceId).trim()) return false;
    await env.DB.prepare(
      'UPDATE terminal_sessions SET prefs_json = ?, updated_at = unixepoch() WHERE id = ?',
    )
      .bind(JSON.stringify(prefs), String(sessionId).trim())
      .run();
    return true;
  } catch (e) {
    console.warn('[saveTerminalSessionPrefs]', e?.message ?? e);
    return false;
  }
}

export async function userCanUseTerminalAi(env, userId, workspaceId) {
  if (!env?.DB || !userId || !workspaceId) return false;
  try {
    const policy = await env.DB.prepare(
      'SELECT terminal_ai_enabled FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1',
    )
      .bind(String(userId).trim(), String(workspaceId).trim())
      .first();
    return Number(policy?.terminal_ai_enabled) === 1;
  } catch (_) {
    return false;
  }
}

export async function loadTerminalAgentCatalog(env, { userId, workspaceId, tenantId = null }) {
  if (!env?.DB || !userId) return [];
  const uid = String(userId).trim();
  const wid = workspaceId != null ? String(workspaceId).trim() : '';
  try {
    const rows = await env.DB.prepare(
      `SELECT slug, display_name, description, default_model_id
       FROM agentsam_subagent_profile
       WHERE is_active = 1
         AND (
           COALESCE(is_platform_global, 0) = 1
           OR (user_id = ? AND (workspace_id = ? OR workspace_id IS NULL OR workspace_id = ''))
         )
       ORDER BY display_name ASC, slug ASC`,
    )
      .bind(uid, wid)
      .all();
    return rows?.results ?? [];
  } catch (e) {
    console.warn('[loadTerminalAgentCatalog]', e?.message ?? e);
    return [];
  }
}

export async function loadTerminalModelCatalog(env, { userId, workspaceId }) {
  if (!env?.DB) return [];
  let tierMax = 4;
  if (userId && workspaceId) {
    try {
      const policy = await env.DB.prepare(
        'SELECT allowed_model_tier_max FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1',
      )
        .bind(String(userId).trim(), String(workspaceId).trim())
        .first();
      if (policy?.allowed_model_tier_max != null) {
        tierMax = Number(policy.allowed_model_tier_max);
      }
    } catch (_) {}
  }
  const sizeClassTier = { nano: 0, mini: 1, small: 1, standard: 2, medium: 2, pro: 3, large: 3, max: 4, opus: 4 };
  try {
    const rows = await env.DB.prepare(
      `SELECT
         ai.model_key,
         ai.display_name,
         ai.provider,
         ai.sort_order,
         ai.size_class,
         mc.context_window,
         mc.max_output_tokens,
         mc.supports_tools,
         mc.supports_streaming,
         mc.supports_json_mode,
         mc.supports_reasoning,
         mc.is_active,
         mc.is_degraded,
         mc.budget_exhausted
       FROM agentsam_ai ai
       LEFT JOIN agentsam_model_catalog mc ON mc.model_key = ai.model_key
       WHERE ai.mode = 'model'
         AND COALESCE(ai.show_in_picker, 0) = 1
         AND COALESCE(ai.picker_eligible, 1) = 1
         AND ai.status = 'active'
         AND ai.model_key IS NOT NULL
         AND COALESCE(mc.is_active, 1) = 1
         AND COALESCE(mc.is_degraded, 0) = 0
         AND COALESCE(mc.budget_exhausted, 0) = 0
       ORDER BY ai.sort_order ASC, ai.display_name ASC`,
    ).all();
    const results = rows?.results ?? [];
    return results.filter((m) => {
      const sc = m.size_class != null ? String(m.size_class).trim().toLowerCase() : '';
      const tier = sc && sizeClassTier[sc] != null ? sizeClassTier[sc] : 0;
      return tier <= tierMax;
    });
  } catch (e) {
    console.warn('[loadTerminalModelCatalog]', e?.message ?? e);
    return [];
  }
}

/**
 * Validate prefs update against policy + D1 catalogs before persist.
 */
export async function validateTerminalSessionPrefsUpdate(env, { userId, workspaceId, tenantId, prefs }) {
  const next = parseTerminalPrefs(JSON.stringify(prefs));
  if (next.terminal_ai_enabled) {
    const allowed = await userCanUseTerminalAi(env, userId, workspaceId);
    if (!allowed) {
      return { ok: false, error: 'terminal_ai_not_enabled', prefs: null };
    }
  }
  if (next.active_agent_slug) {
    const agents = await loadTerminalAgentCatalog(env, { userId, workspaceId, tenantId });
    if (!agents.some((a) => a.slug === next.active_agent_slug)) {
      return { ok: false, error: 'invalid_agent_slug', prefs: null };
    }
  }
  if (next.active_model_key) {
    const models = await loadTerminalModelCatalog(env, { userId, workspaceId });
    if (!models.some((m) => m.model_key === next.active_model_key)) {
      return { ok: false, error: 'invalid_model_key', prefs: null };
    }
  }
  if (next.terminal_mode === 'agentsam' && !next.terminal_ai_enabled) {
    next.terminal_ai_enabled = true;
  }
  if (next.terminal_mode === 'shell') {
    next.terminal_ai_enabled = false;
  }
  return { ok: true, prefs: next, error: null };
}

async function checkOllamaReachable(env, connection) {
  const url = String(connection?.ollama_url || env?.OLLAMA_URL || '').trim();
  if (!url) return false;
  try {
    const base = url.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

function connectionDbBridgeOk(env, conn, resolvedToken = null) {
  if (!conn) return false;
  const wsPart = String(conn.ws_url || '').trim();
  const tok = (() => {
    const pre = resolvedToken != null ? String(resolvedToken).trim() : '';
    if (pre) return pre;
    const secretName = String(conn.auth_token_secret_name || '').trim();
    if (secretName === USER_PTY_TOKEN_SENTINEL) return '';
    return secretName && env[secretName] != null ? String(env[secretName]).trim() : '';
  })();
  return !!(wsPart && tok) || String(conn.auth_mode || '').trim() === 'token_mint';
}

/**
 * Resolve bridge auth token for a terminal_connections row.
 * Priority: user_secrets (user_pty_token) → Worker secret by name → PTY_AUTH_TOKEN / TERMINAL_SECRET.
 *
 * @param {Record<string, unknown>} env
 * @param {Record<string, unknown> | null | undefined} conn
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} workspaceId
 * @returns {Promise<string | null>}
 */
export async function resolveConnectionAuthToken(env, conn, userId, workspaceId) {
  if (!conn) return null;
  const mode = String(conn.auth_mode || '').trim();
  if (mode === 'token_mint') return null;

  const uid = userId != null ? String(userId).trim() : '';
  const wid = workspaceId != null ? String(workspaceId).trim() : '';
  const secretName = String(conn.auth_token_secret_name || '').trim();

  if (mode === 'secret_name' && secretName === USER_PTY_TOKEN_SENTINEL && uid) {
    const fromD1 = await resolveUserPtyToken(env, uid, wid);
    if (fromD1) return fromD1;
  } else if (secretName && secretName !== USER_PTY_TOKEN_SENTINEL && env[secretName] != null) {
    const t = String(env[secretName]).trim();
    if (t) return t;
  }

  const fallback = String(env?.PTY_AUTH_TOKEN || env?.TERMINAL_SECRET || '').trim();
  return fallback || null;
}

/**
 * Build /api/agent/terminal/config-status payload (safe diagnostics only).
 */
export async function buildTerminalConfigStatus(env, authUser, twCfg, query = {}) {
  const baseDisabled = {
    terminal_enabled: false,
    terminal_configured: false,
    control_plane_available: false,
    direct_wss_available: false,
    error_code: null,
  };

  if (!authUser?.id) {
    return { ...baseDisabled, error_code: 'auth_missing' };
  }
  if (!twCfg?.workspaceId) {
    return { ...baseDisabled, error_code: twCfg?.error === 'Forbidden' ? 'policy_denied' : 'workspace_missing' };
  }

  const userId = String(authUser.id).trim();
  const workspaceId = String(twCfg.workspaceId).trim();
  const canPty = await userCanRunPtyFromPolicy(env, userId, workspaceId);
  if (!canPty) {
    return { ...baseDisabled, error_code: 'policy_denied' };
  }

  let tenantId = await resolvePtyTenantIdForUser(env, authUser, userId);
  tenantId = tenantId != null ? String(tenantId).trim() : '';
  if (!tenantId) {
    return { ...baseDisabled, terminal_enabled: false, error_code: 'tenant_missing' };
  }

  const targetTypeRaw = (query.target_type || query.targetType || 'platform_vm').trim();
  const targetType = VALID_TARGET_TYPES.includes(targetTypeRaw) ? targetTypeRaw : null;
  if (!targetType) {
    return {
      ...baseDisabled,
      terminal_enabled: true,
      user_id: userId,
      workspace_id: workspaceId,
      tenant_id: tenantId,
      can_run_pty: true,
      error_code: 'unsupported_target_type',
    };
  }

  const connectionId = (query.connection_id || query.connectionId || '').trim() || null;
  const sel = await getSelectedTerminalConnection(env.DB, {
    userId,
    workspaceId,
    tenantId,
    connectionId,
    targetType,
  });

  if (sel.error === 'connection_forbidden') {
    return {
      terminal_enabled: true,
      terminal_configured: false,
      control_plane_available: !!env.AGENT_SESSION,
      direct_wss_available: false,
      user_id: userId,
      workspace_id: workspaceId,
      tenant_id: tenantId,
      can_run_pty: true,
      selected_target_type: targetType,
      error_code: 'connection_forbidden',
    };
  }

  if (sel.error === 'unsupported_target_type') {
    return {
      terminal_enabled: true,
      terminal_configured: false,
      control_plane_available: !!env.AGENT_SESSION,
      direct_wss_available: false,
      user_id: userId,
      workspace_id: workspaceId,
      tenant_id: tenantId,
      can_run_pty: true,
      error_code: 'unsupported_target_type',
    };
  }

  const conn = sel.connection;
  let errorCode = sel.error;

  if (targetType === 'ssh_target') errorCode = errorCode || 'ssh_target_not_enabled';
  if (targetType === 'sandbox') errorCode = errorCode || 'sandbox_not_enabled';

  const vpcPty = !!env.PTY_SERVICE;
  const httpsUrl = (env.TERMINAL_WS_URL || '').trim();
  const secret = (env.TERMINAL_SECRET || env.PTY_AUTH_TOKEN || '').trim();
  const resolvedConnToken = await resolveConnectionAuthToken(env, conn, userId, workspaceId);
  const dbBridgeOk = connectionDbBridgeOk(env, conn, resolvedConnToken);
  const wsUrlPresent = !!(conn?.ws_url && String(conn.ws_url).trim());

  let routeWillUsePtyService = false;
  let routeWillUseConnectionWsUrl = false;

  if (targetType === 'platform_vm') {
    routeWillUsePtyService = vpcPty;
    routeWillUseConnectionWsUrl = !vpcPty && wsUrlPresent;
    if (!vpcPty && !httpsUrl && !secret && !dbBridgeOk && !wsUrlPresent) {
      errorCode = errorCode || 'pty_backend_unconfigured';
    }
  } else if (targetType === 'user_hosted_tunnel') {
    routeWillUsePtyService = false;
    routeWillUseConnectionWsUrl = wsUrlPresent;
    if (!wsUrlPresent) errorCode = errorCode || 'connection_missing';
  }

  const { resolveTerminalCwd } = await import('./pty-workspace-paths.js');
  const cwdResult = resolveTerminalCwd(env, {
    connection: conn,
    tenantId,
    userId,
  });

  const terminalConfigured =
    targetType === 'ssh_target' || targetType === 'sandbox'
      ? false
      : targetType === 'platform_vm'
        ? !!(vpcPty || (httpsUrl && secret) || dbBridgeOk || wsUrlPresent)
        : wsUrlPresent;

  return {
    terminal_enabled: true,
    terminal_configured: terminalConfigured,
    control_plane_available: !!env.AGENT_SESSION,
    direct_wss_available: false,
    user_id: userId,
    workspace_id: workspaceId,
    tenant_id: tenantId,
    can_run_pty: true,
    selected_target_type: targetType,
    selected_connection_id: conn?.id ?? null,
    selected_connection_platform: conn?.platform ?? null,
    selected_connection_shell: conn?.shell ?? null,
    selected_connection_auth_mode: conn?.auth_mode ?? null,
    selected_connection_ws_url_present: wsUrlPresent,
    route_will_use_pty_service: routeWillUsePtyService,
    route_will_use_connection_ws_url: routeWillUseConnectionWsUrl,
    self_service_enabled: Number(conn?.self_service_enabled) === 1,
    cwd: cwdResult.cwd,
    cwd_strategy: cwdResult.strategy,
    db_bridge_ok: dbBridgeOk,
    pty_service_bound: vpcPty,
    terminal_ws_url_configured: !!httpsUrl,
    error_code: errorCode,
  };
}

export async function buildTerminalCatalogResponse(env, authUser, workspaceId) {
  const userId = String(authUser.id).trim();
  const wid = String(workspaceId).trim();
  const aiAllowed = await userCanUseTerminalAi(env, userId, wid);
  const tenantId = await resolvePtyTenantIdForUser(env, authUser, userId);
  const sel = await getSelectedTerminalConnection(env.DB, {
    userId,
    workspaceId: wid,
    tenantId,
    targetType: 'platform_vm',
  });
  const ollamaReachable = await checkOllamaReachable(env, sel.connection);
  const agents = aiAllowed
    ? await loadTerminalAgentCatalog(env, { userId, workspaceId: wid, tenantId })
    : [];
  const models = aiAllowed ? await loadTerminalModelCatalog(env, { userId, workspaceId: wid }) : [];
  return {
    ai_allowed: aiAllowed,
    ai_enabled_default: false,
    agents,
    models,
    ollama_reachable: ollamaReachable,
  };
}

/**
 * SHA-256 hex of raw UTF-8 token (for PTY token_mint verify vs terminal_sessions.auth_token_hash).
 * @param {string} token
 */
export async function mintSessionToken() {
  const raw = crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'');
  const hash = await sha256HexUtf8(raw);
  return { rawToken: raw, tokenHash: hash };
}

export async function sha256HexUtf8(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token ?? '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * D1 agentsam_user_policy.can_run_pty gate (replaces superadmin-only terminal checks).
 * @param {Record<string, unknown>} env
 * @param {string} userId
 * @param {string} workspaceId
 */
export async function userCanRunPtyFromPolicy(env, userId, workspaceId) {
  if (!env?.DB || !userId || !workspaceId) return false;
  try {
    const policy = await env.DB.prepare(
      'SELECT can_run_pty FROM agentsam_user_policy WHERE user_id = ? AND workspace_id = ? LIMIT 1',
    )
      .bind(String(userId).trim(), String(workspaceId).trim())
      .first();
    return Number(policy?.can_run_pty) === 1;
  } catch (_) {
    return false;
  }
}

/**
 * Merge WS frames from iam-pty run: JSON session_id/error/output, or raw PTY UTF-8.
 */
export function aggregateTerminalRunOutput(parts) {
  let out = '';
  for (const p of parts) {
    let s = p;
    if (typeof ArrayBuffer !== 'undefined' && s instanceof ArrayBuffer) {
      s = new TextDecoder().decode(s);
    } else if (typeof Uint8Array !== 'undefined' && s instanceof Uint8Array) {
      s = new TextDecoder().decode(s);
    } else if (typeof s !== 'string') {
      s = String(s);
    }
    const trimStart = s.trimStart();
    if (trimStart.startsWith('{')) {
      try {
        const j = JSON.parse(s);
        if (j && typeof j === 'object') {
          if (j.type === 'session_id') continue;
          if (j.type === 'output' && j.data != null) {
            out += typeof j.data === 'string' ? j.data : String(j.data);
            continue;
          }
          if (j.type === 'error' && j.data != null) {
            out += typeof j.data === 'string' ? j.data : String(j.data);
            continue;
          }
        }
      } catch (_) { /* not JSON; treat as PTY raw */ }
    }
    out += s;
  }
  return out.trim();
}

/**
 * Same host as TERMINAL_WS_URL: POST /exec (iam-pty server.js).
 */
export function terminalExecHttpUrlFromEnv(env) {
  const raw = (env.TERMINAL_WS_URL || '').trim().split('?')[0];
  if (!raw) return '';
  try {
    let u = raw;
    if (u.startsWith('wss://')) u = 'https://' + u.slice(6);
    else if (u.startsWith('ws://')) u = 'http://' + u.slice(7);
    else if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    return new URL('/exec', new URL(u).origin).href;
  } catch (_) {
    return '';
  }
}

/**
 * Run via HTTP-exec (reliable fallback for Cloudflare Workers).
 */
export async function runTerminalCommandViaHttpExec(env, cmd, opts = {}) {
  const tokens = [];
  const pushTok = (t) => {
    const s = String(t || '').trim();
    if (s && !tokens.includes(s)) tokens.push(s);
  };
  const uid = opts.userId != null ? String(opts.userId).trim() : '';
  const wid = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  if (opts.connection && uid) {
    pushTok(await resolveConnectionAuthToken(env, opts.connection, uid, wid));
  } else if (uid) {
    pushTok(await resolveUserPtyToken(env, uid, wid));
  }
  pushTok(env.PTY_AUTH_TOKEN);
  pushTok(env.TERMINAL_SECRET);
  if (!tokens.length) return { ok: false };

  // Prefer private VPC connector when present (tunnel handles auth; no worker-side PTY headers).
  if (env?.PTY_SERVICE) {
    try {
      const res = await env.PTY_SERVICE.fetch(
        new Request('http://localhost:3099/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        }),
      );
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data === 'object') {
          const stdout = typeof data.stdout === 'string' ? data.stdout : '';
          const stderr = typeof data.stderr === 'string' ? data.stderr : '';
          const text = ((stdout || '') + (stderr ? '\nSTDERR: ' + stderr : '')).trim();
          return { ok: true, text, exitCode: data.exit_code ?? 0 };
        }
      }
    } catch (_) {
      /* fall through to TERMINAL_WS_URL-based HTTP /exec fallback */
    }
  }

  const execUrl = terminalExecHttpUrlFromEnv(env);
  if (!execUrl) return { ok: false };

  try {
    for (let i = 0; i < tokens.length; i++) {
      const bearer = tokens[i];
      const res = await fetch(execUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
        body: JSON.stringify({ command: cmd }),
      });
      if (res.status === 401 && i < tokens.length - 1) continue;
      if (!res.ok) return { ok: false };
      
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') return { ok: false };
      const stdout = typeof data.stdout === 'string' ? data.stdout : '';
      const stderr = typeof data.stderr === 'string' ? data.stderr : '';
      const text = ((stdout || '') + (stderr ? '\nSTDERR: ' + stderr : '')).trim();
      return { ok: true, text, exitCode: data.exit_code ?? 0 };
    }
    return { ok: false };
  } catch (e) {
    return { ok: false };
  }
}

/**
 * ACTIVE PATH: Execute through the authoritative Worker/DO control plane.
 * DEPRECATED DIRECT PATH: direct browser → upstream PTY websocket.
 */
export async function runTerminalCommandViaControlPlane(env, request, command, executionMode = 'pty', extra = {}) {
  if (!env?.AGENT_SESSION) return { ok: false };
  const cmd = typeof command === 'string' ? command.trim() : '';
  if (!cmd) return { ok: false, error: 'No command' };
  try {
    const authUser = await getAuthUser(request, env);
    if (!authUser?.id) return { ok: false, error: 'Unauthorized' };
    const userId = String(authUser.id).trim();
    const tw = await resolveTerminalWorkspaceId(env, request, authUser, extra.workspace_id);
    if (tw.error === 'Forbidden') return { ok: false, error: 'Forbidden' };
    if (tw.error || !tw.workspaceId) return { ok: false, error: WORKSPACE_CONTEXT_MISSING };
    const workspaceId = tw.workspaceId;
    const mode = ['pty', 'ssh', 'mcp'].includes(String(executionMode || '').toLowerCase())
      ? String(executionMode).toLowerCase()
      : 'pty';
    const sessionName = `terminal:${userId}:${workspaceId}:${mode}`;
    const doId = env.AGENT_SESSION.idFromName(sessionName);
    const stub = env.AGENT_SESSION.get(doId);
    const doUrl = new URL('https://do.internal/terminal/exec');
    doUrl.searchParams.set('execution_mode', mode);
    doUrl.searchParams.set('workspace_id', workspaceId);
    doUrl.searchParams.set('user_id', userId);
    let tid = await resolvePtyTenantIdForUser(env, authUser, userId);
    tid = tid != null ? String(tid).trim() : '';
    if (!tid) return { ok: false, error: 'TENANT_CONTEXT_REQUIRED' };
    doUrl.searchParams.set('tenant_id', tid);
    const workingDir = buildPtySessionWorkingDir(env, { tenantId: tid, userId });
    if (workingDir) doUrl.searchParams.set('cwd', workingDir);
    const puuid = authUser.person_uuid != null && String(authUser.person_uuid).trim() !== '' ? String(authUser.person_uuid).trim() : '';
    if (puuid) doUrl.searchParams.set('person_uuid', puuid);
    const resp = await stub.fetch(new Request(doUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        command: cmd,
        execution_mode: mode,
        workspace_id: workspaceId,
        target_id: extra.target_id || extra.ssh_target_id || null,
        ssh_target_id: extra.ssh_target_id || null,
        tool_name: extra.tool_name || null,
        params: extra.params || null,
      }),
    }));
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || payload?.ok === false) {
      return { ok: false, error: payload?.error || `control-plane ${resp.status}` };
    }
    return {
      ok: true,
      text: typeof payload?.output === 'string' ? payload.output : '',
      exitCode: payload?.exit_code ?? 0,
      toolName: payload?.tool_name ?? null,
      targetId: payload?.target_id ?? null,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function writeTerminalHistory(env, request, sessionId, commandText, outputText, exitCode) {
  if (!env.DB) return;
  const terminalSessionId = await resolveTerminalSessionIdForHistory(env, request);
  const authUser = await getAuthUser(request, env).catch(() => null);
  let tenantId = authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '' ? String(authUser.tenant_id).trim() : null;
  if (!tenantId && authUser?.id) {
    tenantId = await fetchAuthUserTenantId(env, authUser.id).catch(() => null);
  }
  if (!terminalSessionId || !tenantId) {
    console.warn('[terminal_history] skip: terminal_session_missing', {
      terminalSessionId: terminalSessionId || null,
      tenantId: tenantId || null,
      agentSessionId: sessionId || null,
    });
    return;
  }

  // Validate FK target exists (terminal_sessions.id). If it doesn't, avoid FK violations.
  try {
    const exists = await env.DB.prepare('SELECT 1 AS ok FROM terminal_sessions WHERE id = ? LIMIT 1')
      .bind(terminalSessionId)
      .first();
    if (!exists?.ok) {
      console.warn('[terminal_history] skip: parent_missing', { terminalSessionId, tenantId, agentSessionId: sessionId || null });
      return;
    }
  } catch (e) {
    console.warn('[terminal_history] skip: terminal_session_check_failed', { terminalSessionId, error: e?.message ?? String(e) });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  let seq = 0;
  try {
    const seqRow = await env.DB.prepare(
      'SELECT COALESCE(MAX(sequence), 0) AS m FROM terminal_history WHERE terminal_session_id = ?'
    ).bind(terminalSessionId).first();
    seq = Number(seqRow?.m ?? 0);
    if (!Number.isFinite(seq)) seq = 0;
  } catch (_) {
    seq = 0;
  }
  seq += 1;
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), terminalSessionId, tenantId, seq, 'input', commandText.slice(0, 5000), 'agent', sessionId, now).run();
  seq += 1;
  await env.DB.prepare(
    `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, exit_code, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind('th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), terminalSessionId, tenantId, seq, 'output', outputText.slice(0, 10000), exitCode ?? null, 'agent', sessionId, now).run();
}

/**
 * Primary Execution Orchestrator.
 */
export async function runTerminalCommand(env, request, command, sessionId = null, executionCtx = null) {
  const cmd = typeof command === 'string' ? command.trim() : '';
  const mode = String(executionCtx?.execution_mode || 'pty').toLowerCase();
  const controlTry = await runTerminalCommandViaControlPlane(env, request, cmd, mode, executionCtx || {});
  if (controlTry.ok) {
    const cleanOutput = controlTry.text;
    const exitCode = controlTry.exitCode;
    await writeTerminalHistory(env, request, sessionId, cmd, cleanOutput, exitCode);
    return { output: cleanOutput, command: cmd, exitCode };
  }

  // Keep single control plane for all modes.
  if (mode !== 'pty' || env?.AGENT_SESSION) {
    throw new Error(controlTry.error || `${mode} execution unavailable`);
  }

  // Legacy fallback path for environments missing AGENT_SESSION.
  const httpTry = await runTerminalCommandViaHttpExec(env, cmd);
  if (!httpTry.ok) {
    throw new Error(controlTry.error || 'terminal execution unavailable');
  }
  const cleanOutput = httpTry.text;
  const exitCode = httpTry.exitCode;

  await writeTerminalHistory(env, request, sessionId, cmd, cleanOutput, exitCode);

  return { output: cleanOutput, command: cmd, exitCode };
}

/**
 * Resolve filesystem root for IAM git/terminal from D1 workspace_settings.workspace_root.
 *
 * @param {any} env
 * @param {{ workspaceId?: string|null, allowPlatformFallback?: boolean }} [opts]
 */
export async function resolveIamWorkspaceRoot(env, opts = {}) {
  if (!env?.DB) throw new Error('DB not configured');

  const allowPlatformFallback = opts.allowPlatformFallback === true;
  let wid = String(opts.workspaceId || '').trim();

  if (!wid) {
    if (allowPlatformFallback) {
      const plat =
        env?.DEFAULT_WORKSPACE_ID != null && String(env.DEFAULT_WORKSPACE_ID).trim() !== ''
          ? String(env.DEFAULT_WORKSPACE_ID).trim()
          : '';
      if (plat) {
        console.warn(
          '[resolveIamWorkspaceRoot] platform-scoped: using env.DEFAULT_WORKSPACE_ID (allowPlatformFallback=true)',
        );
        wid = plat;
      }
    }
  }

  if (!wid) {
    throw new Error(WORKSPACE_CONTEXT_MISSING);
  }

  const workspaceSettingsRow = await env.DB
    .prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id = ?')
    .bind(wid)
    .first()
    .catch(() => null);

  if (workspaceSettingsRow?.settings_json) {
    try {
      const parsed = JSON.parse(workspaceSettingsRow.settings_json);
      const root = typeof parsed?.workspace_root === 'string' ? parsed.workspace_root.trim() : '';
      if (root) return root;
    } catch (_) {}
  }

  throw new Error(WORKSPACE_ROOT_CONTEXT_MISSING);
}

export async function resolveTerminalSessionIdForHistory(env, request) {
  try {
    const authUser = await getAuthUser(request, env);
    if (authUser?.id) {
      const tsRow = await env.DB
        .prepare(`SELECT id FROM terminal_sessions WHERE user_id = ? AND status = 'active' LIMIT 1`)
        .bind(authUser.id)
        .first();
      if (tsRow?.id) return tsRow.id;
    }
  } catch (_) {}
  return null;
}
