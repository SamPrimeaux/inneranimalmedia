/**
 * Credential resolver — reads auth_source from handler_config JSON (agentsam_tools / agentsam_commands).
 * Routes to env.* (platform), scoped env (platform_scoped), or user_* D1 tables. No new tables.
 */
import { getIntegrationOAuthRow } from './user-oauth-token.js';
import { getAESKey, aesGcmDecryptFromB64 } from './crypto-vault.js';

const AUTH_SOURCES = new Set([
  'platform',
  'platform_scoped',
  'user_oauth_tokens',
  'user_api_keys',
  'user_secrets',
]);

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

function readPlatformEnv(env, config) {
  const envKey = pickEnvKey(config);
  const binding =
    config.binding != null && String(config.binding).trim() !== ''
      ? String(config.binding).trim()
      : null;
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
  throw new Error('[resolveCredential] platform requires env_key, secret_key, auth_secret, or binding');
}

/**
 * @param {any} env
 * @param {string|null|undefined} workspaceId
 * @param {string|null|undefined} tenantId
 * @param {unknown} handlerConfig
 * @param {{ userId?: string|null, user_id?: string|null, account_identifier?: string }} [opts]
 */
export async function resolveCredential(env, workspaceId, tenantId, handlerConfig, opts = {}) {
  const config = parseHandlerConfig(handlerConfig);
  const authSource = String(config.auth_source || '').trim();
  if (!AUTH_SOURCES.has(authSource)) {
    throw new Error(
      `[resolveCredential] invalid auth_source="${authSource}" — expected one of ${[...AUTH_SOURCES].join(', ')}`,
    );
  }

  if (authSource === 'platform') {
    return readPlatformEnv(env, config);
  }

  if (authSource === 'platform_scoped') {
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

  if (authSource === 'user_oauth_tokens') {
    const provider = String(config.provider || config.oauth_provider || '').trim();
    if (!provider) {
      throw new Error('[resolveCredential] user_oauth_tokens requires provider in handler_config');
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
      auth_source: 'user_oauth_tokens',
      provider,
      account_identifier: accountId,
      value: String(row.access_token),
      refresh_token: row.refresh_token ? String(row.refresh_token) : null,
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws || null,
    };
  }

  if (authSource === 'user_api_keys') {
    const provider = String(config.provider || '').trim().toLowerCase();
    if (!provider) {
      throw new Error('[resolveCredential] user_api_keys requires provider in handler_config');
    }
    const row = await env.DB.prepare(
      `SELECT id, key_hash, key_preview, workspace_id, provider
       FROM user_api_keys
       WHERE tenant_id = ? AND user_id = ? AND LOWER(provider) = LOWER(?)
         AND COALESCE(is_active, 1) = 1
         AND (workspace_id IS NULL OR workspace_id = '' OR workspace_id = ?)
       ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 1`,
    )
      .bind(tid, uid, provider, ws, ws)
      .first();
    if (!row?.key_hash) {
      throw new Error(`[resolveCredential] no user_api_keys row for provider=${provider}`);
    }
    const aesKey = await getAESKey(env, ['decrypt']);
    const value = await aesGcmDecryptFromB64(row.key_hash, aesKey);
    return {
      auth_source: 'user_api_keys',
      provider,
      value: String(value),
      key_preview: row.key_preview ?? null,
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws || row.workspace_id || null,
    };
  }

  if (authSource === 'user_secrets') {
    const secretName = String(config.secret_name || config.secret_key || '').trim();
    if (!secretName) {
      throw new Error('[resolveCredential] user_secrets requires secret_name in handler_config');
    }
    const projectLabel =
      config.project_label != null ? String(config.project_label).trim() : null;
    let sql = `SELECT secret_value_encrypted, workspace_id FROM user_secrets
      WHERE tenant_id = ? AND user_id = ? AND secret_name = ? AND COALESCE(is_active, 1) = 1`;
    const binds = [tid, uid, secretName];
    if (projectLabel) {
      sql += ' AND project_label = ?';
      binds.push(projectLabel);
    }
    sql += ` AND (workspace_id IS NULL OR workspace_id = '' OR workspace_id = ?)
      ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`;
    binds.push(ws, ws);
    const row = await env.DB.prepare(sql).bind(...binds).first();
    if (!row?.secret_value_encrypted) {
      throw new Error(`[resolveCredential] no user_secrets row for secret_name=${secretName}`);
    }
    const { vaultDecrypt } = await import('../api/vault.js');
    const value = await vaultDecrypt(env, row.secret_value_encrypted);
    if (!value) {
      throw new Error(`[resolveCredential] decrypt failed for secret_name=${secretName}`);
    }
    return {
      auth_source: 'user_secrets',
      secret_name: secretName,
      project_label: projectLabel,
      value: String(value),
      user_id: uid,
      tenant_id: tid,
      workspace_id: ws || row.workspace_id || null,
    };
  }

  throw new Error(`[resolveCredential] unhandled auth_source=${authSource}`);
}
