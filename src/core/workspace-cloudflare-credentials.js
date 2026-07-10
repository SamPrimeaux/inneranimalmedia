/**
 * Resolve Cloudflare API token + account id for a workspace.
 * Superadmin → platform Wrangler secrets (account-wide). Everyone else → BYOK user_api_keys only.
 */
import { getAESKey, aesGcmDecryptFromB64 } from './crypto-vault.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { userHasSuperadminRole } from './resolve-credential.js';
import { workspaceAllowsPlatformFallback } from './workspace-spend-guard.js';
import { resolveCfAccountIdFromToken, looksLikeCfAccountId, healCloudflareOAuthAccountIfNeeded } from './cf-token-account.js';
import { getIntegrationOAuthRow } from './user-oauth-token.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {any} env
 * @param {string} userId
 */
async function loadAuthUserForCredentials(env, userId) {
  if (!env?.DB || !userId) return null;
  try {
    return await env.DB.prepare(
      `SELECT id, COALESCE(is_superadmin, 0) AS is_superadmin, role
         FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(trim(userId))
      .first();
  } catch {
    return null;
  }
}

function parseMeta(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function maskAccountId(accountId) {
  const s = String(accountId || '').trim();
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

/** @param {any} db */
async function userApiKeysColumnSet(db) {
  const res = await db.prepare('PRAGMA table_info(user_api_keys)').all().catch(() => null);
  const names = new Set((res?.results || []).map((c) => String(c?.name || '')));
  return names;
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} tenantId
 * @param {string} workspaceId
 */
export async function resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId) {
  if (!env?.DB || !userId || !tenantId || !workspaceId) {
    return { ok: false, error: 'missing_scope', token: null, account_id: null, key_id: null };
  }

  const uid = String(userId).trim();
  const tid = String(tenantId).trim();
  const ws = String(workspaceId).trim();

  let accountId = null;
  let bindingId = null;

  const accountBinding = await getDefaultWorkspaceDataBinding(env, ws, 'cloudflare');
  if (accountBinding?.external_account_id) {
    accountId = String(accountBinding.external_account_id).trim();
    bindingId = accountBinding.id != null ? String(accountBinding.id) : null;
  }

  const authUser = await loadAuthUserForCredentials(env, uid);
  const platformFallbackOk = await workspaceAllowsPlatformFallback(env, ws);
  if (userHasSuperadminRole(authUser) && platformFallbackOk) {
    const token = trim(env?.CLOUDFLARE_API_TOKEN);
    const platformAccountId = trim(env?.CLOUDFLARE_ACCOUNT_ID);
    if (token && platformAccountId) {
      return {
        ok: true,
        error: null,
        token,
        account_id: platformAccountId,
        account_mask: maskAccountId(platformAccountId),
        key_id: null,
        binding_id: bindingId,
        platform_bypass: 'superadmin_role',
      };
    }
  }

  const oauthRow = await getIntegrationOAuthRow(env, uid, 'cloudflare');
  const oauthToken = oauthRow?.access_token ? trim(oauthRow.access_token) : null;
  if (oauthToken) {
    let oauthAccountId = null;
    const fromId = trim(oauthRow?.account_identifier);
    if (looksLikeCfAccountId(fromId)) oauthAccountId = fromId;
    if (!oauthAccountId && oauthRow?.metadata_json) {
      try {
        const meta = JSON.parse(String(oauthRow.metadata_json));
        oauthAccountId =
          trim(meta?.cloudflare_account_id) || trim(meta?.account_id) || null;
      } catch {
        oauthAccountId = null;
      }
    }
    if (!oauthAccountId) {
      oauthAccountId = await healCloudflareOAuthAccountIfNeeded(env, uid, oauthToken, oauthRow);
    }
    if (oauthAccountId) {
      return {
        ok: true,
        error: null,
        token: oauthToken,
        account_id: oauthAccountId,
        account_mask: maskAccountId(oauthAccountId),
        key_id: null,
        binding_id: bindingId,
        credential_source: 'oauth',
      };
    }
  }

  const cols = await userApiKeysColumnSet(env.DB);
  const selectCols = ['id', 'vault_secret_id', 'key_hash', 'metadata_json', 'workspace_id'];
  if (cols.has('status')) selectCols.push('status');
  const where = [
    'tenant_id = ?',
    'user_id = ?',
    "LOWER(provider) = 'cloudflare'",
  ];
  const binds = [tid, uid];
  if (cols.has('status')) {
    where.push("COALESCE(status, 'active') = 'active'");
  }
  if (cols.has('is_active')) {
    where.push('COALESCE(is_active, 1) = 1');
  }
  const order =
    cols.has('updated_at') && cols.has('created_at')
      ? 'ORDER BY updated_at DESC, created_at DESC'
      : cols.has('updated_at')
        ? 'ORDER BY updated_at DESC'
        : cols.has('created_at')
          ? 'ORDER BY created_at DESC'
          : '';

  const row = await env.DB.prepare(
    `SELECT ${selectCols.join(', ')} FROM user_api_keys
     WHERE ${where.join(' AND ')} ${order} LIMIT 1`,
  )
    .bind(...binds)
    .first()
    .catch(() => null);

  if (!row) {
    return {
      ok: false,
      error: 'cloudflare_key_missing',
      token: null,
      account_id: accountId,
      key_id: null,
      binding_id: bindingId,
    };
  }

  const meta = parseMeta(row.metadata_json);
  if (!accountId) {
    accountId =
      meta.cloudflare_account_id != null
        ? String(meta.cloudflare_account_id).trim()
        : meta.account_id != null
          ? String(meta.account_id).trim()
          : null;
  }

  let token = null;
  const vaultSecretId = row.vault_secret_id != null ? String(row.vault_secret_id).trim() : '';
  if (vaultSecretId) {
    const secretRow = await env.DB.prepare(
      `SELECT secret_value_encrypted FROM user_secrets
       WHERE id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
      .bind(vaultSecretId, uid)
      .first()
      .catch(() => null);
    if (secretRow?.secret_value_encrypted) {
      const { vaultDecrypt } = await import('../api/vault.js');
      token = await vaultDecrypt(env, secretRow.secret_value_encrypted);
    }
  }
  if (!token && row.key_hash) {
    try {
      const aesKey = await getAESKey(env, ['decrypt']);
      token = await aesGcmDecryptFromB64(row.key_hash, aesKey);
    } catch {
      token = null;
    }
  }

  if (!token) {
    return {
      ok: false,
      error: 'cloudflare_token_decrypt_failed',
      token: null,
      account_id: accountId,
      key_id: row.id != null ? String(row.id) : null,
      binding_id: bindingId,
    };
  }

  if (!accountId) {
    const resolved = await resolveCfAccountIdFromToken(String(token));
    if (resolved.ok && resolved.account_id) {
      accountId = resolved.account_id;
      const keyId = row.id != null ? String(row.id) : null;
      if (keyId) {
        const nextMeta = {
          ...meta,
          cloudflare_account_id: accountId,
          account_id: accountId,
        };
        await env.DB.prepare(
          `UPDATE user_api_keys SET metadata_json = ?, updated_at = COALESCE(updated_at, unixepoch())
           WHERE id = ? AND user_id = ?`,
        )
          .bind(JSON.stringify(nextMeta), keyId, uid)
          .run()
          .catch(() => null);
      }
    }
  }

  if (!accountId) {
    return {
      ok: false,
      error: 'cloudflare_account_id_missing',
      token: null,
      account_id: null,
      key_id: row.id != null ? String(row.id) : null,
      binding_id: bindingId,
    };
  }

  return {
    ok: true,
    error: null,
    token: String(token),
    account_id: accountId,
    account_mask: maskAccountId(accountId),
    key_id: row.id != null ? String(row.id) : null,
    binding_id: bindingId,
  };
}

export { maskAccountId };
