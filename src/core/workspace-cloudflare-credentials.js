/**
 * Resolve workspace-scoped BYO Cloudflare API token + account id from user_api_keys.
 * Never reads env.CLOUDFLARE_API_TOKEN / env.CLOUDFLARE_ACCOUNT_ID.
 */
import { getAESKey, aesGcmDecryptFromB64 } from './crypto-vault.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';

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

  const cols = await userApiKeysColumnSet(env.DB);
  const selectCols = ['id', 'vault_secret_id', 'key_hash', 'metadata_json', 'workspace_id'];
  if (cols.has('status')) selectCols.push('status');
  const where = [
    'tenant_id = ?',
    'user_id = ?',
    "LOWER(provider) = 'cloudflare'",
    'workspace_id = ?',
  ];
  const binds = [tid, uid, ws];
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
