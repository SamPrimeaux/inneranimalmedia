/**
 * CF Images upload credentials — user OAuth REST API first, platform token fallback.
 * SSOT: user_oauth_tokens (provider=cloudflare) + agentsam_workspace.cloudflare_account_id.
 */
import { getIntegrationOAuthRow } from './user-oauth-token.js';
import { encryptWithVault } from './oauth-token-store.js';
import { getAgentsamWorkspace } from './agentsam-workspace.js';

const REFRESH_BUFFER_SEC = 300;

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function fetchCloudflareOAuthRow(env, userId) {
  if (!env?.DB || !userId) return null;
  return env.DB.prepare(
    `SELECT access_token, access_token_encrypted, refresh_token, refresh_token_encrypted,
            expires_at, updated_at
       FROM user_oauth_tokens
      WHERE user_id = ?
        AND lower(provider) = 'cloudflare'
        AND COALESCE(is_active, 1) = 1
      ORDER BY COALESCE(updated_at, 0) DESC
      LIMIT 1`,
  )
    .bind(trim(userId))
    .first()
    .catch(() => null);
}

async function persistCloudflareTokens(env, userId, { accessToken, refreshToken, expiresAt }) {
  if (!env?.DB || !userId || !accessToken) return;
  const encAccess = await encryptWithVault(env, accessToken).catch(() => null);
  const encRefresh = refreshToken ? await encryptWithVault(env, refreshToken).catch(() => null) : null;
  await env.DB.prepare(
    `UPDATE user_oauth_tokens
        SET access_token = ?,
            access_token_encrypted = ?,
            refresh_token = COALESCE(?, refresh_token),
            refresh_token_encrypted = COALESCE(?, refresh_token_encrypted),
            expires_at = ?,
            updated_at = unixepoch()
      WHERE user_id = ?
        AND lower(provider) = 'cloudflare'`,
  )
    .bind(accessToken, encAccess, refreshToken || null, encRefresh, expiresAt ?? null, trim(userId))
    .run()
    .catch(() => null);
}

export async function refreshCloudflareOAuthToken(env, userId, row) {
  const { decryptWithVault } = await import('./oauth-token-store.js');
  let refreshToken = trim(row?.refresh_token);
  if (!refreshToken && row?.refresh_token_encrypted) {
    refreshToken = (await decryptWithVault(env, row.refresh_token_encrypted).catch(() => null)) || '';
  }
  const clientId = trim(env.CLOUDFLARE_OAUTH_CLIENT_ID);
  const clientSecret = trim(env.CLOUDFLARE_OAUTH_CLIENT_SECRET);
  if (!refreshToken || !clientId || !clientSecret) return null;

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch('https://dash.cloudflare.com/oauth2/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  const accessToken = trim(data.access_token);
  if (!res.ok || !accessToken) return null;
  const expiresAt = data.expires_in ? nowSeconds() + Number(data.expires_in) : null;
  await persistCloudflareTokens(env, userId, {
    accessToken,
    refreshToken: trim(data.refresh_token) || refreshToken,
    expiresAt,
  });
  return accessToken;
}

export async function getCfOAuthAccessToken(env, userId) {
  const row = await fetchCloudflareOAuthRow(env, userId);
  if (!row) return null;

  const oauthRow = await getIntegrationOAuthRow(env, userId, 'cloudflare', '');
  let accessToken = trim(oauthRow?.access_token);
  const exp = row.expires_at != null ? Number(row.expires_at) : null;
  const needsRefresh = exp != null && Number.isFinite(exp) && exp - nowSeconds() < REFRESH_BUFFER_SEC;

  if ((!accessToken || needsRefresh) && row) {
    const refreshed = await refreshCloudflareOAuthToken(env, userId, row);
    if (refreshed) accessToken = refreshed;
  }
  return accessToken || null;
}

async function cfApiGet(token, path) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.errors?.[0]?.message || `cloudflare_${res.status}`);
  }
  return data.result;
}

