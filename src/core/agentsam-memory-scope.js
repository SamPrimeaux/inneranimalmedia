/**
 * Memory semantic scope vs transport provenance.
 * Transport (MCP bridge workspace) must never become semantic scope.
 */

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Resolve auth from MCP/workspace context — never from agent args for user/tenant.
 * @param {Record<string, unknown>} env
 * @param {Record<string, unknown>} workspace
 */
export async function resolveMemoryAuth(env, workspace) {
  const tenantId = trim(workspace?.tenant_id);
  const userId = trim(workspace?.user_id);
  const workspaceId = trim(workspace?.workspace_id) || null;
  let isSuperadmin = workspace?._is_superadmin === true;
  if (!isSuperadmin && userId && env?.DB) {
    try {
      const row = await env.DB.prepare(
        `SELECT COALESCE(is_superadmin,0) AS is_superadmin, role FROM auth_users WHERE id = ? LIMIT 1`,
      )
        .bind(userId)
        .first();
      isSuperadmin =
        Number(row?.is_superadmin) === 1 || String(row?.role || '').toLowerCase() === 'superadmin';
    } catch {
      /* ignore */
    }
  }
  return {
    tenant_id: tenantId,
    user_id: userId,
    workspace_id: workspaceId,
    is_superadmin: isSuperadmin,
  };
}

export const TRANSPORT_WORKSPACE_KEYS = Object.freeze(
  new Set([
    'ws_inneranimalmedia_mcp',
    'ws_inneranimalmedia_mcp_server',
    'ws_mcp',
  ]),
);

export const PLATFORM_PROJECT_WORKSPACE = 'ws_inneranimalmedia';

/**
 * @param {string} workspaceKey
 */
export function isTransportWorkspaceKey(workspaceKey) {
  return TRANSPORT_WORKSPACE_KEYS.has(trim(workspaceKey));
}

/**
 * Infer source_client from workspace / args.
 * @param {Record<string, unknown>} workspace
 * @param {Record<string, unknown>} args
 */
export function resolveSourceClient(workspace = {}, args = {}) {
  const explicit = trim(args.source_client || args.client || args.external_client_key);
  if (explicit) return explicit.slice(0, 64);
  const ext = trim(workspace.external_client_key || workspace.oauth_client_id);
  if (/chatgpt|openai/i.test(ext)) return 'chatgpt';
  if (/claude|anthropic/i.test(ext)) return 'claude';
  if (/cursor/i.test(ext)) return 'cursor';
  if (trim(workspace.token_id) === 'bridge') return 'mcp_bridge';
  if (trim(workspace.workspace_id) && isTransportWorkspaceKey(workspace.workspace_id)) {
    return 'mcp';
  }
  return 'dashboard';
}

/**
 * Resolve semantic scope for a memory write/search.
 * Never uses transport MCP workspace as semantic project scope.
 *
 * @param {{
 *   auth: { tenant_id: string, user_id: string, workspace_id?: string|null, is_superadmin?: boolean, authorized_workspaces?: string[] },
 *   args?: Record<string, unknown>,
 *   env?: any,
 * }} opts
 */
