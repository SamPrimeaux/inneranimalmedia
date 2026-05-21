/**
 * src/core/oauth-token-store.js
 * Neutral OAuth token writer — imported by both oauth.js and oauth-login-callbacks.js.
 * Extracted to eliminate circular dependency between those two modules.
 *
 * RULE: Do NOT import from src/api/oauth.js or src/api/oauth-login-callbacks.js.
 */

import { aesGcmDecryptFromB64, aesGcmEncryptToB64, getAESKey } from './crypto-vault.js';

async function pragmaColumns(DB, tableName) {
  const out = await DB.prepare(`PRAGMA table_info(${tableName})`).all();
  const cols = new Set();
  for (const row of out.results || []) cols.add(String(row.name || '').toLowerCase());
  return cols;
}

export async function ensureOauthTokenColumns(DB) {
  const cols = await pragmaColumns(DB, 'user_oauth_tokens');
  const alters = [];
  const want = [
    ['access_token_encrypted', 'TEXT'],
    ['refresh_token_encrypted', 'TEXT'],
    ['scopes', 'TEXT'],
    ['account_email', 'TEXT'],
    ['account_display', 'TEXT'],
    ['workspace_id', 'TEXT'],
    ['metadata_json', 'TEXT'],
    ['created_at', 'INTEGER'],
    ['updated_at', 'INTEGER'],
  ];
  for (const [name, type] of want) {
    if (!cols.has(name)) alters.push(`ALTER TABLE user_oauth_tokens ADD COLUMN ${name} ${type}`);
  }
  for (const sql of alters) {
    try { await DB.prepare(sql).run(); } catch { /* ignore older D1 schema edge-cases */ }
  }
  return await pragmaColumns(DB, 'user_oauth_tokens');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function encryptWithVault(env, plaintext) {
  const key = await getAESKey(env, ['encrypt']);
  return aesGcmEncryptToB64(plaintext, key);
}

async function decryptWithVault(env, encryptedB64) {
  const key = await getAESKey(env, ['decrypt']);
  return aesGcmDecryptFromB64(encryptedB64, key);
}

function normalizeProvider(provider) {
  const p = String(provider || '').trim().toLowerCase();
  if (p === 'gdrive' || p === 'google_drive' || p === 'google_gmail' || p === 'google_calendar') return 'google';
  return p;
}

function mapTokenProviderForStorage(provider) {
  const p = String(provider || '').trim().toLowerCase();
  if (p === 'google') return 'google_drive';
  if (p === 'supabase_management') return 'supabase_management';
  if (p === 'supabase_auth') return 'supabase_auth';
  return provider;
}

export async function upsertOauthToken(
  env,
  {
    user_id,
    tenant_id,
    person_uuid,
    provider,
    access_token,
    refresh_token,
    scope,
    expires_at,
    account_identifier,
    account_email,
    account_display,
    workspace_id,
    metadata_json,
  },
  opts = {},
) {
  const skipRegistry = !!opts.skipRegistry;
  if (!env?.DB) throw new Error('DB not configured');
  if (!env.VAULT_MASTER_KEY) throw new Error('VAULT_MASTER_KEY not configured');

  const cols = await ensureOauthTokenColumns(env.DB); // PRAGMA requirement before write
  const createdAt = nowSeconds();
  const updatedAt = createdAt;

  const providerForDb = mapTokenProviderForStorage(provider);
  const encryptedAccess = access_token ? await encryptWithVault(env, access_token) : null;
  const encryptedRefresh = refresh_token ? await encryptWithVault(env, refresh_token) : null;

  const hasEncrypted = cols.has('access_token_encrypted');
  const hasPlain = cols.has('access_token');

  // Prefer encrypted columns, but keep plaintext columns if they already exist and were historically used.
  const accessPlain = hasPlain && access_token ? access_token : null;
  const refreshPlain = cols.has('refresh_token') && refresh_token ? refresh_token : null;

  const scopesVal = scope || null;
  const driveCanonicalEmpty =
    providerForDb === 'google_drive' &&
    (account_identifier === '' ||
      (account_identifier == null && !(account_email && String(account_email).trim())));
  const accountIdVal = driveCanonicalEmpty
    ? ''
    : String(account_identifier ?? account_email ?? '').trim();

  if (!accountIdVal && !driveCanonicalEmpty) {
    throw new Error(`account_identifier missing for provider ${provider}`);
  }

  const sql = `
    INSERT OR REPLACE INTO user_oauth_tokens
      (user_id, tenant_id, person_uuid, provider, account_identifier,
       ${hasPlain ? 'access_token,' : ''} ${cols.has('refresh_token') ? 'refresh_token,' : ''}
       ${hasEncrypted ? 'access_token_encrypted, refresh_token_encrypted,' : ''}
       ${cols.has('scope') ? 'scope,' : ''} ${cols.has('scopes') ? 'scopes,' : ''}
       expires_at,
       ${cols.has('workspace_id') ? 'workspace_id,' : ''}
       ${cols.has('metadata_json') ? 'metadata_json,' : ''}
       ${cols.has('account_email') ? 'account_email,' : ''} ${cols.has('account_display') ? 'account_display,' : ''}
       ${cols.has('created_at') ? 'created_at,' : ''} ${cols.has('updated_at') ? 'updated_at,' : ''}
       created_at
      )
    VALUES (
      ?, ?, ?, ?, ?,
      ${hasPlain ? '?,' : ''} ${cols.has('refresh_token') ? '?,' : ''}
      ${hasEncrypted ? '?, ?,': ''}
      ${cols.has('scope') ? '?,' : ''} ${cols.has('scopes') ? '?,' : ''}
      ?,
      ${cols.has('workspace_id') ? '?,' : ''}
      ${cols.has('metadata_json') ? '?,' : ''}
      ${cols.has('account_email') ? '?,' : ''} ${cols.has('account_display') ? '?,' : ''}
      ${cols.has('created_at') ? '?,' : ''} ${cols.has('updated_at') ? '?,' : ''}
      ?
    )
  `.replace(/\s+/g, ' ').trim();

  const binds = [
    String(user_id),
    String(tenant_id || ''),
    String(person_uuid || ''),
    providerForDb,
    String(accountIdVal || providerForDb),
  ];
  if (hasPlain) binds.push(accessPlain);
  if (cols.has('refresh_token')) binds.push(refreshPlain);
  if (hasEncrypted) {
    binds.push(encryptedAccess);
    binds.push(encryptedRefresh);
  }
  if (cols.has('scope')) binds.push(scopesVal);
  if (cols.has('scopes')) binds.push(scopesVal);
  binds.push(expires_at || null);
  if (cols.has('workspace_id')) binds.push(workspace_id ?? null);
  if (cols.has('metadata_json')) binds.push(metadata_json ?? null);
  if (cols.has('account_email')) binds.push(account_email || null);
  if (cols.has('account_display')) binds.push(account_display || null);
  if (cols.has('created_at')) binds.push(createdAt);
  if (cols.has('updated_at')) binds.push(updatedAt);
  binds.push(createdAt);

  await env.DB.prepare(sql).bind(...binds).run();

  const registryKey =
    provider === 'cloudflare'
      ? 'cloudflare_oauth'
      : provider === 'supabase' || provider === 'supabase_management'
        ? 'supabase_oauth'
        : providerForDb;

  if (!skipRegistry) {
    try {
      await env.DB.prepare(
        `UPDATE integration_registry
         SET status = 'connected', account_display = COALESCE(?, account_display), updated_at = datetime('now')
         WHERE tenant_id = ? AND provider_key = ?`,
      )
        .bind(
          account_display || account_email || account_identifier || null,
          String(tenant_id || ''),
          registryKey,
        )
        .run();
    } catch {
      /* ignore */
    }

    try {
      await env.DB.prepare(
        `INSERT INTO integration_events (tenant_id, provider_key, event_type, actor, message, metadata_json)
         VALUES (?, ?, 'connected', ?, ?, ?)`,
      )
        .bind(
          String(tenant_id || ''),
          registryKey,
          String(user_id),
          'OAuth connection established',
          JSON.stringify({ account_display: account_display || null }),
        )
        .run();
    } catch {
      /* ignore */
    }
  }
}

export {
  nowSeconds,
  encryptWithVault,
  decryptWithVault,
  pragmaColumns,
  normalizeProvider,
  mapTokenProviderForStorage,
};