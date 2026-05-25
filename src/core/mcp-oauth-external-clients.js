/**
 * D1-driven external MCP client registry + per-user client allowlist.
 * Tables: agentsam_mcp_oauth_external_client_registry,
 *         agentsam_mcp_oauth_user_client_allowlist
 */

const MCP_CANONICAL_CLIENT_ID = 'iam_mcp_inneranimalmedia';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/**
 * Resolve registry client_key from OAuth redirect_uri (DB patterns first, code fallback).
 * @param {any} env
 * @param {string} redirectUri
 * @param {string} [oauthClientId]
 */
export async function resolveExternalClientKeyFromRedirect(env, redirectUri, oauthClientId = MCP_CANONICAL_CLIENT_ID) {
  const raw = trim(redirectUri);
  if (!raw) return null;

  let host = '';
  let path = '';
  try {
    const u = new URL(raw);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return null;
  }

  if (env?.DB) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT client_key, redirect_host_patterns
           FROM agentsam_mcp_oauth_external_client_registry
          WHERE oauth_client_id = ?
            AND COALESCE(is_active, 1) = 1
          ORDER BY sort_order ASC`,
      )
        .bind(trim(oauthClientId) || MCP_CANONICAL_CLIENT_ID)
        .all();

      for (const row of results || []) {
        const patterns = parseJsonArray(row.redirect_host_patterns).map((h) =>
          trim(h).toLowerCase(),
        );
        if (!patterns.length) continue;
        const hostMatch = patterns.some((p) => host === p || host.endsWith(`.${p}`));
        if (!hostMatch) continue;
        const key = trim(row.client_key);
        if (key === 'cursor' && host === 'mcp.inneranimalmedia.com' && !path.includes('/auth/callback')) {
          continue;
        }
        if (key === 'chatgpt' && !(path.includes('connector') || path.includes('oauth'))) {
          if (host !== 'chatgpt.com' && host !== 'chat.openai.com') continue;
        }
        return key;
      }
    } catch (_) {}
  }

  if (host === 'claude.ai' || host === 'claude.com') return 'claude';
  if (
    host === 'chatgpt.com' ||
    host === 'chat.openai.com' ||
    path.includes('connector_platform_oauth') ||
    path.startsWith('/connector/oauth/')
  ) {
    return 'chatgpt';
  }
  if (host === 'mcp.inneranimalmedia.com' && path.includes('/auth/callback')) return 'cursor';
  return null;
}

/**
 * When user has rows in agentsam_mcp_oauth_user_client_allowlist for a workspace,
 * only listed client_key values may connect. No rows → all active registry clients allowed.
 * @param {any} env
 * @param {{ userId: string, workspaceId: string, externalClientKey: string|null, oauthClientId?: string }} input
 */
export async function assertUserMayUseExternalClient(env, input) {
  const userId = trim(input?.userId);
  const workspaceId = trim(input?.workspaceId);
  const clientKey = trim(input?.externalClientKey);
  const oauthClientId = trim(input?.oauthClientId) || MCP_CANONICAL_CLIENT_ID;

  if (!clientKey) {
    return { ok: false, code: 'unknown_external_client', message: 'redirect_uri does not match a registered external MCP client' };
  }
  if (!env?.DB || !userId || !workspaceId) {
    return { ok: false, code: 'missing_scope', message: 'user/workspace required for external client allowlist' };
  }

  try {
    const reg = await env.DB.prepare(
      `SELECT client_key FROM agentsam_mcp_oauth_external_client_registry
        WHERE client_key = ? AND oauth_client_id = ? AND COALESCE(is_active, 1) = 1
        LIMIT 1`,
    )
      .bind(clientKey, oauthClientId)
      .first();
    if (!reg) {
      return {
        ok: false,
        code: 'external_client_inactive',
        message: `External client "${clientKey}" is not active in agentsam_mcp_oauth_external_client_registry`,
      };
    }

    const { results: userRows } = await env.DB.prepare(
      `SELECT client_key FROM agentsam_mcp_oauth_user_client_allowlist
        WHERE user_id = ? AND workspace_id = ? AND COALESCE(is_active, 1) = 1`,
    )
      .bind(userId, workspaceId)
      .all();

    if (!userRows?.length) {
      return { ok: true, enforced: false, client_key: clientKey };
    }

    const allowed = new Set(userRows.map((r) => trim(r.client_key)).filter(Boolean));
    if (!allowed.has(clientKey)) {
      return {
        ok: false,
        code: 'external_client_not_allowed',
        message:
          `External MCP client "${clientKey}" is not on your allowlist. Add it in IAM (agentsam_mcp_oauth_user_client_allowlist) or Settings.`,
      };
    }
    return { ok: true, enforced: true, client_key: clientKey };
  } catch (e) {
    return { ok: false, code: 'allowlist_lookup_failed', message: String(e?.message || e) };
  }
}

/** List active registry clients (admin / settings). */
export async function listExternalClientRegistry(env, oauthClientId = MCP_CANONICAL_CLIENT_ID) {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT client_key, display_name, oauth_client_id, redirect_host_patterns, sort_order, notes
         FROM agentsam_mcp_oauth_external_client_registry
        WHERE oauth_client_id = ? AND COALESCE(is_active, 1) = 1
        ORDER BY sort_order ASC`,
    )
      .bind(trim(oauthClientId) || MCP_CANONICAL_CLIENT_ID)
      .all();
    return results || [];
  } catch {
    return [];
  }
}

/**
 * Record external client allowlist on successful OAuth consent (session-scoped, not migration-seeded).
 * @param {any} env
 * @param {{ userId: string, workspaceId: string, tenantId?: string|null, externalClientKey: string }} input
 */
export async function recordExternalClientAllowlistOnConsent(env, input) {
  const userId = trim(input?.userId);
  const workspaceId = trim(input?.workspaceId);
  const clientKey = trim(input?.externalClientKey);
  const tenantId = trim(input?.tenantId) || null;
  if (!env?.DB || !userId || !workspaceId || !clientKey) return { ok: false };

  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_mcp_oauth_user_client_allowlist
         (user_id, workspace_id, client_key, tenant_id, is_active, notes, updated_at)
       VALUES (?, ?, ?, ?, 1, 'Granted via MCP OAuth consent', unixepoch())
       ON CONFLICT(user_id, workspace_id, client_key) DO UPDATE SET
         is_active = 1,
         tenant_id = COALESCE(excluded.tenant_id, tenant_id),
         updated_at = unixepoch()`,
    )
      .bind(userId, workspaceId, clientKey, tenantId)
      .run();
    return { ok: true, client_key: clientKey };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** User allowlist rows for a workspace. */
export async function listUserExternalClientAllowlist(env, userId, workspaceId) {
  if (!env?.DB || !userId || !workspaceId) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT client_key, tenant_id, notes, is_active, created_at, updated_at
         FROM agentsam_mcp_oauth_user_client_allowlist
        WHERE user_id = ? AND workspace_id = ?
        ORDER BY client_key ASC`,
    )
      .bind(trim(userId), trim(workspaceId))
      .all();
    return results || [];
  } catch {
    return [];
  }
}