export async function resolveMemorySemanticScope(opts = {}) {
  const auth = opts.auth || {};
  const args = opts.args || {};
  const errors = [];

  const transportWorkspaceKey =
    trim(args.transport_workspace_key) ||
    (isTransportWorkspaceKey(auth.workspace_id) ? trim(auth.workspace_id) : null) ||
    (isTransportWorkspaceKey(args.workspace_id) ? trim(args.workspace_id) : null);

  const sourceClient = resolveSourceClient(
    { ...auth, workspace_id: auth.workspace_id, token_id: args.token_id, external_client_key: args.external_client_key },
    args,
  );

  // Agent-supplied tenant/user already rejected in draftMemoryCommit.
  const requestedProject =
    trim(args.active_project_workspace_key) ||
    trim(args.project_workspace_id) ||
    trim(args.semantic_workspace_id) ||
    (!isTransportWorkspaceKey(args.workspace_id) ? trim(args.workspace_id) : '') ||
    (!isTransportWorkspaceKey(auth.workspace_id) ? trim(auth.workspace_id) : '');

  let scopeType = trim(args.scope_type) || 'user';
  let scopeId = trim(args.scope_id) || trim(auth.user_id);
  let activeProjectWorkspaceKey = requestedProject || null;

  // Preferences default to user scope
  const memType = trim(args.memory_type).toLowerCase();
  if (memType === 'preference' && !trim(args.scope_type)) {
    scopeType = 'user';
    scopeId = trim(auth.user_id);
  }
  if (memType === 'policy' && trim(args.scope_type) === 'platform') {
    scopeType = 'platform';
    scopeId = trim(auth.tenant_id) || 'platform';
    activeProjectWorkspaceKey = activeProjectWorkspaceKey || PLATFORM_PROJECT_WORKSPACE;
  }

  // If caller is on MCP transport and did not name a project, default IAM project — never MCP silo.
  if (!activeProjectWorkspaceKey && transportWorkspaceKey) {
    activeProjectWorkspaceKey = PLATFORM_PROJECT_WORKSPACE;
  }
  if (!activeProjectWorkspaceKey) {
    activeProjectWorkspaceKey = PLATFORM_PROJECT_WORKSPACE;
  }

  if (isTransportWorkspaceKey(activeProjectWorkspaceKey)) {
    errors.push('transport_workspace_cannot_be_semantic_scope');
    activeProjectWorkspaceKey = PLATFORM_PROJECT_WORKSPACE;
  }

  // Authorization: non-superadmin may only write/search project workspaces they belong to
  if (activeProjectWorkspaceKey && !auth.is_superadmin && opts.env?.DB && auth.user_id) {
    try {
      const member = await opts.env.DB.prepare(
        `SELECT 1 AS ok FROM workspace_members
          WHERE user_id = ? AND workspace_id = ? AND COALESCE(status,'active') = 'active'
          LIMIT 1`,
      )
        .bind(auth.user_id, activeProjectWorkspaceKey)
        .first();
      if (!member && !(auth.authorized_workspaces || []).includes(activeProjectWorkspaceKey)) {
        // Superadmin bypass already handled; members of platform tenant on IAM project OK if membership row missing for Sam
        if (activeProjectWorkspaceKey !== PLATFORM_PROJECT_WORKSPACE || !auth.is_superadmin) {
          // Allow platform project for any authenticated tenant_sam user as soft default
          const sameTenant = trim(auth.tenant_id) === 'tenant_sam_primeaux';
          if (!(sameTenant && activeProjectWorkspaceKey === PLATFORM_PROJECT_WORKSPACE)) {
            errors.push('workspace_not_authorized');
          }
        }
      }
    } catch {
      /* membership table may vary */
    }
  }

  // Require UUID mapping when projecting
  let supabaseWorkspaceId = null;
  if (opts.env?.DB && activeProjectWorkspaceKey) {
    try {
      const row = await opts.env.DB.prepare(
        `SELECT supabase_workspace_id FROM agentsam_workspace WHERE id = ? LIMIT 1`,
      )
        .bind(activeProjectWorkspaceKey)
        .first();
      supabaseWorkspaceId = trim(row?.supabase_workspace_id) || null;
      if (!supabaseWorkspaceId) errors.push('workspace_uuid_mapping_missing');
    } catch {
      errors.push('workspace_uuid_lookup_failed');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    transport_workspace_key: transportWorkspaceKey,
    source_client: sourceClient,
    authenticated_actor_id: trim(auth.user_id),
    scope_type: scopeType,
    scope_id: scopeId,
    active_project_workspace_key: activeProjectWorkspaceKey,
    /** @deprecated alias — semantic project workspace stored on row.workspace_id */
    workspace_id: activeProjectWorkspaceKey,
    supabase_workspace_id: supabaseWorkspaceId,
  };
}
