/**
 * Workspace-scoped D1 execution resolver for agentsam_d1_* (catalog handler_type cf, operation d1.*).
 * Platform env.DB only for owner/superadmin without a customer D1 binding.
 * Customer workspaces fail closed when no BYO Cloudflare D1 is configured.
 */
import { authUserIsSuperadmin } from './auth.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { resolveWorkspaceCloudflareCredentials } from './workspace-cloudflare-credentials.js';
import { logDataPlaneSecurityEvent } from './data-plane-access-guard.js';

export const CUSTOMER_D1_NOT_CONFIGURED =
  'No Cloudflare D1 database is configured for this workspace. Add Cloudflare credentials and select a default D1 in Settings.';

/**
 * Workspace owner/admin (workspace_members) may use platform D1 when no BYO D1 is bound,
 * even when auth_users.role is `member`.
 *
 * @param {unknown} authUser
 */
function resolveOwnerFlags(authUser) {
  const role = String(authUser?.role ?? '').trim().toLowerCase();
  const membershipRole = String(authUser?.membership_role ?? '').trim().toLowerCase();
  const isSuperadmin = authUserIsSuperadmin(authUser);
  const isOwner =
    isSuperadmin ||
    role === 'owner' ||
    membershipRole === 'owner' ||
    membershipRole === 'admin';
  return { isSuperadmin, isOwner };
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
  return result?.results ?? result?.rows ?? [];
}

/**
 * @param {any} env
 * @param {{
 *   user_id?: string|null,
 *   tenant_id?: string|null,
 *   workspace_id?: string|null,
 *   authUser?: unknown,
 * }} ctx
 */
export async function resolveWorkspaceD1Execution(env, ctx) {
  const workspaceId = ctx?.workspace_id != null ? String(ctx.workspace_id).trim() : '';
  const userId = ctx?.user_id != null ? String(ctx.user_id).trim() : '';
  const tenantId = ctx?.tenant_id != null ? String(ctx.tenant_id).trim() : '';
  const { isOwner, isSuperadmin } = resolveOwnerFlags(ctx?.authUser);

  const meta = {
    workspace_id: workspaceId || null,
    user_id: userId || null,
    tenant_id: tenantId || null,
    provider: 'cloudflare_d1',
  };

  if (!workspaceId) {
    return {
      ok: false,
      mode: 'denied',
      error: 'WORKSPACE_CONTEXT_MISSING',
      user_message: 'Workspace context is required for D1 queries.',
      ...meta,
    };
  }

  const d1Binding = await getDefaultWorkspaceDataBinding(env, workspaceId, 'cloudflare_d1');
  const hasCustomerD1 =
    d1Binding?.external_database_id != null && String(d1Binding.external_database_id).trim() !== '';

  if (hasCustomerD1) {
    const creds = await resolveWorkspaceCloudflareCredentials(env, userId, tenantId, workspaceId);
    if (!creds.ok) {
      logDataPlaneSecurityEvent('customer_d1_credentials_missing', {
        ...meta,
        binding_id: d1Binding?.id ?? null,
        database_id: d1Binding?.external_database_id ?? null,
        reason: creds.error,
      });
      return {
        ok: false,
        mode: 'denied',
        error: creds.error || 'cloudflare_credentials_missing',
        user_message: CUSTOMER_D1_NOT_CONFIGURED,
        binding_id: d1Binding?.id ?? null,
        database_id: d1Binding?.external_database_id ?? null,
        account_id: creds.account_id ?? d1Binding?.external_account_id ?? null,
        ...meta,
      };
    }

    logDataPlaneSecurityEvent('workspace_d1_remote', {
      ...meta,
      binding_id: d1Binding.id,
      database_id: d1Binding.external_database_id,
      account_mask: creds.account_mask,
      key_id: creds.key_id,
    });

    return {
      ok: true,
      mode: 'remote',
      token: creds.token,
      account_id: creds.account_id || d1Binding.external_account_id,
      database_id: String(d1Binding.external_database_id),
      binding_id: d1Binding.id != null ? String(d1Binding.id) : null,
      key_id: creds.key_id,
      ...meta,
    };
  }

  if (isOwner || isSuperadmin) {
    logDataPlaneSecurityEvent('workspace_d1_platform', meta);
    return {
      ok: true,
      mode: 'platform',
      binding_id: null,
      database_id: null,
      ...meta,
    };
  }

  logDataPlaneSecurityEvent('customer_d1_not_configured', meta);
  return {
    ok: false,
    mode: 'denied',
    error: 'customer_d1_not_configured',
    user_message: CUSTOMER_D1_NOT_CONFIGURED,
    binding_id: null,
    database_id: null,
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
    const rows = await executeRemoteCloudflareD1Query(
      resolved.token,
      resolved.account_id,
      resolved.database_id,
      sql,
      params,
    );
    return {
      ok: true,
      mode: 'remote',
      rows: rows || [],
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
