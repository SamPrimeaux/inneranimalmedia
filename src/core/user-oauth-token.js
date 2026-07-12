/**
 * Resolve OAuth tokens from D1 user_oauth_tokens with vault-id → encrypted → plaintext order,
 * optional Google refresh, and persistence after refresh.
 */
import { encryptWithVault, decryptWithVault } from './oauth-token-store.js';
import { isVaultConfigured } from './vault-key-material.js';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function pragmaColumns(DB, tableName) {
  const out = await DB.prepare(`PRAGMA table_info(${tableName})`).all();
  const cols = new Set();
  for (const row of out.results || []) cols.add(String(row.name || '').toLowerCase());
  return cols;
}

/** Map API aliases to provider column values in user_oauth_tokens. */
function mapIncomingProvider(provider) {
  const raw = String(provider || '').trim();
  const p = raw.toLowerCase();
  if (p === 'google' || p === 'gdrive' || p === 'google_drive') return 'google_drive';
  if (p === 'gmail' || p === 'google_gmail') return 'google_gmail';
  if (p === 'google_calendar' || p === 'gcal') return 'google_calendar';
  if (p === 'github') return 'github';
  return raw;
}

function googleOAuthClientSecret(env) {
  const a = typeof env?.GOOGLE_OAUTH_CLIENT_SECRET === 'string' ? env.GOOGLE_OAUTH_CLIENT_SECRET.trim() : '';
  if (a) return a;
  const b = typeof env?.GOOGLE_CLIENT_SECRET === 'string' ? env.GOOGLE_CLIENT_SECRET.trim() : '';
  return b;
}

/** Google OAuth integrations that use oauth2.googleapis.com refresh with a refresh_token. */
function isGoogleOAuthRefreshProvider(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'google_drive' || p === 'gmail' || p === 'google_gmail' || p === 'google_calendar') return true;
  if (p.startsWith('google_')) return true;
  return false;
}

