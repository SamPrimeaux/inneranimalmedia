/**
 * Canonical runtime data-plane resolver — platform vs customer vs public learning.
 * SECURITY: non-owner customer DB intents never resolve to platform_d1 / platform_supabase_agentsam.
 */
import { authUserIsSuperadmin } from './auth.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { isPlatformDataPlane, logDataPlaneSecurityEvent } from './data-plane-access-guard.js';

/** @typedef {'platform_d1'|'platform_supabase_agentsam'|'platform_access_denied'|'public_learning'|'customer_supabase'|'customer_cloudflare_d1'|'customer_cloudflare_r2'|'customer_github'|'customer_drive'} DataPlane */

/**
 * @param {unknown} message
 */
function messageWantsPublicLearning(message) {
  const m = String(message || '').toLowerCase();
  return (
    /\b(public examples?|public learning|iam learning|learning layer|onboarding examples?)\b/i.test(m) ||
    /\bpublic\.iam_/i.test(m) ||
    (/\b(show|list|explore)\b/i.test(m) && /\b(examples?|modules?|tool cards?)\b/i.test(m) && !/\bmy\b/i.test(m))
  );
}

/**
 * @param {unknown} message
 */
function messageWantsCustomerSupabase(message) {
  const m = String(message || '').toLowerCase();
  return (
    /\bmy supabase\b/i.test(m) ||
    /\bmy (postgres|database|db|project)\b/i.test(m) ||
    /\b(run|execute).{0,20}sql.{0,20}my\b/i.test(m) ||
    (/\bmy\b/i.test(m) && /\b(table|schema|column)\b/i.test(m) && !/\bagentsam_/i.test(m)) ||
    (/\b(select|explain)\b/i.test(m) && /\bfrom\b/i.test(m) && !/\bagentsam[._]/i.test(m))
  );
}

/**
 * @param {unknown} message
 */
function messageWantsCustomerCloudflareD1(message) {
  const m = String(message || '').toLowerCase();
  return (
    /\b(my cloudflare d1|my d1 database|query my d1|my d1)\b/i.test(m) ||
    (/\bmy\b/i.test(m) && /\bd1\b/i.test(m))
  );
}

/**
 * @param {unknown} message
 */
function messageWantsCustomerCloudflareR2(message) {
  const m = String(message || '').toLowerCase();
  return /\b(my r2|my bucket|my cloudflare r2)\b/i.test(m);
}

/**
 * @param {unknown} message
 */
function messageWantsPlatformAgentsam(message) {
  const m = String(message || '').toLowerCase();
  return (
    /\bagentsam[._]/i.test(m) ||
    /\b(platform (db|database|hyperdrive)|iam platform|inneranimalmedia-business)\b/i.test(m) ||
    (/\b(workflow_runs|workflow_handlers|prompt_routes|model_catalog)\b/i.test(m) &&
      !/\bmy\b/i.test(m))
  );
}

/**
 * @param {unknown} authUser
 */
function resolveOwnerFlags(authUser) {
  const role = String(authUser?.role ?? '').trim().toLowerCase();
  const isSuperadmin = authUserIsSuperadmin(authUser);
  const isOwner = isSuperadmin || role === 'owner';
  return { isSuperadmin, isOwner };
}

/**
 * @param {{
 *   user_id?: string|null,
 *   tenant_id?: string|null,
 *   workspace_id?: string|null,
 *   intent?: string|null,
 *   message?: string|null,
 *   requested_provider?: string|null,
 *   requested_project_id?: string|null,
 *   requested_resource?: string|null,
 *   operation_type?: string|null,
 *   authUser?: unknown,
 * }} input
 * @param {any} env
 */
