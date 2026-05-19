/**
 * Per-user Cloudflare R2 S3 credentials in D1 user_storage_access_keys.
 * Secrets encrypted with VAULT_MASTER_KEY (same pattern as oauth token storage).
 */
import { getAESKey, aesGcmEncryptToB64, aesGcmDecryptFromB64 } from './crypto-vault.js';
import { authUserIsSuperadmin, fetchAuthUserTenantId } from './auth.js';

const VAULT_SECRET_HASH_PLACEHOLDER = 'vault_encrypted';

async function pragmaColumns(DB, tableName) {
  const out = await DB.prepare(`PRAGMA table_info(${tableName})`).all();
  const cols = new Set();
  for (const row of out.results || []) cols.add(String(row.name || '').toLowerCase());
  return cols;
}

async function encryptWithVault(env, plaintext) {
  const key = await getAESKey(env, ['encrypt']);
  return aesGcmEncryptToB64(plaintext, key);
}

async function decryptWithVault(env, encryptedB64) {
  const key = await getAESKey(env, ['decrypt']);
  return aesGcmDecryptFromB64(encryptedB64, key);
}

/** Last 6 characters for display / r2_access_key_id preview column. */
export function r2AccessKeyPreview(fullAccessKeyId) {
  const s = String(fullAccessKeyId || '').trim();
  if (s.length <= 6) return s;
  return s.slice(-6);
}

function stableRegistryAccessKeyId(userId) {
  return `cf_r2_${String(userId || '').trim()}`;
}

function stableRowId(userId) {
  return `usak_cf_${String(userId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
}

/**
 * Load decrypted Cloudflare R2 API credentials for a user (active row).
 * @returns {Promise<{ accessKeyId: string, secretAccessKey: string, cfAccountId: string } | null>}
 */
export async function loadUserCloudflareR2Credentials(env, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !env?.DB) return null;

  const cols = await pragmaColumns(env.DB, 'user_storage_access_keys');
  if (!cols.has('access_key_id_encrypted') || !cols.has('secret_encrypted')) return null;

  const selectCols = ['id', 'status', 'access_key_id_encrypted', 'secret_encrypted'];
  if (cols.has('cf_account_id')) selectCols.push('cf_account_id');
  if (cols.has('r2_access_key_id')) selectCols.push('r2_access_key_id');

  let row;
  try {
    row = await env.DB.prepare(
      `SELECT ${selectCols.join(', ')}
       FROM user_storage_access_keys
       WHERE user_id = ? AND status = 'active'
         AND access_key_id_encrypted IS NOT NULL
         AND secret_encrypted IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
    )
      .bind(uid)
      .first();
  } catch {
    return null;
  }

  if (!row?.access_key_id_encrypted || !row?.secret_encrypted) return null;
  if (!env.VAULT_MASTER_KEY && !env.VAULT_KEY) return null;

  try {
    const accessKeyId = await decryptWithVault(env, row.access_key_id_encrypted);
    const secretAccessKey = await decryptWithVault(env, row.secret_encrypted);
    const cfAccountId =
      cols.has('cf_account_id') && row.cf_account_id != null
        ? String(row.cf_account_id).trim()
        : '';
    if (!accessKeyId || !secretAccessKey) return null;
    return { accessKeyId, secretAccessKey, cfAccountId };
  } catch (e) {
    console.warn('[user-storage-r2-credentials] decrypt failed', e?.message ?? e);
    return null;
  }
}

/**
 * Merge user R2 S3 credentials into env for SigV4 calls.
 * Superadmin without a user row keeps Worker env secrets; others do not inherit env secrets.
 */
export async function mergeR2S3EnvFromUserStorage(env, authUser) {
  if (!env) return env;
  const userCreds = authUser?.id ? await loadUserCloudflareR2Credentials(env, authUser.id) : null;
  if (userCreds) {
    return {
      ...env,
      R2_ACCESS_KEY_ID: userCreds.accessKeyId,
      R2_SECRET_ACCESS_KEY: userCreds.secretAccessKey,
      CLOUDFLARE_ACCOUNT_ID: userCreds.cfAccountId || env.CLOUDFLARE_ACCOUNT_ID,
    };
  }
  if (authUser && authUserIsSuperadmin(authUser)) return env;
  return {
    ...env,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
  };
}

/**
 * Upsert Cloudflare R2 credentials for the authenticated user.
 */
export async function upsertUserCloudflareR2Keys(
  env,
  { userId, tenantId, personUuid, cfAccountId, r2AccessKeyId, r2SecretAccessKey },
) {
  if (!env?.DB) throw new Error('DB not configured');
  if (!env.VAULT_MASTER_KEY && !env.VAULT_KEY) throw new Error('VAULT_MASTER_KEY not configured');

  const uid = String(userId || '').trim();
  const cfId = String(cfAccountId || '').trim();
  const fullKeyId = String(r2AccessKeyId || '').trim();
  const secret = String(r2SecretAccessKey || '').trim();
  if (!uid || !cfId || !fullKeyId || !secret) {
    throw new Error('cf_account_id, r2_access_key_id, and r2_secret_access_key are required');
  }

  const cols = await pragmaColumns(env.DB, 'user_storage_access_keys');
  if (!cols.has('access_key_id_encrypted') || !cols.has('secret_encrypted')) {
    throw new Error('user_storage_access_keys encryption columns missing — apply migration 340');
  }

  const accessKeyIdEncrypted = await encryptWithVault(env, fullKeyId);
  const secretEncrypted = await encryptWithVault(env, secret);
  const preview = r2AccessKeyPreview(fullKeyId);
  const registryKey = stableRegistryAccessKeyId(uid);
  const id = stableRowId(uid);
  const created_at = Math.floor(Date.now() / 1000);

  let tid = String(tenantId || '').trim();
  if (!tid) tid = (await fetchAuthUserTenantId(env, uid)) || `user:${uid}`;

  const rowValues = [
    ['id', id],
    ['tenant_id', tid],
    ['user_id', uid],
    ['access_key_id', registryKey],
    ['secret_hash', VAULT_SECRET_HASH_PLACEHOLDER],
    ['status', 'active'],
    ['created_at', created_at],
    ['person_uuid', personUuid || null],
    ['cf_account_id', cfId],
    ['r2_access_key_id', preview],
    ['access_key_id_encrypted', accessKeyIdEncrypted],
    ['secret_encrypted', secretEncrypted],
    ['r2_secret_access_key', null],
  ];

  const insertCols = [];
  const insertQs = [];
  const insertVals = [];
  for (const [col, val] of rowValues) {
    if (!cols.has(col)) continue;
    insertCols.push(col);
    insertQs.push('?');
    insertVals.push(val);
  }

  if (insertCols.length === 0) throw new Error('user_storage_access_keys schema incompatible');

  const updateCols = insertCols.filter((c) => c !== 'id');
  const updateClause = updateCols.map((c) => `${c} = excluded.${c}`).join(', ');

  await env.DB.prepare(
    `INSERT INTO user_storage_access_keys (${insertCols.join(', ')})
     VALUES (${insertQs.join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${updateClause}`,
  )
    .bind(...insertVals)
    .run();

  return {
    id,
    cf_account_id: cfId,
    r2_access_key_id_preview: preview,
    access_key_registry: registryKey,
  };
}
