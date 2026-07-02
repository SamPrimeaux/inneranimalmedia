/**
 * Resolve Cloudflare API token + account id for PTY session spawn (Lane 2 LOCAL-USER).
 * Prefers dashboard Cloudflare OAuth; falls back to BYOK user_api_keys.
 */
import { getIntegrationOAuthRow } from './user-oauth-token.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { resolveWorkspaceCloudflareCredentials } from './workspace-cloudflare-credentials.js';
import { loadWorkspaceSettingsJson } from './pty-workspace-paths.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {Record<string, unknown>} env
 * @param {{ userId: string, tenantId?: string | null, workspaceId?: string | null }} scope
 */
export async function resolvePtySessionCloudflareEnv(env, scope) {
  const userId = trim(scope?.userId);
  const tenantId = trim(scope?.tenantId);
  const workspaceId = trim(scope?.workspaceId);

  if (!env?.DB || !userId) {
    return {
      ok: false,
      error: 'missing_scope',
      cloudflare_api_token: null,
      cloudflare_account_id: null,
    };
  }

  let accountId = null;
  if (workspaceId) {
    const binding = await getDefaultWorkspaceDataBinding(env, workspaceId, 'cloudflare');
    if (binding?.external_account_id) {
      accountId = trim(binding.external_account_id) || null;
    }
    if (!accountId) {
      const settings = await loadWorkspaceSettingsJson(env, workspaceId);
      accountId =
        trim(settings?.cf_account_id) ||
        trim(settings?.cloudflare_account_id) ||
        null;
    }
  }

  const oauthRow = await getIntegrationOAuthRow(env, userId, 'cloudflare');
  let token = oauthRow?.access_token ? trim(oauthRow.access_token) : null;

  if (!token && tenantId && workspaceId) {
    const byok = await resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId);
    if (byok.ok && byok.token) {
      token = trim(byok.token);
      accountId = accountId || trim(byok.account_id) || null;
    }
  }

  if (!token) {
    return {
      ok: false,
      error: 'cloudflare_credentials_missing',
      cloudflare_api_token: null,
      cloudflare_account_id: accountId,
    };
  }

  return {
    ok: true,
    error: null,
    cloudflare_api_token: token,
    cloudflare_account_id: accountId,
  };
}