export async function resolveCustomerDataPlane(env, input) {
  const message = String(input.message || input.intent || '').trim();
  const workspaceId = input.workspace_id != null ? String(input.workspace_id).trim() : '';
  const userId = input.user_id != null ? String(input.user_id).trim() : '';
  const tenantId = input.tenant_id != null ? String(input.tenant_id).trim() : '';
  const requestedProvider = input.requested_provider != null ? String(input.requested_provider).trim().toLowerCase() : '';
  const { isOwner, isSuperadmin } = resolveOwnerFlags(input.authUser);

  /** @type {DataPlane} */
  let data_plane = 'public_learning';
  let owner_type = 'public_learning';
  let provider = 'public';
  let degraded_reason = null;
  let requires_approval = false;
  let customer_connection_ok = false;

  const providerMap = {
    supabase: 'customer_supabase',
    customer_supabase: 'customer_supabase',
    cloudflare: 'customer_cloudflare_d1',
    cloudflare_d1: 'customer_cloudflare_d1',
    cloudflare_r2: 'customer_cloudflare_r2',
    github: 'customer_github',
    google_drive: 'customer_drive',
    drive: 'customer_drive',
    public_learning: 'public_learning',
    platform_d1: 'platform_d1',
    platform_supabase: 'platform_supabase_agentsam',
    platform_supabase_agentsam: 'platform_supabase_agentsam',
  };

  const wantsCustomer =
    messageWantsCustomerSupabase(message) ||
    messageWantsCustomerCloudflareD1(message) ||
    messageWantsCustomerCloudflareR2(message);

  if (requestedProvider && providerMap[requestedProvider]) {
    data_plane = providerMap[requestedProvider];
  } else if (messageWantsPublicLearning(message)) {
    data_plane = 'public_learning';
  } else if (messageWantsCustomerCloudflareR2(message)) {
    data_plane = 'customer_cloudflare_r2';
  } else if (messageWantsCustomerCloudflareD1(message)) {
    data_plane = 'customer_cloudflare_d1';
  } else if (messageWantsCustomerSupabase(message)) {
    data_plane = 'customer_supabase';
  } else if (messageWantsPlatformAgentsam(message)) {
    if (isOwner || isSuperadmin) {
      data_plane = 'platform_supabase_agentsam';
    } else {
      data_plane = 'platform_access_denied';
      degraded_reason = 'platform_schema_denied_non_owner';
      logDataPlaneSecurityEvent('platform_binding_blocked_for_non_owner', {
        user_id: userId,
        workspace_id: workspaceId,
        message_preview: message.slice(0, 120),
      });
    }
  } else if (isOwner || isSuperadmin) {
    data_plane = 'platform_supabase_agentsam';
  } else if (wantsCustomer) {
    data_plane = messageWantsCustomerCloudflareD1(message)
      ? 'customer_cloudflare_d1'
      : messageWantsCustomerCloudflareR2(message)
        ? 'customer_cloudflare_r2'
        : 'customer_supabase';
  } else {
    data_plane = 'public_learning';
    degraded_reason = 'default_public_learning_for_non_owner';
  }

  if (isPlatformDataPlane(data_plane) && !isOwner && !isSuperadmin) {
    data_plane = 'platform_access_denied';
    degraded_reason = 'platform_binding_blocked_for_non_owner';
  }

  owner_type =
    data_plane === 'public_learning'
      ? 'public_learning'
      : data_plane === 'platform_access_denied'
        ? 'platform'
        : data_plane.startsWith('platform_')
          ? 'platform'
          : 'customer';

  if (data_plane.startsWith('customer_')) {
    provider = data_plane.replace('customer_', '');
  } else if (data_plane.startsWith('platform_')) {
    provider = data_plane.replace('platform_', '');
  }

  let connection_id = null;
  let project_ref = null;
  let external_project_id = input.requested_project_id != null ? String(input.requested_project_id) : null;
  let external_database_id = null;
  let external_account_id = null;
  let schema = 'public';
  let permissions = { read: true, write: false, ddl: false };
  let policy = { owner_type, data_plane };

  if (data_plane === 'customer_supabase' && workspaceId) {
    const binding = await getDefaultWorkspaceDataBinding(env, workspaceId, 'supabase');
    connection_id = binding?.connection_id != null ? String(binding.connection_id) : 'supabase_oauth';
    project_ref = binding?.external_project_ref != null ? String(binding.external_project_ref) : null;
    external_project_id =
      binding?.external_project_id != null ? String(binding.external_project_id) : external_project_id;
    customer_connection_ok = Boolean(project_ref || external_project_id);
    if (!customer_connection_ok) {
      degraded_reason = degraded_reason || 'supabase_project_not_selected';
    }
    permissions = { read: true, write: false, ddl: false };
    requires_approval = true;
  }

  if (data_plane === 'customer_cloudflare_d1' && workspaceId) {
    const binding = await getDefaultWorkspaceDataBinding(env, workspaceId, 'cloudflare_d1');
    connection_id = binding?.connection_id != null ? String(binding.connection_id) : 'cloudflare_oauth';
    external_account_id = binding?.external_account_id != null ? String(binding.external_account_id) : null;
    external_database_id = binding?.external_database_id != null ? String(binding.external_database_id) : null;
    customer_connection_ok = Boolean(external_account_id && external_database_id);
    if (!customer_connection_ok) {
      degraded_reason = degraded_reason || 'cloudflare_d1_not_selected';
    }
    requires_approval = true;
  }

  if (data_plane === 'platform_supabase_agentsam' || data_plane === 'platform_d1') {
    schema = 'agentsam';
    permissions = {
      read: isOwner || isSuperadmin,
      write: isOwner || isSuperadmin,
      ddl: isOwner || isSuperadmin,
    };
    requires_approval = !(isOwner || isSuperadmin);
  }

  if (data_plane === 'public_learning') {
    schema = 'public';
    permissions = { read: true, write: false, ddl: false };
    requires_approval = false;
  }

  const operation_type = input.operation_type != null ? String(input.operation_type) : null;
  if (operation_type && /^(propose_migration|apply|ddl|dml|delete|update|insert)/i.test(operation_type)) {
    requires_approval = true;
  }

  return {
    data_plane,
    owner_type,
    provider,
    connection_id,
    project_ref,
    account_id: external_account_id,
    database_id: external_database_id,
    external_project_id,
    schema,
    permissions,
    policy,
    requires_approval,
    degraded_reason,
    customer_connection_ok,
    tenant_id: tenantId || null,
    workspace_id: workspaceId || null,
    user_id: userId || null,
    is_owner: isOwner,
    is_superadmin: isSuperadmin,
  };
}
