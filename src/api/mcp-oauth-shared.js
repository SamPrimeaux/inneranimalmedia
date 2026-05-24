import { jsonResponse } from '../core/auth.js';

export const MCP_CANONICAL_CLIENT_ID = 'iam_mcp_inneranimalmedia';
export const IAM_OAUTH_ISSUER = 'https://inneranimalmedia.com';
export const IAM_MCP_RESOURCE_URL = 'https://mcp.inneranimalmedia.com/mcp';
export const MCP_OAUTH_CODE_TTL_SECONDS = 10 * 60;
export const MCP_OAUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const MCP_OAUTH_AUTHZ_TTL_SECONDS = 10 * 60;

/** RFC 8414 — IAM as authorization server for MCP (inneranimalmedia.com). */
export function iamMcpOAuthAuthorizationServerMetadata() {
  return {
    issuer: IAM_OAUTH_ISSUER,
    authorization_endpoint: `${IAM_OAUTH_ISSUER}/api/oauth/authorize`,
    token_endpoint: `${IAM_OAUTH_ISSUER}/api/oauth/token`,
    userinfo_endpoint: `${IAM_OAUTH_ISSUER}/api/oauth/userinfo`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['iam:profile', 'iam:workspaces', 'iam:agent', 'mcp:tools', 'mcp:userinfo'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  };
}

export function mcpOAuthNow() {
  return Math.floor(Date.now() / 1000);
}

export function mcpOAuthJsonError(error, status = 400, extra = {}) {
  return jsonResponse({ error, ...extra }, status);
}

export function mcpOAuthBase64Url(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function mcpOAuthSha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function mcpOAuthPkceS256(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return mcpOAuthBase64Url(buf);
}

export function mcpOAuthRandomToken(prefix, bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export function mcpOAuthParseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function mcpOAuthParseScopeList(raw) {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function mcpOAuthLoadClient(env, clientId) {
  if (!env.DB) return null;
  return env.DB.prepare(
    `SELECT client_id, display_name, name, logo_url, homepage_url, redirect_uris,
            allowed_scopes, requires_pkce, is_active, token_endpoint_auth_method
       FROM oauth_clients
      WHERE client_id = ? AND is_active = 1
      LIMIT 1`,
  )
    .bind(clientId)
    .first();
}

export function mcpOAuthRedirectAllowed(client, redirectHref) {
  const allowed = mcpOAuthParseJsonArray(client?.redirect_uris);
  const norm = String(redirectHref || '').replace(/\/$/, '');
  return allowed.some((u) => String(u).replace(/\/$/, '') === norm);
}

export function mcpOAuthScopeAllowed(client, scopeStr) {
  const requested = mcpOAuthParseScopeList(scopeStr);
  const allowed = mcpOAuthParseJsonArray(client?.allowed_scopes);
  if (!requested.length) return allowed.length > 0;
  return requested.every((s) => allowed.includes(s));
}

export function mcpOAuthNormalizeScope(raw, client) {
  const allowed = mcpOAuthParseJsonArray(client?.allowed_scopes);
  const scopes = mcpOAuthParseScopeList(raw);
  const picked = scopes.length ? scopes : allowed.slice(0, 3);
  if (!picked.includes('mcp:userinfo') && allowed.includes('mcp:userinfo')) {
    picked.push('mcp:userinfo');
  }
  return Array.from(new Set(picked.filter((s) => allowed.includes(s)))).join(' ');
}

/** Canonical redirect URIs for iam_mcp_inneranimalmedia (migration 401). */
export const MCP_OAUTH_REGISTERED_REDIRECT_URIS = [
  'https://mcp.inneranimalmedia.com/auth/callback',
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector_platform_oauth_redirect',
  'https://chat.openai.com/connector_platform_oauth_redirect',
];

export function mcpOAuthValidateRedirectUri(raw, client, env) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return { ok: false, error: 'invalid_redirect_uri', url: null };
  }

  if (u.protocol !== 'https:') {
    return { ok: false, error: 'redirect_uri_must_be_https', url: null };
  }

  const href = u.href;
  if (client && mcpOAuthRedirectAllowed(client, href)) {
    return { ok: true, error: null, url: u };
  }

  const host = u.hostname.toLowerCase();
  const configured = String(env.MCP_OAUTH_ALLOWED_REDIRECT_HOSTS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const allowedHosts = configured.length
    ? configured
    : [
        'mcp.inneranimalmedia.com',
        'inneranimalmedia.com',
        'www.inneranimalmedia.com',
        'claude.ai',
        'claude.com',
        'chatgpt.com',
        'chat.openai.com',
      ];

  const ok =
    allowedHosts.includes(host) ||
    host.endsWith('.inneranimalmedia.com') ||
    host.endsWith('.cloudflareaccess.com');
  if (!ok) return { ok: false, error: 'redirect_uri_not_allowed', url: null };

  return { ok: true, error: null, url: u };
}

/** @deprecated Use mcpOAuthValidateRedirectUri */
export function mcpOAuthAllowedRedirectUri(raw, env) {
  return mcpOAuthValidateRedirectUri(raw, null, env);
}

export function mcpOAuthSafePathWithSearch(url) {
  return `${url.pathname}${url.search || ''}`;
}

/**
 * Curated tool keys for external OAuth MCP clients (Claude, ChatGPT).
 * Source: agentsam_mcp_oauth_tool_allowlist (migration 403).
 */
export async function loadMcpOAuthExternalToolKeys(env, clientId = MCP_CANONICAL_CLIENT_ID) {
  if (!env?.DB) return null;
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_key
         FROM agentsam_mcp_oauth_tool_allowlist
        WHERE client_id = ?
          AND COALESCE(is_active, 1) = 1
        ORDER BY sort_order ASC, tool_key ASC`,
    )
      .bind(String(clientId || MCP_CANONICAL_CLIENT_ID))
      .all();
    const keys = (results || [])
      .map((r) => String(r.tool_key || '').trim())
      .filter(Boolean);
    return keys.length ? keys : null;
  } catch (_) {
    return null;
  }
}

/** JSON array for mcp_workspace_tokens.allowed_tools at OAuth token issue. */
export async function loadMcpOAuthExternalAllowedToolsJson(env, clientId = MCP_CANONICAL_CLIENT_ID) {
  const keys = await loadMcpOAuthExternalToolKeys(env, clientId);
  return keys?.length ? JSON.stringify(keys) : null;
}

/** Workspace github_repo + repo_path for MCP token rows (per-user isolation). */
export async function loadWorkspaceMcpTokenBindings(env, workspaceId) {
  if (!env?.DB || !workspaceId) return { github_repo: null, repo_path: null, tenant_id: null };
  try {
    const row = await env.DB.prepare(
      `SELECT tenant_id, github_repo, settings_json
         FROM workspaces
        WHERE id = ?
        LIMIT 1`,
    )
      .bind(String(workspaceId))
      .first();
    if (!row) return { github_repo: null, repo_path: null, tenant_id: null };
    let repoPath = null;
    try {
      const settings = row.settings_json ? JSON.parse(row.settings_json) : {};
      repoPath = settings?.repo_path || settings?.local_repo_path || null;
    } catch (_) {}
    let gh = String(row.github_repo || '').trim();
    gh = gh.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    return {
      tenant_id: row.tenant_id || null,
      github_repo: gh || null,
      repo_path: repoPath,
    };
  } catch (_) {
    return { github_repo: null, repo_path: null, tenant_id: null };
  }
}
