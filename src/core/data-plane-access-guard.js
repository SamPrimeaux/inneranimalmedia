/**
 * Hard denies — platform env.DB / env.HYPERDRIVE must never serve non-owner customer DB intents.
 */

export const PLATFORM_DATA_PLANES = Object.freeze(['platform_d1', 'platform_supabase_agentsam']);

const PLATFORM_TOOL_NAME_RE =
  /^(d1_|hyperdrive_|platform_d1|platform_hyperdrive|platform_supabase|supabase_query|supabase_write|supabase_schema)/i;

const CUSTOMER_TOOL_NAME_RE =
  /^(customer_|public_learning_)/i;

/**
 * @param {string} dataPlane
 */
export function isPlatformDataPlane(dataPlane) {
  return PLATFORM_DATA_PLANES.includes(String(dataPlane || '').trim());
}

/**
 * @param {string} dataPlane
 */
export function isCustomerDataPlane(dataPlane) {
  const p = String(dataPlane || '');
  return p.startsWith('customer_');
}

/**
 * @param {string} code
 * @param {Record<string, unknown>} [fields]
 */
export function logDataPlaneSecurityEvent(code, fields = {}) {
  console.info(`[data-plane] ${code}`, JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}

/**
 * @param {string} sql
 */
function sqlReferencesAgentsamSchema(sql) {
  const s = String(sql || '');
  return /\bagentsam\./i.test(s) || /\bagentsam_[a-z0-9_]+\b/i.test(s);
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>|null|undefined} [handlerConfig]
 */
export function isPlatformOnlyCatalogTool(toolName, handlerConfig = null) {
  const n = String(toolName || '').trim();
  if (!n) return false;
  if (PLATFORM_TOOL_NAME_RE.test(n)) return true;
  const cfg = handlerConfig && typeof handlerConfig === 'object' ? handlerConfig : {};
  if (cfg.admin_only === true || cfg.admin_only === 1) return true;
  const plane = String(cfg.data_plane || '').trim();
  if (isPlatformDataPlane(plane)) return true;
  if (String(cfg.dispatcher || '') === 'database_assistant' && isPlatformDataPlane(plane)) return true;
  return false;
}

/**
 * @param {string} toolName
 */
export function isCustomerOrPublicCatalogTool(toolName) {
  const n = String(toolName || '').trim();
  return CUSTOMER_TOOL_NAME_RE.test(n) || n.startsWith('public_learning');
}

/**
 * @param {Record<string, unknown>|null|undefined} resolvedContext
 * @param {string} dataPlane
 * @param {string} [operation]
 * @param {{ sql?: string|null, migration_sql?: string|null }} [opts]
 */
export function assertDataPlaneAccess(resolvedContext, dataPlane, operation = '', opts = {}) {
  const plane = String(dataPlane || resolvedContext?.data_plane || '').trim();
  const op = String(operation || '').trim();
  const ctx = resolvedContext || {};
  const isOwner = ctx.is_owner === true || ctx.is_superadmin === true;
  const sql = opts.sql != null ? String(opts.sql) : opts.migration_sql != null ? String(opts.migration_sql) : '';

  const meta = {
    data_plane: plane,
    operation: op,
    user_id: ctx.user_id ?? null,
    workspace_id: ctx.workspace_id ?? null,
    tenant_id: ctx.tenant_id ?? null,
  };

  if (plane === 'platform_access_denied') {
    logDataPlaneSecurityEvent('access_denied', { ...meta, reason: 'platform_access_denied' });
    return deny('platform_access_denied', 'IAM platform internals are owner-only.');
  }

  if (isPlatformDataPlane(plane) && !isOwner) {
    logDataPlaneSecurityEvent('platform_binding_blocked_for_non_owner', meta);
    logDataPlaneSecurityEvent('access_denied', { ...meta, reason: 'platform_binding_blocked_for_non_owner' });
    return deny(
      'platform_binding_blocked_for_non_owner',
      'IAM platform database (env.DB / env.HYPERDRIVE agentsam.*) is owner-only. Connect your Supabase or Cloudflare D1, or use public learning examples.',
    );
  }

  if (!isOwner && sql && sqlReferencesAgentsamSchema(sql)) {
    logDataPlaneSecurityEvent('access_denied', { ...meta, reason: 'agentsam_schema_denied_non_owner' });
    return deny(
      'agentsam_schema_denied_non_owner',
      'Raw agentsam.* access is platform-owner only. Use public.iam_* learning tables or your connected database.',
    );
  }

  if (plane === 'customer_supabase') {
    const connected =
      ctx.customer_connection_ok === true ||
      (ctx.project_ref != null && String(ctx.project_ref).trim() !== '') ||
      (ctx.external_project_id != null && String(ctx.external_project_id).trim() !== '');
    if (!connected) {
      logDataPlaneSecurityEvent('customer_connection_required', { ...meta, provider: 'supabase' });
      return deny(
        'customer_database_not_connected',
        'Connect your Supabase project in integrations and select a workspace default before running SQL.',
      );
    }
    logDataPlaneSecurityEvent('selected_customer_data_plane', {
      ...meta,
      provider: 'supabase',
      project_ref: ctx.project_ref ?? null,
    });
    return allow('customer_supabase_ok');
  }

  if (plane === 'customer_cloudflare_d1') {
    const connected =
      ctx.customer_connection_ok === true ||
      (ctx.account_id != null &&
        String(ctx.account_id).trim() !== '' &&
        ctx.database_id != null &&
        String(ctx.database_id).trim() !== '');
    if (!connected) {
      logDataPlaneSecurityEvent('customer_connection_required', { ...meta, provider: 'cloudflare_d1' });
      return deny(
        'customer_database_not_connected',
        'Connect Cloudflare OAuth and select a D1 database for this workspace.',
      );
    }
    logDataPlaneSecurityEvent('selected_customer_data_plane', { ...meta, provider: 'cloudflare_d1' });
    return allow('customer_cloudflare_d1_ok');
  }

  if (plane === 'customer_cloudflare_r2') {
    logDataPlaneSecurityEvent('selected_customer_data_plane', { ...meta, provider: 'cloudflare_r2' });
    return allow('customer_cloudflare_r2_ok');
  }

  if (plane === 'public_learning') {
    return allow('public_learning_ok');
  }

  if (isPlatformDataPlane(plane) && isOwner) {
    return allow('platform_owner_ok');
  }

  return allow('ok');
}

/**
 * @param {string} reason
 * @param {string} userMessage
 */
function deny(reason, userMessage) {
  return {
    allowed: false,
    reason,
    error: reason === 'customer_database_not_connected' ? 'customer_database_not_connected' : 'access_denied',
    user_message: userMessage,
  };
}

/**
 * @param {string} reason
 */
function allow(reason) {
  return { allowed: true, reason, error: null, user_message: null };
}
