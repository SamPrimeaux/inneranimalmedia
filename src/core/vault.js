/**
 * D1 env_secrets: encrypted platform keys + public config rows.
 */
import { getAESKey } from './crypto-vault.js';

/** @param {string} k @param {Record<string, string>} vault @param {object} env */
export function secretFromVault(vault, env, k) {
  return vault[k] ?? env[k];
}

/**
 * Active rows with key_type = encrypted_d1 (AES-GCM; needs VAULT_KEY + iv).
 * @returns {Promise<Record<string, string>>}
 */
export async function getVaultSecrets(env) {
  try {
    if (!env.VAULT_KEY || !env.DB) return {};
    async function decryptRow(encB64, ivB64, vaultKeyB64) {
      const key = await getAESKey({ VAULT_MASTER_KEY: vaultKeyB64 }, ['decrypt']);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Uint8Array.from(atob(ivB64), c => c.charCodeAt(0)) },
        key,
        Uint8Array.from(atob(encB64), c => c.charCodeAt(0)),
      );
      return new TextDecoder().decode(plain);
    }
    const { results } = await env.DB.prepare(
      `SELECT key_name, encrypted_value, iv FROM env_secrets
       WHERE is_active = 1 AND key_type = 'encrypted_d1'`,
    ).all();
    const secrets = {};
    for (const row of results || []) {
      if (!row?.key_name || !row.encrypted_value || !row.iv) continue;
      try {
        secrets[row.key_name] = await decryptRow(row.encrypted_value, row.iv, env.VAULT_KEY);
      } catch {
        /* skip bad row */
      }
    }
    return secrets;
  } catch {
    return {};
  }
}

/**
 * Plaintext config in env_secrets (value stored in encrypted_value column).
 * @returns {Promise<Record<string, string>>}
 */
export async function getPublicConfig(env) {
  try {
    if (!env?.DB) return {};
    const { results } = await env.DB.prepare(
      `SELECT key_name, encrypted_value FROM env_secrets
       WHERE is_active = 1 AND key_type = 'public_config'`,
    ).all();
    const out = {};
    for (const row of results || []) {
      if (row?.key_name) out[String(row.key_name)] = row.encrypted_value != null ? String(row.encrypted_value) : '';
    }
    return out;
  } catch {
    return {};
  }
}