async function listCfAccounts(token) {
  const data = await cfApiGet(token, '/accounts?per_page=50');
  const accounts = Array.isArray(data) ? data : [];
  return accounts.map((a) => ({ id: trim(a?.id), name: trim(a?.name) || trim(a?.id) })).filter((a) => a.id);
}

export async function fetchCfImagesAccountHash(accountId, token) {
  const result = await cfApiGet(token, `/accounts/${encodeURIComponent(accountId)}`);
  return trim(result?.images_account_hash) || trim(result?.settings?.images_account_hash) || null;
}

async function cacheWorkspaceImagesHash(env, workspaceId, accountHash) {
  const hash = trim(accountHash);
  const wsId = trim(workspaceId);
  if (!env?.DB || !wsId || !hash) return;
  await env.DB.prepare(
    `UPDATE agentsam_workspace
        SET cloudflare_images_account_hash = ?,
            metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.cloudflare_images_account_hash', ?),
            updated_at = unixepoch()
      WHERE id = ? OR workspace_ref_id = ?`,
  )
    .bind(hash, hash, wsId, wsId)
    .run()
    .catch(() => null);
}

function parseWorkspaceMetaJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function resolveWorkspaceImagesHash(wsRow, env) {
  const meta = parseWorkspaceMetaJson(wsRow?.metadata_json);
  return (
    trim(wsRow?.cloudflare_images_account_hash) ||
    trim(meta.cloudflare_images_account_hash) ||
    trim(env?.CLOUDFLARE_IMAGES_ACCOUNT_HASH) ||
    null
  );
}

function platformImagesCreds(env) {
  const accountId = trim(env?.CLOUDFLARE_ACCOUNT_ID);
  const token = trim(env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN || env.CLOUDFLARE_API_TOKEN);
  const accountHash = trim(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH);
  if (!accountId || !token) return null;
  return { accountId, token, accountHash, iam_hosted: true, source: 'platform' };
}

export async function resolveCfImagesUploadContext(env, ctx = {}) {
  const userId = trim(ctx.userId ?? ctx.user_id);
  const workspaceId = trim(ctx.workspaceId ?? ctx.workspace_id);
  const explicitAccountId = trim(ctx.cf_account_id ?? ctx.cloudflare_account_id);

  const wsRow = workspaceId ? await getAgentsamWorkspace(env, workspaceId) : null;
  let workspaceAccountId = explicitAccountId || trim(wsRow?.cloudflare_account_id);

  const oauthToken = userId ? await getCfOAuthAccessToken(env, userId) : null;
  if (oauthToken) {
    if (!workspaceAccountId) {
      const accounts = await listCfAccounts(oauthToken).catch(() => []);
      if (accounts.length === 1) workspaceAccountId = accounts[0].id;
      else if (accounts.length > 1) {
        return { ok: false, error: 'cloudflare_account_selection_required', accounts, iam_hosted: false };
      }
    }

    if (workspaceAccountId) {
      let accountHash = resolveWorkspaceImagesHash(wsRow, env);
      if (!accountHash) {
        try {
          accountHash = await fetchCfImagesAccountHash(workspaceAccountId, oauthToken);
          if (accountHash && workspaceId) await cacheWorkspaceImagesHash(env, workspaceId, accountHash);
        } catch {
          accountHash = trim(env?.CLOUDFLARE_IMAGES_ACCOUNT_HASH) || null;
        }
      }
      return {
        ok: true,
        iam_hosted: false,
        accountId: workspaceAccountId,
        token: oauthToken,
        accountHash,
        source: 'user_oauth',
      };
    }
  }

  const platform = platformImagesCreds(env);
  if (!platform) {
    return {
      ok: false,
      error: 'cf_images_not_configured',
      detail: 'Connect Cloudflare OAuth in Integrations or configure platform CF Images token',
      iam_hosted: true,
    };
  }
  return { ok: true, ...platform };
}
