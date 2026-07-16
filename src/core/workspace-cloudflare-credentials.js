/**
 * Cloudflare credentials — ONE account-wide spine (not per-workspace jail).
 *
 * Law:
 *   1. Resolve a validated token (superadmin platform → same-account platform → OAuth → BYOK).
 *   2. Derive account_id from that token's /accounts list (preferred hint only if in scope).
 *   3. Workspace is soft org context only — never required to unlock CF utilities.
 *   4. D1 REST pairing (elsewhere): token → catalog → match.account_id for that database.
 *
 * Same law as MCP `resolveUserCloudflareCredentials` (inneranimalmedia-mcp-server).
 */
import { getAESKey, aesGcmDecryptFromB64 } from './crypto-vault.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { userHasSuperadminRole } from './resolve-credential.js';
import {
  listCfAccountsForToken,
  looksLikeCfAccountId,
  healCloudflareOAuthAccountIfNeeded,
} from './cf-token-account.js';
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
 * Account id must come from the token's accessible accounts.
 * Soft hints (workspace / OAuth / BYOK meta) win only when they appear in that list.
 *
 * @param {string} token
 * @param {string|null|undefined} preferredAccountId
 */
export async function finalizeCloudflareAccountForToken(token, preferredAccountId = null) {
  const tok = trim(token);
  if (!tok) {
    return { ok: false, error: 'token_missing', account_id: null, account_id_source: null };
  }
  const listed = await listCfAccountsForToken(tok);
  if (!listed.ok || !listed.accounts?.length) {
    return {
      ok: false,
      error: listed.error || 'accounts_list_failed',
      account_id: null,
      account_id_source: null,
      accessible_accounts: listed.accounts || [],
    };
  }
  const preferred = trim(preferredAccountId);
  if (preferred && listed.accounts.some((a) => a.id.toLowerCase() === preferred.toLowerCase())) {
    return {
      ok: true,
      account_id: preferred,
      account_id_source: 'hint_verified_in_token_scope',
      accessible_accounts: listed.accounts,
    };
  }
  return {
    ok: true,
    account_id: listed.accounts[0].id,
    account_id_source: 'token_accounts_first',
    accessible_accounts: listed.accounts,
  };
}

/**
 * Soft org hint only — never used as REST account_id unless verified against the token.
 * @param {any} env
 * @param {string} workspaceId
 */
async function loadWorkspaceAccountHint(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!ws || !env?.DB) return { accountId: null, bindingId: null };
  const accountBinding = await getDefaultWorkspaceDataBinding(env, ws, 'cloudflare');
  return {
    accountId: trim(accountBinding?.external_account_id) || null,
    bindingId: accountBinding?.id != null ? String(accountBinding.id) : null,
  };
}

/**
 * @param {any} env
 * @param {string} userId
 */
