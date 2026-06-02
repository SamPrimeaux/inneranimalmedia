/**
 * Credential resolver — reads auth_source from handler_config JSON (agentsam_tools / agentsam_commands).
 * Routes to Worker env bindings (platform), or user_* D1 tables. No new tables.
 *
 * Canonical lanes:
 *   platform → env.DB / env.HYPERDRIVE / bindings (operator-gated; row-level user_id in executor)
 *   oauth    → user_oauth_tokens
 *   api_key  → user_api_keys
 *   secret   → user_secrets
 *   mcp      → mcp_workspace_tokens (+ AGENTSAM_BRIDGE_KEY for bridge transport)
 */
import { getIntegrationOAuthRow } from './user-oauth-token.js';
import { getAESKey, aesGcmDecryptFromB64 } from './crypto-vault.js';
import { validateMcpToken } from './mcp-auth.js';

/** @typedef {'platform'|'platform_scoped'|'oauth'|'api_key'|'secret'|'mcp'} CanonicalAuthSource */

const AUTH_SOURCE_ALIASES = {
  platform: 'platform',
  platform_scoped: 'platform_scoped',
  oauth: 'oauth',
  user_oauth_tokens: 'oauth',
  api_key: 'api_key',
  user_api_keys: 'api_key',
  secret: 'secret',
  user_secrets: 'secret',
  mcp: 'mcp',
  /** Per-tenant tools: resolve via provider in handler_config (cloudflare, supabase, …). */
  workspace: 'workspace',
};

const AUTH_SOURCES = new Set(Object.keys(AUTH_SOURCE_ALIASES));

/**
 * @param {unknown} raw
 * @returns {CanonicalAuthSource|string}
 */
export function normalizeAuthSource(raw) {
  const s = String(raw || '').trim();
  return AUTH_SOURCE_ALIASES[s] || s;
}