async function decryptFromVaultSecretId(env, userId, secretId) {
  if (!secretId || !env?.DB) return null;
  const row = await env.DB.prepare(
    `SELECT secret_value_encrypted FROM user_secrets WHERE id = ? AND user_id = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(String(secretId), String(userId))
    .first();
  if (!row?.secret_value_encrypted) return null;
  try {
    return await decryptWithVault(env, row.secret_value_encrypted);
  } catch {
    return null;
  }
}

async function resolveAccessToken(env, userId, row, cols) {
  if (cols.has('vault_access_token_id') && row.vault_access_token_id) {
    const t = await decryptFromVaultSecretId(env, userId, row.vault_access_token_id);
    if (t) return t;
  }
  if (row.access_token_encrypted && isVaultConfigured(env)) {
    const t = await decryptWithVault(env, row.access_token_encrypted).catch(() => null);
    if (t) return t;
  }
  return row.access_token || null;
}

async function resolveRefreshToken(env, userId, row, cols) {
  if (cols.has('vault_refresh_token_id') && row.vault_refresh_token_id) {
    const t = await decryptFromVaultSecretId(env, userId, row.vault_refresh_token_id);
    if (t) return t;
  }
  if (row.refresh_token_encrypted && isVaultConfigured(env)) {
    const t = await decryptWithVault(env, row.refresh_token_encrypted).catch(() => null);
    if (t) return t;
  }
  return row.refresh_token || null;
}

async function fetchOAuthRow(env, userId, provider, accountIdentifier) {
  const DB = env.DB;
  const cols = await pragmaColumns(DB, 'user_oauth_tokens');
  const parts = ['provider', 'account_identifier', 'expires_at'];
  if (cols.has('updated_at')) parts.push('updated_at');
  if (cols.has('tenant_id')) parts.push('tenant_id');
  if (cols.has('person_uuid')) parts.push('person_uuid');
  if (cols.has('access_token')) parts.push('access_token');
  if (cols.has('refresh_token')) parts.push('refresh_token');
  if (cols.has('access_token_encrypted')) parts.push('access_token_encrypted');
  if (cols.has('refresh_token_encrypted')) parts.push('refresh_token_encrypted');
  if (cols.has('vault_access_token_id')) parts.push('vault_access_token_id');
  if (cols.has('vault_refresh_token_id')) parts.push('vault_refresh_token_id');

  const prov = mapIncomingProvider(provider);
  const aid = accountIdentifier != null ? String(accountIdentifier) : '';

  let row;
  if (prov === 'github' && aid === '') {
    row = await DB.prepare(
      `SELECT ${parts.join(', ')} FROM user_oauth_tokens
       WHERE user_id = ? AND provider IN ('github','github_app')
       ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(String(userId))
      .first();
  } else if (prov === 'google_drive' && aid === '') {
    // Drive rows may use account_identifier '' (canonical) or legacy email keys.
    row = await DB.prepare(
      `SELECT ${parts.join(', ')} FROM user_oauth_tokens
       WHERE user_id = ? AND provider IN ('google_drive','google')
       ORDER BY CASE WHEN account_identifier = '' THEN 0 ELSE 1 END,
                COALESCE(updated_at, 0) DESC
       LIMIT 1`,
    )
      .bind(String(userId))
      .first();
  } else if ((prov === 'google_gmail' || prov === 'gmail') && aid === '') {
    row = await DB.prepare(
      `SELECT ${parts.join(', ')} FROM user_oauth_tokens
       WHERE user_id = ? AND lower(provider) IN ('google_gmail','gmail')
       ORDER BY COALESCE(updated_at, 0) DESC
       LIMIT 1`,
    )
      .bind(String(userId))
      .first();
  } else if (prov === 'google_gmail' || prov === 'gmail') {
    row = await DB.prepare(
      `SELECT ${parts.join(', ')} FROM user_oauth_tokens
       WHERE user_id = ? AND lower(provider) IN ('google_gmail','gmail')
         AND lower(account_identifier) = lower(?)
       ORDER BY COALESCE(updated_at, 0) DESC
       LIMIT 1`,
    )
      .bind(String(userId), aid)
      .first();
  } else {
    row = await DB.prepare(
      `SELECT ${parts.join(', ')} FROM user_oauth_tokens
       WHERE user_id = ? AND provider = ? AND account_identifier = ?
       ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(String(userId), prov, aid)
      .first();
  }
  return { row, cols };
}

/**
 * Refresh Cloudflare OAuth access token (requires refresh_token from offline_access grant).
 * @returns {Promise<object|null>}
 */
export async function refreshCloudflareAccessToken(env, refreshToken) {
  if (!env?.CLOUDFLARE_OAUTH_CLIENT_ID || !env?.CLOUDFLARE_OAUTH_CLIENT_SECRET || !refreshToken) {
    return null;
  }
  const basic = btoa(`${env.CLOUDFLARE_OAUTH_CLIENT_ID}:${env.CLOUDFLARE_OAUTH_CLIENT_SECRET}`);
  const res = await fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(refreshToken),
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) return null;
  return data;
}

/**
 * Persist refreshed Google access token to D1 (access_token, access_token_encrypted, expires_at).
 * @returns {Promise<string|null>} New access token or null on failure.
 */
export async function refreshGoogleToken(env, userId, provider, refreshToken, row) {
  const clientSecret = googleOAuthClientSecret(env);
  if (!env?.GOOGLE_CLIENT_ID || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const newToken = data.access_token;
  if (!newToken) return null;
  const newExpiry = nowSeconds() + (Number(data.expires_in) || 3600);

  if (!env?.DB) return newToken;

  const cols = await pragmaColumns(env.DB, 'user_oauth_tokens');
  const accountId = row?.account_identifier != null ? String(row.account_identifier) : '';

  let encrypted = null;
  if (cols.has('access_token_encrypted') && isVaultConfigured(env)) {
    encrypted = await encryptWithVault(env, newToken).catch(() => null);
  }

  const sets = [];
  const binds = [];
  if (cols.has('access_token')) {
    sets.push('access_token = ?');
    binds.push(newToken);
  }
  if (cols.has('access_token_encrypted')) {
    sets.push('access_token_encrypted = ?');
    binds.push(encrypted);
  }
  sets.push('expires_at = ?');
  binds.push(newExpiry);
  if (cols.has('updated_at')) sets.push('updated_at = unixepoch()');

  binds.push(String(userId), mapIncomingProvider(provider), accountId);

  await env.DB.prepare(
    `UPDATE user_oauth_tokens SET ${sets.join(', ')}
     WHERE user_id = ? AND provider = ? AND account_identifier = ?`,
  )
    .bind(...binds)
    .run();

  return newToken;
}

/**
 * Full OAuth row with decrypted access_token and refresh_token (after refresh when applicable).
 * @param {string} [accountIdentifier] — GitHub multi-account login; use '' for default / Drive root row.
 */
export async function getIntegrationOAuthRow(env, userId, provider, accountIdentifier = '') {
  if (!env?.DB || !userId || !provider) return null;

  const { resolveIntegrationUserId } = await import('./integration-user-id.js');
  const canonicalUserId =
    (await resolveIntegrationUserId(env, { id: String(userId).trim() })) || String(userId).trim();

  const { row, cols } = await fetchOAuthRow(env, canonicalUserId, provider, accountIdentifier);
  if (!row) return null;

  const prov = mapIncomingProvider(provider);
  let accessToken = await resolveAccessToken(env, userId, row, cols);
  let refreshToken = await resolveRefreshToken(env, userId, row, cols);

  const exp =
    row.expires_at != null && row.expires_at !== '' ? Number(row.expires_at) : null;
  const now = nowSeconds();
  const isExpired = exp != null && Number.isFinite(exp) && exp < now;

  if (isExpired && isGoogleOAuthRefreshProvider(prov) && refreshToken) {
    const newAccess = await refreshGoogleToken(env, userId, prov, refreshToken, row);
    if (newAccess) accessToken = newAccess;
  }

  // Cloudflare OAuth (~24h access) — refresh when offline_access issued a refresh_token.
  const needsCfRefresh =
    prov === 'cloudflare' &&
    refreshToken &&
    (isExpired || (exp != null && Number.isFinite(exp) && exp <= now + 300));
  if (needsCfRefresh) {
    try {
      const tok = await refreshCloudflareAccessToken(env, refreshToken);
      if (tok?.access_token) {
        accessToken = tok.access_token;
        const newExpiry = now + (Number(tok.expires_in) || 3600);
        const nextRefresh = tok.refresh_token || refreshToken;
        const cols2 = await pragmaColumns(env.DB, 'user_oauth_tokens');
        let encrypted = null;
        if (cols2.has('access_token_encrypted') && isVaultConfigured(env)) {
          encrypted = await encryptWithVault(env, accessToken).catch(() => null);
        }
        let refreshEncrypted = null;
        if (cols2.has('refresh_token_encrypted') && isVaultConfigured(env) && nextRefresh) {
          refreshEncrypted = await encryptWithVault(env, nextRefresh).catch(() => null);
        }
        const sets = [];
        const binds = [];
        if (cols2.has('access_token')) {
          sets.push('access_token = ?');
          binds.push(accessToken);
        }
        if (cols2.has('access_token_encrypted')) {
          sets.push('access_token_encrypted = ?');
          binds.push(encrypted);
        }
        if (cols2.has('refresh_token') && nextRefresh) {
          sets.push('refresh_token = ?');
          binds.push(nextRefresh);
        }
        if (cols2.has('refresh_token_encrypted') && refreshEncrypted) {
          sets.push('refresh_token_encrypted = ?');
          binds.push(refreshEncrypted);
        }
        sets.push('expires_at = ?');
        binds.push(newExpiry);
        if (cols2.has('updated_at')) sets.push('updated_at = unixepoch()');
        const accountId = row?.account_identifier != null ? String(row.account_identifier) : '';
        binds.push(String(canonicalUserId), 'cloudflare', accountId);
        await env.DB.prepare(
          `UPDATE user_oauth_tokens SET ${sets.join(', ')}
           WHERE user_id = ? AND provider = ? AND account_identifier = ?`,
        )
          .bind(...binds)
          .run();
        refreshToken = nextRefresh;
      }
    } catch (e) {
      console.warn('[oauth] cloudflare refresh failed', e?.message || e);
    }
  }

  return {
    ...row,
    access_token: accessToken,
    refresh_token: refreshToken,
    provider: prov,
  };
}

/** Returns the decrypted access token string only (same resolution + refresh as integrations). */
export async function getOAuthToken(env, userId, provider, accountIdentifier = '') {
  const row = await getIntegrationOAuthRow(env, userId, provider, accountIdentifier);
  return row?.access_token ?? null;
}
