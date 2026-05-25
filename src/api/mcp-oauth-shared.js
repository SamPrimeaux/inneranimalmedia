import { jsonResponse } from '../core/auth.js';

export const MCP_CANONICAL_CLIENT_ID = 'iam_mcp_inneranimalmedia';
export const IAM_OAUTH_ISSUER = 'https://inneranimalmedia.com';
export const IAM_MCP_RESOURCE_URL = 'https://mcp.inneranimalmedia.com/mcp';
export const MCP_OAUTH_CODE_TTL_SECONDS = 10 * 60;
/** OAuth access tokens — 24h (override per deploy via env.MCP_OAUTH_TOKEN_TTL_SECONDS). */
export const MCP_OAUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24;

export function resolveMcpOAuthTokenTtlSeconds(env) {
  const n = parseInt(String(env?.MCP_OAUTH_TOKEN_TTL_SECONDS ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : MCP_OAUTH_TOKEN_TTL_SECONDS;
}
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
  'https://chatgpt.com/connector/oauth/Fp4-o8x6PZh_',
];

/**
 * Infer external MCP host (Cursor, Claude, ChatGPT) from OAuth redirect_uri.
 * Used by MCP consent UI for app-appropriate copy and accents.
 */
export function resolveMcpConnectingApp(redirectUri) {
  const fallback = {
    key: 'default',
    label: 'your MCP client',
    badge: 'MCP',
    tagline: 'This allows your MCP client to use approved Inner Animal Media MCP tools.',
    return_hint: 'Return to your MCP client to continue.',
    accent: '#0969da',
  };

  const raw = String(redirectUri || '').trim();
  if (!raw) return fallback;

  let host = '';
  let path = '';
  try {
    const u = new URL(raw);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return fallback;
  }

  if (host === 'claude.ai' || host === 'claude.com') {
    return {
      key: 'claude',
      label: 'Claude.ai',
      badge: 'C',
      tagline: 'This allows Claude.ai to use approved Inner Animal Media MCP tools.',
      return_hint: 'Return to Claude.ai to finish connecting.',
      accent: '#d97757',
    };
  }

  if (
    host === 'chatgpt.com' ||
    host === 'chat.openai.com' ||
    path.includes('connector_platform_oauth') ||
    path.startsWith('/connector/oauth/')
  ) {
    return {
      key: 'chatgpt',
      label: 'ChatGPT',
      badge: 'GPT',
      tagline: 'This allows ChatGPT to use approved Inner Animal Media MCP tools.',
      return_hint: 'Return to ChatGPT to finish connecting.',
      accent: '#10a37f',
    };
  }

  if (host === 'mcp.inneranimalmedia.com' && path.includes('/auth/callback')) {
    return {
      key: 'cursor',
      label: 'Cursor',
      badge: '↗',
      tagline: 'This allows Cursor to use approved Inner Animal Media MCP tools.',
      return_hint: 'Return to Cursor — your connection will resume automatically.',
      accent: '#1a1a2e',
    };
  }

  return fallback;
}

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

/** Allowlist rows with access_class for OAuth token entitlements + MCP runtime guards. */
export async function loadMcpOAuthAllowlistRows(env, clientId = MCP_CANONICAL_CLIENT_ID) {
  if (!env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT tool_key, access_class
         FROM agentsam_mcp_oauth_tool_allowlist
        WHERE client_id = ?
          AND COALESCE(is_active, 1) = 1
        ORDER BY sort_order ASC, tool_key ASC`,
    )
      .bind(String(clientId || MCP_CANONICAL_CLIENT_ID))
      .all();
    return (results || []).map((r) => ({
      tool_key: String(r.tool_key || '').trim(),
      access_class: String(r.access_class || 'read').toLowerCase() === 'write' ? 'write' : 'read',
    })).filter((r) => r.tool_key);
  } catch (_) {
    return [];
  }
}

/**
 * Derive narrow token entitlements from granted OAuth scopes + client allowlist.
 * Avoids broad mcp.* / agent.* defaults on OAuth-issued rows.
 */
export async function buildMcpOAuthTokenEntitlements(env, clientId, grantedScopeStr, allowedToolKeys = null) {
  const scopes = mcpOAuthParseScopeList(grantedScopeStr);
  const scopeSet = new Set(scopes);
  let rows = await loadMcpOAuthAllowlistRows(env, clientId);
  if (Array.isArray(allowedToolKeys) && allowedToolKeys.length) {
    const allow = new Set(allowedToolKeys.map((k) => String(k || '').trim()).filter(Boolean));
    rows = rows.filter((r) => allow.has(r.tool_key));
  }

  const hasMcpTools = scopeSet.has('mcp:tools');
  const hasAgent = scopeSet.has('iam:agent');

  const capabilityKeys = [];
  if (scopeSet.has('iam:profile')) capabilityKeys.push('iam.profile.read');
  if (scopeSet.has('mcp:userinfo')) capabilityKeys.push('mcp.userinfo.read');
  if (hasMcpTools) capabilityKeys.push('mcp.tools.invoke.read');
  if (hasAgent && hasMcpTools) capabilityKeys.push('mcp.tools.invoke.write');

  const lanes = new Set();
  const riskLevels = new Set(['low']);
  let includesWrite = false;

  for (const row of rows) {
    if (!hasMcpTools) continue;
    if (row.access_class === 'write') {
      if (!hasAgent) continue;
      includesWrite = true;
      riskLevels.add('medium');
      riskLevels.add('high');
      lanes.add('operate');
    } else {
      lanes.add('general');
      lanes.add('inspect');
      riskLevels.add('medium');
    }
  }

  if (!lanes.size) {
    lanes.add('general');
    lanes.add('inspect');
  }

  if (!includesWrite) {
    riskLevels.delete('high');
  }

  return {
    capabilityKeys: capabilityKeys.length ? capabilityKeys : ['mcp.oauth.connected'],
    lanes: Array.from(lanes),
    riskLevels: Array.from(riskLevels),
    oauthToolAccess: Object.fromEntries(rows.map((r) => [r.tool_key, r.access_class])),
    oauthClientId: String(clientId || MCP_CANONICAL_CLIENT_ID),
  };
}

/** Map tool_key → access_class JSON for mcp_workspace_tokens.allowed_domains_json reuse. */
export function oauthToolAccessDomainsPayload(entitlements, policyMeta = {}) {
  return JSON.stringify({
    oauth_client_id: entitlements.oauthClientId,
    oauth_tool_access: entitlements.oauthToolAccess,
    require_allowlist_for_mcp: Number(policyMeta.require_allowlist_for_mcp || 0) === 1 ? 1 : 0,
    tool_risk_level_max: String(policyMeta.tool_risk_level_max || 'high'),
  });
}

/**
 * Intersect OAuth client allowlist with user agentsam_mcp_allowlist when policy requires it.
 */
export async function intersectOAuthToolsWithUserPolicy(env, scope, clientId) {
  const { filterOAuthToolKeysForUser } = await import('../core/mcp-oauth-user-policy.js');
  const oauthKeys = (await loadMcpOAuthExternalToolKeys(env, clientId)) || [];
  const { keys, policy, requireAllowlist } = await filterOAuthToolKeysForUser(env, scope, oauthKeys);
  return { keys, policy, requireAllowlist, oauthKeys };
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
