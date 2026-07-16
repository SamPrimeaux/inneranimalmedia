/**
 * Workspace-scoped D1 execution resolver for agentsam_d1_* (catalog handler_type cf, operation d1.*).
 * platform_operator → env.DB unscoped (audited).
 * Non-operator → user OAuth account only (remote CF API); never env.DB platform path.
 */
import { IAM_D1_DATABASE_ID } from './d1-graphql-analytics.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { logDataPlaneSecurityEvent } from './data-plane-access-guard.js';
import { isPlatformOperator, resolveOperatorAuthUserRow } from './operator-identity.js';
import {
  assertCallerOwnsDatabaseId,
  isPlatformD1DatabaseId,
  listOAuthAccountD1Catalog,
  resolveCallerD1ByNameOrId,
} from './cf-mcp-proxy.js';
import { getOAuthToken } from './user-oauth-token.js';
import { getAgentsamWorkspace, parseWorkspaceMetadata } from './agentsam-workspace.js';

export const CUSTOMER_D1_NOT_CONFIGURED =
  'Connect Cloudflare in Integrations to use D1. IAM platform D1 is operator-only.';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Optional workspace default database_id (convenience pin — not a gate).
 * @param {any} env
 * @param {string} workspaceId
 */
async function resolveWorkspacePinnedDatabaseId(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!ws || !env?.DB) return '';
  const d1Binding = await getDefaultWorkspaceDataBinding(env, ws, 'cloudflare_d1');
  const fromBinding = trim(d1Binding?.external_database_id);
  if (fromBinding && fromBinding !== IAM_D1_DATABASE_ID) return fromBinding;

  const row = await getAgentsamWorkspace(env, ws);
  const meta = parseWorkspaceMetadata(row?.metadata_json);
  const pinned = trim(row?.d1_database_id);
  if (pinned && pinned !== IAM_D1_DATABASE_ID) return pinned;

  const arr = meta?.d1_databases;
  if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
    const id = trim(arr[0].database_id);
    if (id && id !== IAM_D1_DATABASE_ID) return id;
  }
  return '';
}

/**
 * @param {string} token
 * @param {string} accountId
 * @param {string} databaseId
 * @param {string} sql
 * @param {unknown[]} [params]
 */
export async function executeRemoteCloudflareD1Query(token, accountId, databaseId, sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: String(sql || ''),
        params: Array.isArray(params) ? params : [],
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    const msg = data?.errors?.[0]?.message || `cloudflare_d1_query_${res.status}`;
    throw new Error(String(msg));
  }
  const result = Array.isArray(data?.result) ? data.result[0] : data?.result;
  return {
    rows: result?.results ?? result?.rows ?? [],
    meta: result?.meta ?? {},
    success: result?.success !== false,
  };
}

/**
 * Remote D1 write via the same Cloudflare REST /query endpoint (supports mutating SQL).
 * @param {string} token
 * @param {string} accountId
 * @param {string} databaseId
 * @param {string} sql
 * @param {unknown[]} [params]
 */
export async function executeRemoteCloudflareD1Write(token, accountId, databaseId, sql, params = []) {
  const out = await executeRemoteCloudflareD1Query(token, accountId, databaseId, sql, params);
  return {
    changes: Number(out.meta?.changes ?? 0) || 0,
    last_row_id: out.meta?.last_row_id ?? null,
    meta: out.meta,
    rows: out.rows,
    success: out.success !== false,
  };
}

/**
 * @param {any} env
 * @param {{
 *   user_id?: string|null,
 *   tenant_id?: string|null,
 *   workspace_id?: string|null,
 *   database?: string|null,
 *   database_name?: string|null,
 *   database_id?: string|null,
 *   authUser?: unknown,
 * }} ctx
 */
