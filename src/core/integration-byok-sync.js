/**
 * Integration ↔ BYOK spine: API keys from Integrations settings land in user_api_keys + user_secrets
 * (same path as Keys & Secrets), not user_oauth_tokens or raw SHA-256 hashes.
 */
import { fetchAuthUserTenantId, fallbackSystemTenantId } from './auth.js';
import { encryptApiKeyForStorage } from '../api/provisioning.js';
import { handleKeySecurityAfterOp, canonicalUserSecretId } from './keys-security.js';
import { validateProviderKey, normalizeApiKeySecret } from './secret-validators.js';
import { resolveIntegrationUserId } from './integration-user-id.js';

/** integration_catalog / integration_registry provider_key → user_api_keys.provider */
export const INTEGRATION_TO_BYOK_PROVIDER = {
  openai: 'openai',
  anthropic: 'anthropic',
  google_ai: 'google',
  resend: 'resend',
  cursor: 'cursor',
  supabase: 'supabase',
  claude_code: 'anthropic',
};

const API_KEY_INTEGRATION_SLUGS = new Set(Object.keys(INTEGRATION_TO_BYOK_PROVIDER));

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

function lastFourOfKey(apiKey) {
  const s = String(apiKey || '');
  if (s.length < 4) return '????';
  return s.slice(-4);
}

async function pragmaColumns(db, tableName) {
  const out = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const cols = new Set();
  for (const row of out.results || []) cols.add(String(row.name || '').toLowerCase());
  return cols;
}

function has(cols, name) {
  return cols.has(String(name).toLowerCase());
}

export function normalizeIntegrationSlug(slug) {
  return String(slug || '').trim().toLowerCase().replace(/-/g, '_');
}

export function integrationRegistryProviderKey(slug) {
  return normalizeIntegrationSlug(slug);
}

export function integrationSlugToByokProvider(slug) {
  const key = integrationRegistryProviderKey(slug);
  return INTEGRATION_TO_BYOK_PROVIDER[key] || null;
}

export function isApiKeyIntegrationSlug(slug) {
  return API_KEY_INTEGRATION_SLUGS.has(integrationRegistryProviderKey(slug));
}

async function resolveTenantId(env, authUser, userId) {
  let tenantId =
    authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : '';
  if (!tenantId && userId) {
    tenantId = String((await fetchAuthUserTenantId(env, userId)) || '').trim();
  }
  if (!tenantId && env?.TENANT_ID) tenantId = String(env.TENANT_ID).trim();
  if (!tenantId) tenantId = fallbackSystemTenantId(env);
  return tenantId;
}

/** OAuth token provider names used for legacy API-key-as-oauth rows */
function legacyOauthProvidersForIntegration(slug) {
  const key = integrationRegistryProviderKey(slug);
  const out = new Set([key]);
  if (key === 'google_ai') out.add('google');
  if (key === 'supabase') out.add('supabase_management');
  return [...out];
}

async function deleteLegacyOauthApiKeyTokens(db, userId, integrationSlug) {
  for (const p of legacyOauthProvidersForIntegration(integrationSlug)) {
    try {
      await db
        .prepare(`DELETE FROM user_oauth_tokens WHERE user_id = ? AND LOWER(provider) = LOWER(?)`)
        .bind(userId, p)
        .run();
    } catch {
      /* ignore */
    }
  }
}

/**
 * @returns {Promise<boolean>}
 */
export async function hasActiveByokForIntegration(env, tenantId, userId, integrationSlug) {
  if (!env?.DB || !tenantId || !userId) return false;
  const registryKey = integrationRegistryProviderKey(integrationSlug);
  const byokProvider = integrationSlugToByokProvider(registryKey);
  if (!byokProvider) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT id FROM user_api_keys
       WHERE tenant_id = ? AND user_id = ? AND provider = ? AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(tenantId, userId, byokProvider)
      .first();
    return !!row?.id;
  } catch {
    return false;
  }
}

