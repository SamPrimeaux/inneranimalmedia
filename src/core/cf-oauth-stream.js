/**
 * CF Stream credentials — customer Cloudflare OAuth first; platform only when explicitly allowed.
 *
 * Reuses the same Cloudflare connection as Images:
 * - user_oauth_tokens Cloudflare row
 * - resolveCloudflareOAuthToken (canonical refresh)
 * - workspaces.cloudflare_account_id / account-selection flow
 *
 * Ownership boundary is cloudflare_account_id (not IAM workspace).
 * Platform fallback never happens for ordinary customers — reconnect instead.
 */
import { resolveCloudflareOAuthToken } from './user-oauth-token.js';
import { getAgentsamWorkspace } from './agentsam-workspace.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function scopeSet(scopes) {
  const set = new Set();
  for (const s of Array.isArray(scopes) ? scopes : String(scopes || '').split(/[\s,]+/)) {
    const t = trim(s);
    if (t) set.add(t);
  }
  return set;
}

function streamCapabilitiesFromScopes(scopes) {
  const set = scopeSet(scopes);
  // Empty scopes (legacy rows / API tokens) → treat as unknown; probe later via API.
  if (!set.size) {
    return { read: true, write: true, scopesKnown: false };
  }
  const read = set.has('stream.read') || set.has('stream.write');
  const write = set.has('stream.write');
  return { read, write, scopesKnown: true };
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

/** Platform Stream secrets — never used unless allowPlatformFallback + operator. */
export function platformStreamCreds(env) {
  const accountId = trim(env?.CLOUDFLARE_ACCOUNT_ID);
  const token = trim(env?.CLOUDFLARE_STREAM_TOKEN || env?.CLOUDFLARE_API_TOKEN);
  if (!accountId || !token) return null;
  return {
    ok: true,
    accountId,
    token,
    source: 'platform',
    platformOwned: true,
    refreshed: false,
    expiresAt: null,
    capabilities: { read: true, write: true },
  };
}

/**
 * Resolve Stream API context for the authenticated user / selected Cloudflare account.
 *
 * @param {any} env
 * @param {{
 *   userId?: string,
 *   workspaceId?: string,
 *   cloudflareAccountId?: string,
 *   requireWrite?: boolean,
 *   allowPlatformFallback?: boolean,
 * }} [opts]
 */
export async function resolveCfStreamContext(env, opts = {}) {
  const userId = trim(opts.userId ?? opts.user_id);
  const workspaceId = trim(opts.workspaceId ?? opts.workspace_id);
  const explicitAccountId = trim(
    opts.cloudflareAccountId ?? opts.cloudflare_account_id ?? opts.cf_account_id,
  );
  const requireWrite = opts.requireWrite === true;
  const allowPlatformFallback = opts.allowPlatformFallback === true;

  const wsRow = workspaceId ? await getAgentsamWorkspace(env, workspaceId) : null;
  let accountId = explicitAccountId || trim(wsRow?.cloudflare_account_id);

  const oauthResolved = userId
    ? await resolveCloudflareOAuthToken(env, userId, { nearExpirySeconds: 300 })
    : null;

  if (oauthResolved?.ok && oauthResolved.accessToken) {
    const caps = streamCapabilitiesFromScopes(oauthResolved.scopes);
    if (caps.scopesKnown && !caps.read) {
      return {
        ok: false,
        error: 'stream_scope_missing',
        reconnectRequired: true,
        capabilities: caps,
        message: 'Reconnect Cloudflare and grant Stream Read / Stream Write.',
      };
    }
    if (requireWrite && caps.scopesKnown && !caps.write) {
      return {
        ok: false,
        error: 'stream_scope_missing',
        reconnectRequired: true,
        capabilities: caps,
        message: 'Reconnect Cloudflare with Stream Write to mutate videos.',
      };
    }

    if (!accountId && oauthResolved.accountId) {
      accountId = trim(oauthResolved.accountId);
    }
    if (!accountId) {
      const accounts = await listCfAccounts(oauthResolved.accessToken).catch(() => []);
      if (accounts.length === 1) accountId = accounts[0].id;
      else if (accounts.length > 1) {
        return {
          ok: false,
          error: 'cloudflare_account_selection_required',
          accounts,
          reconnectRequired: false,
        };
      }
    }

    if (accountId) {
      return {
        ok: true,
        accountId,
        token: oauthResolved.accessToken,
        source: 'oauth',
        platformOwned: false,
        refreshed: !!oauthResolved.refreshed,
        expiresAt: oauthResolved.expiresAt ?? null,
        capabilities: {
          read: caps.read,
          write: caps.write,
        },
      };
    }

    return {
      ok: false,
      error: 'cloudflare_stream_not_connected',
      reconnectRequired: true,
      message: 'No Cloudflare account selected for Stream.',
    };
  }

  // Stricter than Images: platform only when caller opts in (platform operator on IAM account).
  if (allowPlatformFallback) {
    const platform = platformStreamCreds(env);
    if (platform) return platform;
  }

  const oauthCode =
    oauthResolved && !oauthResolved.ok
      ? oauthResolved.code || 'cloudflare_oauth_unavailable'
      : null;

  return {
    ok: false,
    error: oauthCode || 'cloudflare_stream_not_connected',
    reconnectRequired: true,
    message: 'Connect Cloudflare with Stream Read / Stream Write, or reconnect.',
  };
}

/**
 * Map resolveCfStreamContext failures to HTTP responses.
 * @param {any} streamCtx
 * @param {(body: any, status?: number) => Response} jsonResponse
 */
export function streamContextErrorResponse(streamCtx, jsonResponse) {
  const err = String(streamCtx?.error || 'cloudflare_stream_not_connected');
  if (err === 'cloudflare_account_selection_required') {
    return jsonResponse(
      {
        ok: false,
        error: err,
        accounts: streamCtx.accounts || [],
        account_selection_required: true,
      },
      409,
    );
  }
  if (err === 'stream_scope_missing') {
    return jsonResponse(
      {
        ok: false,
        error: err,
        reconnect_required: true,
        capabilities: streamCtx.capabilities || { read: false, write: false },
        message: streamCtx.message || null,
      },
      403,
    );
  }
  return jsonResponse(
    {
      ok: false,
      error: err,
      reconnect_required: !!streamCtx?.reconnectRequired,
      message: streamCtx?.message || null,
    },
    401,
  );
}
