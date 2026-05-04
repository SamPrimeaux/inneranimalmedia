/**
 * src/core/mcp-auth.js
 *
 * HMAC-based MCP token system.
 * One signing key (TOKEN_SIGNING_KEY wrangler secret).
 * Unlimited users. Zero per-user secrets.
 */

function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64DecodeUtf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Signs a payload with HMAC-SHA256 using TOKEN_SIGNING_KEY.
 * Returns hex string.
 */
async function signPayload(payload, signingKey) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Identity for env master tokens (MCP_AUTH_TOKEN / AGENTSAM_BRIDGE_KEY). Set MCP_AUTH_IDENTITY_USER_ID secret. */
function resolveMasterEnvIdentity(env) {
  const userId = String(env.MCP_AUTH_IDENTITY_USER_ID || '').trim();
  const workspaceId = String(env.WORKSPACE_ID || '').trim();
  const tenantId = String(env.TENANT_ID || '').trim();
  if (!userId || !workspaceId || !tenantId) return null;
  return { userId, workspaceId, tenantId };
}

/**
 * Generates a new MCP bearer token for a user.
 * Inserts into mcp_workspace_tokens.
 * Returns the bearer string — shown to user once only.
 */
export async function generateMcpToken(env, {
  userId, workspaceId, tenantId, label, allowedTools = null,
  rateLimitPerHour = 1000, expiresInDays = null
}) {
  if (!env?.TOKEN_SIGNING_KEY) throw new Error('TOKEN_SIGNING_KEY not set');

  const jti = 'tok_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const iat = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ userId, workspaceId, tenantId, iat, jti });
  const b64 = b64EncodeUtf8(payload);
  const hmac = await signPayload(b64, env.TOKEN_SIGNING_KEY);
  const bearer = `${b64}.${hmac}`;

  const expiresAt = expiresInDays
    ? Math.floor(Date.now() / 1000) + expiresInDays * 86400
    : null;

  await env.DB.prepare(`
    INSERT INTO mcp_workspace_tokens
      (id, workspace_id, tenant_id, label, token_hash,
       allowed_tools, rate_limit_per_hour, is_active, expires_at)
    VALUES (?,?,?,?,?,?,?,1,?)
  `).bind(
    jti, workspaceId, tenantId, label, hmac,
    allowedTools ? JSON.stringify(allowedTools) : null,
    rateLimitPerHour, expiresAt
  ).run();

  return { bearer, tokenId: jti };
}

/**
 * Validates an incoming MCP bearer token.
 * Returns full identity context or null.
 *
 * Validation order:
 *   1. Split bearer → b64 + hmac
 *   2. Recompute HMAC — reject if mismatch (tamper check)
 *   3. Decode payload → userId, workspaceId, tenantId, jti
 *   4. DB lookup by jti → is_active, allowed_tools, rate_limit
 *   5. Return identity
 */
export async function validateMcpToken(env, bearer) {
  if (!bearer) return null;

  // Legacy tokens (raw SHA256, no dot) — check DB directly
  // These are the two master tokens (MCP_AUTH_TOKEN, AGENTSAM_BRIDGE_KEY)
  // which are validated by the existing mechanism.
  // New user tokens always contain a dot.
  if (!bearer.includes('.')) {
    return validateLegacyToken(env, bearer);
  }

  if (!env?.TOKEN_SIGNING_KEY) return null;

  try {
    const dotIdx = bearer.lastIndexOf('.');
    const b64 = bearer.slice(0, dotIdx);
    const hmac = bearer.slice(dotIdx + 1);

    // Verify HMAC
    const expected = await signPayload(b64, env.TOKEN_SIGNING_KEY);
    if (expected !== hmac) return null;

    // Decode payload
    const payload = JSON.parse(b64DecodeUtf8(b64));
    const { userId, workspaceId, tenantId, jti } = payload;
    if (!jti || !userId) return null;

    // DB check — is_active + allowed_tools + rate_limit
    let row = null;
    try {
      row = await env.DB.prepare(`
      SELECT is_active, allowed_tools, rate_limit_per_hour, expires_at
      FROM mcp_workspace_tokens
      WHERE id = ? AND workspace_id = ? AND tenant_id = ?
      LIMIT 1
    `).bind(jti, workspaceId, tenantId).first();
    } catch (_) {
      return null;
    }

    if (!row?.is_active) return null;
    if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) return null;

    return {
      userId, workspaceId, tenantId, tokenId: jti,
      allowedTools: row.allowed_tools
        ? JSON.parse(row.allowed_tools) : null,
      rateLimitPerHour: row.rate_limit_per_hour,
      tokenType: 'user',
    };
  } catch { return null; }
}

/**
 * Legacy path: validates master tokens (MCP_AUTH_TOKEN, AGENTSAM_BRIDGE_KEY)
 * and old SHA256-hashed tokens in mcp_workspace_tokens.
 */
async function validateLegacyToken(env, bearer) {
  const master = resolveMasterEnvIdentity(env);

  // Check master env secrets first (no DB needed)
  if (env.MCP_AUTH_TOKEN && bearer === env.MCP_AUTH_TOKEN && master) {
    return {
      userId: master.userId,
      workspaceId: master.workspaceId,
      tenantId: master.tenantId,
      tokenType: 'master',
      allowedTools: null,
      rateLimitPerHour: null,
      tokenId: null,
    };
  }
  if (env.AGENTSAM_BRIDGE_KEY && bearer === env.AGENTSAM_BRIDGE_KEY && master) {
    return {
      userId: master.userId,
      workspaceId: master.workspaceId,
      tenantId: master.tenantId,
      tokenType: 'bridge',
      allowedTools: null,
      rateLimitPerHour: null,
      tokenId: null,
    };
  }

  // SHA256 hash check against DB (existing behavior)
  const hash = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(bearer)
  );
  const hexHash = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  let row = null;
  try {
    row = await env.DB.prepare(`
    SELECT id, workspace_id, tenant_id, allowed_tools,
           rate_limit_per_hour, is_active, expires_at
    FROM mcp_workspace_tokens
    WHERE token_hash = ? AND is_active = 1
    LIMIT 1
  `).bind(hexHash).first();
  } catch (_) {
    return null;
  }

  if (!row) return null;
  if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) return null;

  return {
    userId: null,
    workspaceId: row.workspace_id,
    tenantId: row.tenant_id,
    tokenId: row.id,
    allowedTools: row.allowed_tools ? JSON.parse(row.allowed_tools) : null,
    rateLimitPerHour: row.rate_limit_per_hour,
    tokenType: 'legacy',
  };
}