async function loadUserValidatedAccountHint(env, userId) {
  const uid = trim(userId);
  if (!uid || !env?.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT settings_json FROM user_settings WHERE user_id = ? LIMIT 1`,
    )
      .bind(uid)
      .first();
    const prefs =
      row?.settings_json == null
        ? {}
        : typeof row.settings_json === 'object'
          ? row.settings_json
          : (() => {
              try {
                return JSON.parse(String(row.settings_json));
              } catch {
                return {};
              }
            })();
    const stack = prefs?.cf_stack && typeof prefs.cf_stack === 'object' ? prefs.cf_stack : prefs;
    const fromStack =
      trim(stack?.cf_account_id) ||
      trim(stack?.cloudflare_account_id) ||
      trim(prefs?.cf_account_id) ||
      trim(prefs?.cloudflare_account_id);
    if (fromStack) return fromStack;
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * BYOK Cloudflare keys: prefer workspace_id NULL (account-scoped), then any active row.
 * @param {any} env
 * @param {string} userId
 * @param {string} tenantId
 */
async function loadCloudflareByokRow(env, userId, tenantId) {
  if (!env?.DB || !userId) return null;
  const cols = await userApiKeysColumnSet(env.DB);
  const selectCols = ['id', 'vault_secret_id', 'key_hash', 'metadata_json', 'workspace_id'];
  if (cols.has('status')) selectCols.push('status');
  const where = ["LOWER(provider) = 'cloudflare'", 'user_id = ?'];
  const binds = [trim(userId)];
  if (trim(tenantId)) {
    where.push('(tenant_id IS NULL OR tenant_id = \'\' OR tenant_id = ?)');
    binds.push(trim(tenantId));
  }
  if (cols.has('status')) where.push("COALESCE(status, 'active') = 'active'");
  if (cols.has('is_active')) where.push('COALESCE(is_active, 1) = 1');
  const orderParts = [
    "CASE WHEN workspace_id IS NULL OR workspace_id = '' THEN 0 ELSE 1 END",
  ];
  if (cols.has('updated_at')) orderParts.push('updated_at DESC');
  if (cols.has('created_at')) orderParts.push('created_at DESC');

  return env.DB.prepare(
    `SELECT ${selectCols.join(', ')} FROM user_api_keys
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderParts.join(', ')}
     LIMIT 1`,
  )
    .bind(...binds)
    .first()
    .catch(() => null);
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} row
 * @param {string} userId
 */
async function decryptByokToken(env, row, userId) {
  const uid = trim(userId);
  const vaultSecretId = row?.vault_secret_id != null ? String(row.vault_secret_id).trim() : '';
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
      return await vaultDecrypt(env, secretRow.secret_value_encrypted);
    }
  }
  if (row?.key_hash) {
    try {
      const aesKey = await getAESKey(env, ['decrypt']);
      return await aesGcmDecryptFromB64(row.key_hash, aesKey);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Account-wide Cloudflare credentials. workspace_id is optional soft context only.
 *
 * @param {any} env
 * @param {{
 *   user_id?: string|null,
 *   tenant_id?: string|null,
 *   workspace_id?: string|null,
 * }} [scope]
 */
export async function resolveUserCloudflareCredentials(env, scope = {}) {
  const userId = trim(scope?.user_id);
  const tenantId = trim(scope?.tenant_id);
  const workspaceId = trim(scope?.workspace_id);
  const platformToken = trim(env?.CLOUDFLARE_API_TOKEN);
  const platformAccountId = trim(env?.CLOUDFLARE_ACCOUNT_ID);

  if (!userId) {
    return { ok: false, error: 'missing_user_id', token: null, account_id: null, key_id: null };
  }

  const { accountId: workspaceHint, bindingId } = await loadWorkspaceAccountHint(env, workspaceId);
  const userHint = await loadUserValidatedAccountHint(env, userId);
  const softPreferred = userHint || workspaceHint || platformAccountId || null;

  const authUser = await loadAuthUserForCredentials(env, userId);

  // Lane 1: superadmin → platform Wrangler secrets
  if (userHasSuperadminRole(authUser) && platformToken) {
    const finalized = await finalizeCloudflareAccountForToken(
      platformToken,
      softPreferred || platformAccountId,
    );
    if (finalized.ok) {
      return {
        ok: true,
        error: null,
        token: platformToken,
        account_id: finalized.account_id,
        account_mask: maskAccountId(finalized.account_id),
        account_id_source: finalized.account_id_source,
        key_id: null,
        binding_id: bindingId,
        platform_bypass: 'superadmin_role',
        scope: 'account',
        credential_source: 'platform',
      };
    }
  }

  // Lane 2: user's validated CF account == platform account → platform token
  if (platformToken && platformAccountId && userHint && userHint === platformAccountId) {
    const finalized = await finalizeCloudflareAccountForToken(platformToken, platformAccountId);
    if (finalized.ok) {
      return {
        ok: true,
        error: null,
        token: platformToken,
        account_id: finalized.account_id,
        account_mask: maskAccountId(finalized.account_id),
        account_id_source: finalized.account_id_source,
        key_id: null,
        binding_id: bindingId,
        platform_bypass: 'platform_account_user_validated',
        scope: 'account',
        credential_source: 'platform',
      };
    }
  }

  // Lane 3: Cloudflare OAuth (account-wide)
  const oauthRow = await getIntegrationOAuthRow(env, userId, 'cloudflare');
  const oauthToken = oauthRow?.access_token ? trim(oauthRow.access_token) : null;
  if (oauthToken) {
    let oauthHint = null;
    const fromId = trim(oauthRow?.account_identifier);
    if (looksLikeCfAccountId(fromId)) oauthHint = fromId;
    if (!oauthHint && oauthRow?.metadata_json) {
      try {
        const meta = JSON.parse(String(oauthRow.metadata_json));
        oauthHint = trim(meta?.cloudflare_account_id) || trim(meta?.account_id) || null;
      } catch {
        oauthHint = null;
      }
    }
    if (!oauthHint) {
      oauthHint = await healCloudflareOAuthAccountIfNeeded(env, userId, oauthToken, oauthRow);
    }
    const finalized = await finalizeCloudflareAccountForToken(
      oauthToken,
      oauthHint || softPreferred,
    );
    if (finalized.ok) {
      return {
        ok: true,
        error: null,
        token: oauthToken,
        account_id: finalized.account_id,
        account_mask: maskAccountId(finalized.account_id),
        account_id_source: finalized.account_id_source,
        key_id: null,
        binding_id: bindingId,
        scope: 'account',
        credential_source: 'oauth',
      };
    }
  }

  // Lane 4: BYOK — prefer workspace_id NULL
  if (!env?.DB) {
    return {
      ok: false,
      error: 'cloudflare_key_missing',
      token: null,
      account_id: null,
      key_id: null,
      binding_id: bindingId,
    };
  }

  const row = await loadCloudflareByokRow(env, userId, tenantId);
  if (!row) {
    return {
      ok: false,
      error: 'cloudflare_key_missing',
      token: null,
      account_id: null,
      key_id: null,
      binding_id: bindingId,
      user_message:
        'Connect Cloudflare in Settings → Integrations (OAuth) or Keys (account-wide BYOK). Workspace is not required.',
    };
  }

  const meta = parseMeta(row.metadata_json);
  const byokHint =
    trim(meta.cloudflare_account_id) || trim(meta.account_id) || softPreferred || null;
  const token = await decryptByokToken(env, row, userId);
  if (!token) {
    return {
      ok: false,
      error: 'cloudflare_token_decrypt_failed',
      token: null,
      account_id: null,
      key_id: row.id != null ? String(row.id) : null,
      binding_id: bindingId,
    };
  }

  const finalized = await finalizeCloudflareAccountForToken(token, byokHint);
  if (!finalized.ok) {
    return {
      ok: false,
      error: finalized.error || 'cloudflare_account_id_missing',
      token: null,
      account_id: null,
      key_id: row.id != null ? String(row.id) : null,
      binding_id: bindingId,
      accessible_accounts: finalized.accessible_accounts || null,
    };
  }

  return {
    ok: true,
    error: null,
    token: String(token),
    account_id: finalized.account_id,
    account_mask: maskAccountId(finalized.account_id),
    account_id_source: finalized.account_id_source,
    key_id: row.id != null ? String(row.id) : null,
    binding_id: bindingId,
    scope: 'account',
    credential_source: 'byok',
  };
}

/**
 * Compatibility wrapper — workspace_id is soft context, not a gate.
 * Callers that only have userId still succeed.
 *
 * @param {any} env
 * @param {string} userId
 * @param {string} [tenantId]
 * @param {string} [workspaceId]
 */
export async function resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId) {
  if (!userId) {
    return { ok: false, error: 'missing_scope', token: null, account_id: null, key_id: null };
  }
  return resolveUserCloudflareCredentials(env, {
    user_id: userId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
  });
}

export { maskAccountId };