export async function resolveWorkspaceD1Execution(env, ctx) {
  const workspaceId = ctx?.workspace_id != null ? String(ctx.workspace_id).trim() : '';
  const userId = ctx?.user_id != null ? String(ctx.user_id).trim() : '';
  const tenantId = ctx?.tenant_id != null ? String(ctx.tenant_id).trim() : '';
  const nameHint = trim(ctx?.database || ctx?.database_name);
  let requestedDatabaseId = trim(ctx?.database_id);

  const meta = {
    workspace_id: workspaceId || null,
    user_id: userId || null,
    tenant_id: tenantId || null,
    provider: 'cloudflare_d1',
  };

  // Preferred: plain CF database name → account catalog (not workspace_slug).
  // Platform IAM business D1: operators skip catalog REST and use env.DB immediately.
  if (nameHint || requestedDatabaseId) {
    const opRowNamedEarly = await resolveOperatorAuthUserRow(env, ctx?.authUser);
    const operatorEarly = await isPlatformOperator(env, opRowNamedEarly);
    const platformName =
      nameHint && nameHint.toLowerCase() === 'inneranimalmedia-business';
    const platformId =
      requestedDatabaseId && isPlatformD1DatabaseId(requestedDatabaseId);
    if (operatorEarly && (platformName || platformId || (!nameHint && !requestedDatabaseId))) {
      const dbId = platformId
        ? requestedDatabaseId
        : platformName
          ? IAM_D1_DATABASE_ID
          : requestedDatabaseId || IAM_D1_DATABASE_ID;
      logDataPlaneSecurityEvent('platform_operator_d1_unscoped', {
        ...meta,
        database_id: dbId,
        database_name: platformName ? 'inneranimalmedia-business' : meta.database_name,
        auth_scope: 'platform_operator',
        via: 'platform_binding_fastpath',
      });
      return {
        ok: true,
        mode: 'platform',
        binding_id: null,
        database_id: dbId,
        database_name: platformName ? 'inneranimalmedia-business' : null,
        ...meta,
      };
    }

    const byName = await resolveCallerD1ByNameOrId(
      env,
      userId,
      { database: nameHint || null, database_id: requestedDatabaseId || null },
      ctx?.authUser,
    );
    if (!byName.ok) {
      // Operator: invented/wrong CF database names (e.g. "agentsam") must not hard-fail —
      // default to IAM business D1 binding. Customers still get a clean deny.
      if (operatorEarly) {
        logDataPlaneSecurityEvent('platform_operator_d1_name_fallback', {
          ...meta,
          requested_database: nameHint || requestedDatabaseId || null,
          database_id: IAM_D1_DATABASE_ID,
          database_name: 'inneranimalmedia-business',
          auth_scope: 'platform_operator',
          prior_error: byName.error || 'database_not_in_account',
        });
        return {
          ok: true,
          mode: 'platform',
          binding_id: null,
          database_id: IAM_D1_DATABASE_ID,
          database_name: 'inneranimalmedia-business',
          fallback_from: nameHint || requestedDatabaseId || null,
          ...meta,
        };
      }
      return {
        ok: false,
        mode: 'denied',
        error: byName.error || 'database_not_in_account',
        user_message: byName.user_message || CUSTOMER_D1_NOT_CONFIGURED,
        available: byName.available || null,
        ...meta,
      };
    }
    requestedDatabaseId = trim(byName.database_id);
    meta.database_name = byName.database_name || nameHint || null;

    const opRowNamed = await resolveOperatorAuthUserRow(env, ctx?.authUser);
    const operatorNamed = await isPlatformOperator(env, opRowNamed);

    // Platform binding only for IAM business D1 (or no explicit target).
    if (operatorNamed && (!requestedDatabaseId || isPlatformD1DatabaseId(requestedDatabaseId))) {
      logDataPlaneSecurityEvent('platform_operator_d1_unscoped', {
        ...meta,
        database_id: requestedDatabaseId || IAM_D1_DATABASE_ID,
        auth_scope: 'platform_operator',
      });
      return {
        ok: true,
        mode: 'platform',
        binding_id: null,
        database_id: requestedDatabaseId || IAM_D1_DATABASE_ID,
        ...meta,
      };
    }

    if (operatorNamed && requestedDatabaseId && !isPlatformD1DatabaseId(requestedDatabaseId)) {
      const token =
        trim(byName.token) ||
        trim(env?.CLOUDFLARE_API_TOKEN) ||
        trim(await getOAuthToken(env, userId, 'cloudflare'));
      let accountId = trim(byName.account_id) || trim(env?.CLOUDFLARE_ACCOUNT_ID);
      if (token && !accountId) {
        const catalog = await listOAuthAccountD1Catalog(token);
        accountId = trim(
          catalog.find((e) => e.database_id.toLowerCase() === requestedDatabaseId.toLowerCase())
            ?.account_id,
        );
      }
      if (!token || !accountId) {
        return {
          ok: false,
          mode: 'denied',
          error: 'cloudflare_token_missing',
          user_message: 'Platform Cloudflare token required to query non-platform D1 by name.',
          database_id: requestedDatabaseId,
          ...meta,
        };
      }
      logDataPlaneSecurityEvent('platform_operator_d1_remote_by_name', {
        ...meta,
        database_id: requestedDatabaseId,
        account_id: accountId,
        auth_scope: 'platform_operator',
      });
      return {
        ok: true,
        mode: 'remote',
        token,
        account_id: accountId,
        database_id: requestedDatabaseId,
        binding_id: null,
        via: 'platform_cf_token',
        ...meta,
      };
    }

    // Non-operator: already ownership-checked via resolveCallerD1ByNameOrId.
    const token = trim(byName.token) || trim(await getOAuthToken(env, userId, 'cloudflare'));
    const accountId = trim(byName.account_id);
    if (!token || !accountId) {
      return {
        ok: false,
        mode: 'denied',
        error: 'cloudflare_not_connected',
        user_message: CUSTOMER_D1_NOT_CONFIGURED,
        database_id: requestedDatabaseId,
        ...meta,
      };
    }
    logDataPlaneSecurityEvent('workspace_d1_user_account', {
      ...meta,
      database_id: requestedDatabaseId,
      account_id: accountId,
      auth_scope: 'user_account',
    });
    return {
      ok: true,
      mode: 'remote',
      token,
      account_id: accountId,
      database_id: requestedDatabaseId,
      binding_id: null,
      via: 'user_oauth_cloudflare',
      ...meta,
    };
  }

  const opRow = await resolveOperatorAuthUserRow(env, ctx?.authUser);
  const operator = await isPlatformOperator(env, opRow);

  if (operator) {
    logDataPlaneSecurityEvent('platform_operator_d1_unscoped', {
      ...meta,
      auth_scope: 'platform_operator',
    });
    return {
      ok: true,
      mode: 'platform',
      binding_id: null,
      database_id: null,
      ...meta,
    };
  }

  if (!userId) {
    return {
      ok: false,
      mode: 'denied',
      error: 'user_oauth_required',
      user_message: 'Sign in before using D1 tools.',
      ...meta,
    };
  }

  // Soft default only: session workspace pin (never a slug gate).
  const pinnedDatabaseId = workspaceId ? await resolveWorkspacePinnedDatabaseId(env, workspaceId) : '';
  const databaseId = pinnedDatabaseId;
  if (!databaseId) {
    const oauth = await getOAuthToken(env, userId, 'cloudflare');
    if (!oauth) {
      return {
        ok: false,
        mode: 'denied',
        error: 'cloudflare_not_connected',
        user_message: CUSTOMER_D1_NOT_CONFIGURED,
        ...meta,
      };
    }
    return {
      ok: false,
      mode: 'denied',
      error: 'database_required',
      user_message:
        'Pass database (Cloudflare D1 name, e.g. inneranimalmedia-business) or connect a workspace pin.',
      ...meta,
    };
  }

  const owned = await assertCallerOwnsDatabaseId(env, userId, databaseId, ctx?.authUser);
  if (!owned.ok) {
    return {
      ok: false,
      mode: 'denied',
      error: owned.error || 'database_id_not_in_account',
      user_message: owned.user_message || CUSTOMER_D1_NOT_CONFIGURED,
      database_id: databaseId,
      ...meta,
    };
  }

  const token = owned.token || (await getOAuthToken(env, userId, 'cloudflare'));
  if (!token) {
    return {
      ok: false,
      mode: 'denied',
      error: 'cloudflare_not_connected',
      user_message: CUSTOMER_D1_NOT_CONFIGURED,
      ...meta,
    };
  }

  let accountId = trim(owned.account_id);
  if (!accountId) {
    const catalog = await listOAuthAccountD1Catalog(token);
    accountId = trim(catalog.find((e) => e.database_id.toLowerCase() === databaseId.toLowerCase())?.account_id);
  }

  if (!accountId) {
    return {
      ok: false,
      mode: 'denied',
      error: 'account_id_unresolved',
      user_message: CUSTOMER_D1_NOT_CONFIGURED,
      database_id: databaseId,
      ...meta,
    };
  }

  const d1Binding = workspaceId
    ? await getDefaultWorkspaceDataBinding(env, workspaceId, 'cloudflare_d1')
    : null;

  logDataPlaneSecurityEvent('workspace_d1_user_account', {
    ...meta,
    database_id: databaseId,
    account_id: accountId,
    auth_scope: 'user_account',
    binding_id: d1Binding?.id ?? null,
  });

  return {
    ok: true,
    mode: 'remote',
    token,
    account_id: accountId,
    database_id: databaseId,
    binding_id: d1Binding?.id != null ? String(d1Binding.id) : null,
    via: 'user_oauth_cloudflare',
    ...meta,
  };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} ctx
 * @param {string} sql
 * @param {unknown[]} [params]
 */