/** @param {unknown} raw */
export function parseHandlerConfig(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ ({ ...raw });
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t || t === '{}') return {};
    try {
      const o = JSON.parse(t);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

function requireScopeIds(workspaceId, tenantId) {
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  const tid = tenantId != null ? String(tenantId).trim() : '';
  if (!ws || !tid) {
    throw new Error('[resolveCredential] platform_scoped requires workspace_id and tenant_id');
  }
  return { workspaceId: ws, tenantId: tid };
}

function pickEnvKey(config) {
  const keys = ['env_key', 'secret_key', 'auth_secret'];
  for (const k of keys) {
    const v = config[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/**
 * Platform auth_source is operator / internal-agent only — never raw user credential access to env.*.
 * @param {Record<string, unknown>} opts
 */
function assertPlatformCredentialAllowed(opts) {
  const isOperator = opts.isOperatorCall === true || opts.is_operator_call === true;
  const isInternal = opts.isInternalAgent === true || opts.is_internal_agent === true;
  if (!isOperator && !isInternal) {
    throw new Error('platform auth_source not permitted for user tool calls');
  }
}

/**
 * Worker-local catalog tools (filesystem, workspace grep) — no Wrangler secret.
 * @param {Record<string, unknown>} config
 * @param {string|null} binding
 */
function isPlatformInternalWorkerTool(config, binding) {
  if (config.platform_bindingless === true || config.platform_bindingless === 1) return true;
  if (String(binding || '').toLowerCase() === 'internal') return true;
  if (String(config.mcp_server || '').trim() !== '') return true;
  const op = String(config.operation || '').toLowerCase();
  const dispatcher = String(config.dispatcher || '').trim();
  if (['read', 'list', 'grep', 'search'].includes(op) && !pickEnvKey(config)) return true;
  if (dispatcher === 'fs_search_files' || config.execution_lane === 'workspace_grep') return true;
  return false;
}

function readPlatformEnv(env, config) {
  const envKey = pickEnvKey(config);
  const binding =
    config.binding != null && String(config.binding).trim() !== ''
      ? String(config.binding).trim()
      : null;
  if (!envKey && isPlatformInternalWorkerTool(config, binding)) {
    return {
      auth_source: 'platform',
      env_key: null,
      binding: binding || 'internal',
      value: null,
    };
  }
  if (envKey) {
    const value = env?.[envKey];
    if (value == null || String(value).trim() === '') {
      throw new Error(`[resolveCredential] platform env missing: ${envKey}`);
    }
    return {
      auth_source: 'platform',
      env_key: envKey,
      binding,
      value: String(value),
    };
  }
  if (binding) {
    const bound = env?.[binding];
    if (bound == null) {
      return { auth_source: 'platform', env_key: null, binding, value: null };
    }
    return {
      auth_source: 'platform',
      env_key: null,
      binding,
      value: typeof bound === 'string' ? bound : bound,
    };
  }
  if (config.platform_bindingless === true || config.platform_bindingless === 1) {
    return { auth_source: 'platform', env_key: null, binding: null, value: null };
  }
  throw new Error('[resolveCredential] platform requires env_key, secret_key, auth_secret, or binding');
}

async function pragmaColumns(db, tableName) {
  const out = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const cols = new Set();
  for (const row of out.results || []) cols.add(String(row.name || '').toLowerCase());
  return cols;
}

/**
 * @param {any} env
 * @param {string} uid
 * @param {string} tid
 * @param {string} ws
 * @param {Record<string, unknown>} opts
 */
async function resolveMcpCredential(env, uid, tid, ws, opts) {
  const bridgeKey = env?.AGENTSAM_BRIDGE_KEY != null ? String(env.AGENTSAM_BRIDGE_KEY).trim() : '';
  if (!bridgeKey) {
    throw new Error('[resolveCredential] mcp auth requires AGENTSAM_BRIDGE_KEY Worker binding');
  }
  if (!ws) {
    throw new Error('[resolveCredential] mcp requires workspace_id in context');
  }

  const bearer = opts.mcpBearer ?? opts.mcp_bearer ?? null;
  if (bearer != null && String(bearer).trim() !== '') {
    const ctx = await validateMcpToken(env, String(bearer).trim());
    if (!ctx?.userId || ctx.userId !== uid) {
      throw new Error('[resolveCredential] mcp bearer invalid for user');
    }
    if (ctx.tenantId && tid && String(ctx.tenantId) !== tid) {
      throw new Error('[resolveCredential] mcp bearer tenant mismatch');
    }
    if (ctx.workspaceId && ws && String(ctx.workspaceId) !== ws) {
      throw new Error('[resolveCredential] mcp bearer workspace mismatch');
    }
    return {
      auth_source: 'mcp',
      token_id: ctx.tokenId ?? null,
      allowed_tools: ctx.allowedTools ?? null,
      token_type: ctx.tokenType ?? 'user',
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws,
      value: null,
    };
  }

  const row = await env.DB.prepare(
    `SELECT id, token_hash, allowed_tools, rate_limit_per_hour, expires_at, is_active
     FROM mcp_workspace_tokens
     WHERE user_id = ? AND tenant_id = ? AND workspace_id = ?
       AND COALESCE(is_active, 1) = 1
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(uid, tid, ws)
    .first();

  if (!row?.id) {
    throw new Error('[resolveCredential] no active mcp_workspace_tokens row for user/workspace');
  }
  if (row.expires_at && Number(row.expires_at) < Math.floor(Date.now() / 1000)) {
    throw new Error('[resolveCredential] mcp workspace token expired');
  }

  return {
    auth_source: 'mcp',
    token_id: String(row.id),
    allowed_tools: row.allowed_tools ? JSON.parse(String(row.allowed_tools)) : null,
    rate_limit_per_hour: row.rate_limit_per_hour ?? null,
    user_id: uid,
    tenant_id: tid,
    workspace_id: ws,
    value: null,
  };
}

/**
 * @param {any} env
 * @param {string|null|undefined} workspaceId
 * @param {string|null|undefined} tenantId
 * @param {unknown} handlerConfig
 * @param {{
 *   userId?: string|null,
 *   user_id?: string|null,
 *   account_identifier?: string,
 *   isOperatorCall?: boolean,
 *   is_operator_call?: boolean,
 *   isInternalAgent?: boolean,
 *   is_internal_agent?: boolean,
 *   mcpBearer?: string|null,
 *   mcp_bearer?: string|null,
 * }} [opts]
 */
export async function resolveCredential(env, workspaceId, tenantId, handlerConfig, opts = {}) {
  const config = parseHandlerConfig(handlerConfig);
  const authSourceRaw = String(config.auth_source || '').trim();
  const authSource = normalizeAuthSource(authSourceRaw);

  if (!AUTH_SOURCES.has(authSourceRaw) && !Object.values(AUTH_SOURCE_ALIASES).includes(authSource)) {
    throw new Error(
      `[resolveCredential] invalid auth_source="${authSourceRaw}" — expected one of platform, oauth, api_key, secret, mcp (or legacy user_* aliases)`,
    );
  }

  if (authSource === 'platform') {
    assertPlatformCredentialAllowed(opts);
    return readPlatformEnv(env, config);
  }

  if (authSource === 'platform_scoped') {
    assertPlatformCredentialAllowed(opts);
    requireScopeIds(workspaceId, tenantId);
    const resolved = readPlatformEnv(env, config);
    return {
      ...resolved,
      auth_source: 'platform_scoped',
      workspace_id: String(workspaceId).trim(),
      tenant_id: String(tenantId).trim(),
    };
  }

  const userId = opts.userId ?? opts.user_id ?? null;
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid) {
    throw new Error(`[resolveCredential] ${authSource} requires user_id in context`);
  }
  const tid = tenantId != null ? String(tenantId).trim() : '';
  if (!tid) {
    throw new Error(`[resolveCredential] ${authSource} requires tenant_id`);
  }
  const ws = workspaceId != null ? String(workspaceId).trim() : '';

  if (authSource === 'oauth') {
    const provider = String(config.provider || config.oauth_provider || '').trim();
    if (!provider) {
      throw new Error('[resolveCredential] oauth requires provider in handler_config');
    }
    const accountId =
      config.account_identifier != null ? String(config.account_identifier) : opts.account_identifier ?? '';
    const row = await getIntegrationOAuthRow(env, uid, provider, accountId);
    if (!row?.access_token) {
      throw new Error(`[resolveCredential] no OAuth token for provider=${provider}`);
    }
    if (row.tenant_id != null && String(row.tenant_id).trim() !== '' && String(row.tenant_id) !== tid) {
      throw new Error('[resolveCredential] OAuth token tenant mismatch');
    }
    if (
      ws &&
      row.workspace_id != null &&
      String(row.workspace_id).trim() !== '' &&
      String(row.workspace_id) !== ws
    ) {
      throw new Error('[resolveCredential] OAuth token workspace mismatch');
    }
    return {
      auth_source: 'oauth',
      provider,
      account_identifier: accountId,
      value: String(row.access_token),
      refresh_token: row.refresh_token ? String(row.refresh_token) : null,
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws || null,
    };
  }

  if (authSource === 'api_key') {
    const provider = String(config.provider || '').trim().toLowerCase();
    if (!provider) {
      throw new Error('[resolveCredential] api_key requires provider in handler_config');
    }
    const cols = await pragmaColumns(env.DB, 'user_api_keys');
    const selectParts = ['id', 'provider', 'workspace_id'];
    if (cols.has('key_hash')) selectParts.push('key_hash');
    if (cols.has('encrypted_value')) selectParts.push('encrypted_value');
    if (cols.has('vault_secret_id')) selectParts.push('vault_secret_id');
    if (cols.has('key_preview')) selectParts.push('key_preview');

    const row = await env.DB.prepare(
      `SELECT ${selectParts.join(', ')}
       FROM user_api_keys
       WHERE user_id = ? AND LOWER(provider) = LOWER(?)
         AND COALESCE(is_active, 1) = 1
         AND (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?)
         AND (workspace_id IS NULL OR workspace_id = '' OR workspace_id = ?)
       ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 1`,
    )
      .bind(uid, provider, tid, ws, ws)
      .first();

    if (!row) {
      throw new Error(`[resolveCredential] no user_api_keys row for provider=${provider}`);
    }

    let value = null;
    if (row.vault_secret_id) {
      const secretRow = await env.DB.prepare(
        `SELECT secret_value_encrypted FROM user_secrets
         WHERE id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
      )
        .bind(String(row.vault_secret_id), uid)
        .first();
      if (secretRow?.secret_value_encrypted) {
        const { vaultDecrypt } = await import('../api/vault.js');
        value = await vaultDecrypt(env, secretRow.secret_value_encrypted);
      }
    }
    if (!value && row.encrypted_value) {
      const aesKey = await getAESKey(env, ['decrypt']);
      value = await aesGcmDecryptFromB64(row.encrypted_value, aesKey);
    }
    if (!value && row.key_hash) {
      const aesKey = await getAESKey(env, ['decrypt']);
      value = await aesGcmDecryptFromB64(row.key_hash, aesKey);
    }
    if (!value) {
      throw new Error(`[resolveCredential] decrypt failed for user_api_keys provider=${provider}`);
    }

    return {
      auth_source: 'api_key',
      provider,
      value: String(value),
      key_preview: row.key_preview ?? null,
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws || row.workspace_id || null,
    };
  }

  if (authSource === 'secret') {
    const secretName = String(config.secret_name || config.secret_key || '').trim();
    if (!secretName) {
      throw new Error('[resolveCredential] secret requires secret_name in handler_config');
    }
    const projectLabel =
      config.project_label != null ? String(config.project_label).trim() : null;
    let sql = `SELECT id, secret_value_encrypted, workspace_id, vault_secret_id FROM user_secrets
      WHERE user_id = ? AND secret_name = ? AND COALESCE(is_active, 1) = 1`;
    const binds = [uid, secretName];
    if (tid) {
      sql += ' AND (tenant_id IS NULL OR tenant_id = ? OR tenant_id = \'\')';
      binds.push(tid);
    }
    if (projectLabel) {
      sql += ' AND project_label = ?';
      binds.push(projectLabel);
    }
    sql += ` AND (workspace_id IS NULL OR workspace_id = '' OR workspace_id = ?)
      ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`;
    binds.push(ws, ws);
    const row = await env.DB.prepare(sql).bind(...binds).first();
    if (!row?.secret_value_encrypted && !row?.vault_secret_id) {
      throw new Error(`[resolveCredential] no user_secrets row for secret_name=${secretName}`);
    }
    let value = null;
    if (row.secret_value_encrypted) {
      const { vaultDecrypt } = await import('../api/vault.js');
      value = await vaultDecrypt(env, row.secret_value_encrypted);
    } else if (row.vault_secret_id) {
      const linked = await env.DB.prepare(
        `SELECT secret_value_encrypted FROM user_secrets WHERE id = ? AND user_id = ? LIMIT 1`,
      )
        .bind(String(row.vault_secret_id), uid)
        .first();
      if (linked?.secret_value_encrypted) {
        const { vaultDecrypt } = await import('../api/vault.js');
        value = await vaultDecrypt(env, linked.secret_value_encrypted);
      }
    }
    if (!value) {
      throw new Error(`[resolveCredential] decrypt failed for secret_name=${secretName}`);
    }
    return {
      auth_source: 'secret',
      secret_name: secretName,
      project_label: projectLabel,
      value: String(value),
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws || row.workspace_id || null,
    };
  }

  if (authSource === 'mcp') {
    return resolveMcpCredential(env, uid, tid, ws, opts);
  }

  if (authSource === 'workspace') {
    const provider = String(
      config.provider || config.credential_provider || config.integration || '',
    )
      .trim()
      .toLowerCase();
    if (provider === 'cloudflare' || provider === 'supabase' || provider) {
      return resolveCredential(env, workspaceId, tenantId, {
        ...config,
        auth_source: 'api_key',
        provider: provider || 'cloudflare',
      }, opts);
    }
    return {
      auth_source: 'workspace',
      provider: provider || null,
      value: null,
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws || null,
    };
  }

  throw new Error(`[resolveCredential] unhandled auth_source=${authSource}`);
}