/**
 * Upsert provider API key from Integrations UI (canonical BYOK spine).
 */
export async function upsertIntegrationByokKey(env, authUser, integrationSlug, apiKey, opts = {}) {
  const db = env?.DB;
  if (!db) throw new Error('DB not configured');

  const registryKey = integrationRegistryProviderKey(integrationSlug);
  let byokProvider = integrationSlugToByokProvider(registryKey);
  if (!byokProvider && opts.allowUnknownSlug) {
    byokProvider = registryKey;
  }
  if (!byokProvider) throw new Error('unsupported_provider');

  const userId = await resolveIntegrationUserId(env, authUser);
  if (!userId) throw new Error('User id required');

  const tenantId = await resolveTenantId(env, authUser, userId);
  const normalizedKey = normalizeApiKeySecret(apiKey);
  if (!normalizedKey) throw new Error('api_key required');

  const validate = opts.validate !== false && integrationSlugToByokProvider(registryKey) != null;
  if (validate) {
    const vr = await validateProviderKey(byokProvider, normalizedKey, env, {});
    if (!vr.ok) throw new Error(vr.error || 'Invalid API key — check and retry');
  }

  const last_four = lastFourOfKey(normalizedKey);
  const encrypted = await encryptApiKeyForStorage(env, normalizedKey);
  if (!encrypted) throw new Error('Could not encrypt secret value');

  const effectiveLabel =
    String(opts.label || '').trim() ||
    (registryKey === 'google_ai' ? 'Google AI' : registryKey.replace(/_/g, ' '));

  const uakCols = await pragmaColumns(db, 'user_api_keys');
  const sCols = await pragmaColumns(db, 'user_secrets');

  const existing = await db
    .prepare(
      `SELECT id, vault_secret_id, label, metadata_json
       FROM user_api_keys
       WHERE tenant_id = ? AND user_id = ? AND provider = ?
         AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
    .bind(tenantId, userId, byokProvider)
    .first()
    .catch(() => null);

  let keyRowId = existing?.id ? String(existing.id) : newId('uak');
  let vaultSecretId =
    existing?.vault_secret_id != null && String(existing.vault_secret_id).trim()
      ? String(existing.vault_secret_id).trim()
      : newId('sec');

  const metaBase = {
    api_key_id: keyRowId,
    provider: byokProvider,
    integration_slug: registryKey,
    label: effectiveLabel,
    last_four,
    source: opts.source || 'integrations',
  };

  if (existing?.id && vaultSecretId) {
    const sets = [];
    const binds = [];
    if (has(sCols, 'secret_value_encrypted')) {
      sets.push('secret_value_encrypted = ?');
      binds.push(encrypted);
    }
    if (has(sCols, 'metadata_json')) {
      sets.push('metadata_json = ?');
      binds.push(JSON.stringify(metaBase));
    }
    if (has(sCols, 'updated_at')) {
      sets.push('updated_at = ?');
      binds.push(nowIso());
    }
    if (has(sCols, 'is_active')) {
      sets.push('is_active = 1');
    }
    if (sets.length) {
      const where = ['id = ?', 'user_id = ?', 'tenant_id = ?'];
      const wBinds = [vaultSecretId, userId, tenantId];
      await db
        .prepare(`UPDATE user_secrets SET ${sets.join(', ')} WHERE ${where.join(' AND ')}`)
        .bind(...binds, ...wBinds)
        .run();
    }

    const updates = [];
    const uBinds = [];
    if (has(uakCols, 'last_four')) {
      updates.push('last_four = ?');
      uBinds.push(last_four);
    }
    if (has(uakCols, 'key_preview')) {
      updates.push('key_preview = ?');
      uBinds.push(last_four);
    }
    if (has(uakCols, 'label')) {
      updates.push('label = ?');
      uBinds.push(effectiveLabel);
    }
    if (has(uakCols, 'key_name')) {
      updates.push('key_name = ?');
      uBinds.push(effectiveLabel);
    }
    if (has(uakCols, 'metadata_json')) {
      updates.push('metadata_json = ?');
      uBinds.push(JSON.stringify(metaBase));
    }
    if (has(uakCols, 'status')) {
      updates.push('status = ?');
      uBinds.push('active');
    }
    if (has(uakCols, 'updated_at')) {
      updates.push('updated_at = ?');
      uBinds.push(nowIso());
    }
    if (updates.length) {
      await db
        .prepare(
          `UPDATE user_api_keys SET ${updates.join(', ')}
           WHERE id = ? AND user_id = ? AND tenant_id = ?`,
        )
        .bind(...uBinds, keyRowId, userId, tenantId)
        .run();
    }
  } else {
    const secretFields = [
      ['id', vaultSecretId],
      ['user_id', userId],
      ['tenant_id', tenantId],
      ...(has(sCols, 'workspace_id') ? [['workspace_id', null]] : []),
      ['secret_name', `api_key:${byokProvider}:${keyRowId}`],
      ['secret_value_encrypted', encrypted],
      ['service_name', byokProvider],
      ['description', effectiveLabel],
      ['project_label', 'user_api_keys'],
      ['metadata_json', JSON.stringify(metaBase)],
      ['is_active', 1],
      ['created_at', nowIso()],
      ['updated_at', nowIso()],
    ].filter(([c]) => has(sCols, c));

    await db
      .prepare(
        `INSERT INTO user_secrets (${secretFields.map(([c]) => c).join(', ')})
         VALUES (${secretFields.map(() => '?').join(', ')})`,
      )
      .bind(...secretFields.map(([, v]) => v))
      .run();

    const fields = [
      ['id', keyRowId],
      ['tenant_id', tenantId],
      ['user_id', userId],
      ...(has(uakCols, 'workspace_id') ? [['workspace_id', null]] : []),
      ...(has(uakCols, 'category') ? [['category', 'provider']] : []),
      ['provider', byokProvider],
      ...(has(uakCols, 'label') ? [['label', effectiveLabel]] : []),
      ...(has(uakCols, 'key_name') ? [['key_name', effectiveLabel]] : []),
      ...(has(uakCols, 'status') ? [['status', 'active']] : []),
      ...(has(uakCols, 'scope') ? [['scope', 'user']] : []),
      ...(has(uakCols, 'last_four') ? [['last_four', last_four]] : []),
      ...(has(uakCols, 'key_preview') ? [['key_preview', last_four]] : []),
      ...(has(uakCols, 'vault_secret_id') ? [['vault_secret_id', vaultSecretId]] : []),
      ...(has(uakCols, 'metadata_json') ? [['metadata_json', JSON.stringify(metaBase)]] : []),
      ...(has(uakCols, 'created_at') ? [['created_at', nowIso()]] : []),
      ...(has(uakCols, 'updated_at') ? [['updated_at', nowIso()]] : []),
      ...(has(uakCols, 'is_active') ? [['is_active', 1]] : []),
    ].filter(([c]) => has(uakCols, c));

    await db
      .prepare(
        `INSERT INTO user_api_keys (${fields.map(([c]) => c).join(', ')})
         VALUES (${fields.map(() => '?').join(', ')})`,
      )
      .bind(...fields.map(([, v]) => v))
      .run();
  }

  const apiKeyRow = {
    id: keyRowId,
    vault_secret_id: vaultSecretId,
    provider: byokProvider,
    metadata_json: JSON.stringify(metaBase),
  };

  await handleKeySecurityAfterOp(env, {
    operation: existing?.id ? 'rotate' : 'create',
    secretId: canonicalUserSecretId(apiKeyRow) || vaultSecretId,
    apiKeyId: keyRowId,
    apiKeyRow,
    tenantId,
    userId,
    workspaceId: null,
    provider: byokProvider,
    plaintextKey: normalizedKey,
    encryptOk: true,
    newLast4: last_four,
    triggeredBy: opts.triggeredBy || 'integrations_connect',
    notes: `${existing?.id ? 'Rotated' : 'Connected'} integration key (${registryKey})`,
  });

  await deleteLegacyOauthApiKeyTokens(db, userId, registryKey);

  const accountDisplay = `••••${last_four}`;
  try {
    await db
      .prepare(
        `UPDATE integration_registry
         SET status = 'connected', account_display = ?, updated_at = datetime('now')
         WHERE tenant_id = ? AND LOWER(provider_key) = LOWER(?)`,
      )
      .bind(accountDisplay, tenantId, registryKey)
      .run();
  } catch {
    /* registry row may be missing until seed */
  }

  return {
    ok: true,
    api_key_id: keyRowId,
    provider: byokProvider,
    integration_slug: registryKey,
    account_display: accountDisplay,
  };
}

/**
 * Revoke BYOK row for an integration slug and mark registry disconnected.
 */
export async function revokeIntegrationByokKey(env, authUser, integrationSlug) {
  const db = env?.DB;
  if (!db) return { ok: false, error: 'DB not configured' };

  const registryKey = integrationRegistryProviderKey(integrationSlug);
  const byokProvider = integrationSlugToByokProvider(registryKey);
  const userId = await resolveIntegrationUserId(env, authUser);
  if (!userId) return { ok: false, error: 'User id required' };

  const tenantId = await resolveTenantId(env, authUser, userId);

  if (byokProvider) {
    const uakCols = await pragmaColumns(db, 'user_api_keys');
    const row = await db
      .prepare(
        `SELECT id, vault_secret_id FROM user_api_keys
         WHERE tenant_id = ? AND user_id = ? AND provider = ?
         LIMIT 1`,
      )
      .bind(tenantId, userId, byokProvider)
      .first()
      .catch(() => null);

    if (row?.vault_secret_id) {
      const sCols = await pragmaColumns(db, 'user_secrets');
      const sets = [];
      const sBinds = [];
      if (has(sCols, 'is_active')) {
        sets.push('is_active = 0');
      }
      if (has(sCols, 'updated_at')) {
        sets.push('updated_at = ?');
        sBinds.push(nowIso());
      }
      if (sets.length) {
        try {
          await db
            .prepare(
              `UPDATE user_secrets SET ${sets.join(', ')}
               WHERE id = ? AND user_id = ? AND tenant_id = ?`,
            )
            .bind(...sBinds, String(row.vault_secret_id), userId, tenantId)
            .run();
        } catch {
          /* ignore */
        }
      }
    }

    if (row?.id) {
      const updates = [];
      const uBinds = [];
      if (has(uakCols, 'is_active')) {
        updates.push('is_active = 0');
      }
      if (has(uakCols, 'status')) {
        updates.push('status = ?');
        uBinds.push('revoked');
      }
      if (has(uakCols, 'updated_at')) {
        updates.push('updated_at = ?');
        uBinds.push(nowIso());
      }
      if (updates.length) {
        try {
          await db
            .prepare(
              `UPDATE user_api_keys SET ${updates.join(', ')}
               WHERE id = ? AND user_id = ? AND tenant_id = ?`,
            )
            .bind(...uBinds, String(row.id), userId, tenantId)
            .run();
        } catch {
          /* ignore */
        }
      }
    }
  }

  await deleteLegacyOauthApiKeyTokens(db, userId, registryKey);

  try {
    await db
      .prepare(
        `UPDATE integration_registry
         SET status = 'disconnected', account_display = NULL, updated_at = datetime('now')
         WHERE tenant_id = ? AND LOWER(provider_key) = LOWER(?)`,
      )
      .bind(tenantId, registryKey)
      .run();
  } catch {
    /* ignore */
  }

  return { ok: true, integration_slug: registryKey };
}