export async function executeWorkspaceD1Query(env, ctx, sql, params = []) {
  const resolved = await resolveWorkspaceD1Execution(env, ctx);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      user_message: resolved.user_message,
      workspace_id: resolved.workspace_id,
    };
  }

  if (resolved.mode === 'platform') {
    const { d1_query } = await import('./d1.js');
    const rows = await d1_query({ sql, params }, env);
    return { ok: true, mode: 'platform', rows: rows || [], meta: {} };
  }

  if (resolved.mode === 'remote') {
    const out = await executeRemoteCloudflareD1Query(
      resolved.token,
      resolved.account_id,
      resolved.database_id,
      sql,
      params,
    );
    return {
      ok: true,
      mode: 'remote',
      rows: out.rows || [],
      meta: {
        workspace_id: resolved.workspace_id,
        binding_id: resolved.binding_id,
        database_id: resolved.database_id,
        account_id: resolved.account_id,
      },
    };
  }

  return {
    ok: false,
    error: resolved.error || 'd1_execution_denied',
    user_message: resolved.user_message,
  };
}

/**
 * Workspace-scoped D1 write (platform env.DB for operator only; remote for user_account).
 * @param {any} env
 * @param {Record<string, unknown>} ctx
 * @param {string} sql
 * @param {unknown[]} [params]
 */
export async function executeWorkspaceD1Write(env, ctx, sql, params = []) {
  const resolved = await resolveWorkspaceD1Execution(env, ctx);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      user_message: resolved.user_message,
      workspace_id: resolved.workspace_id,
    };
  }

  if (resolved.mode === 'platform') {
    const { d1_write } = await import('./d1.js');
    const out = await d1_write({ sql, params }, env);
    return { ok: true, mode: 'platform', body: out, meta: {} };
  }

  if (resolved.mode === 'remote') {
    const out = await executeRemoteCloudflareD1Write(
      resolved.token,
      resolved.account_id,
      resolved.database_id,
      sql,
      params,
    );
    return {
      ok: true,
      mode: 'remote',
      body: {
        changes: out.changes,
        last_row_id: out.last_row_id,
        success: out.success,
      },
      meta: {
        workspace_id: resolved.workspace_id,
        binding_id: resolved.binding_id,
        database_id: resolved.database_id,
        account_id: resolved.account_id,
      },
    };
  }

  return {
    ok: false,
    error: resolved.error || 'd1_execution_denied',
    user_message: resolved.user_message,
  };
}
