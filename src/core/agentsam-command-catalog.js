/**
 * Shared D1 reads for agentsam_commands (slash picker, settings, MCP).
 */

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ tenantId?: string | null, workspaceId?: string | null, limit?: number }} opts
 */
export async function listAgentsamSlashCommands(db, opts = {}) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 200), 500);
  const binds = [];
  const scope = [`workspace_id = 'platform'`, `COALESCE(is_global, 1) = 1`];
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : null;
  const workspaceId =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : null;
  if (tenantId) {
    scope.push(`tenant_id = ?`);
    binds.push(tenantId);
  }
  if (workspaceId) {
    scope.push(`workspace_id = ?`);
    binds.push(workspaceId);
  }

  const sql = `
    SELECT
      id,
      slug,
      display_name,
      display_name AS name,
      description,
      COALESCE(NULLIF(TRIM(pattern), ''), mapped_command) AS usage_hint,
      router_type AS handler_type,
      mapped_command,
      category,
      subcategory,
      risk_level,
      requires_confirmation,
      modes_json,
      tool_key AS handler_ref,
      workflow_key,
      sort_order,
      workspace_id,
      tenant_id,
      is_active,
      show_in_slash,
      show_in_palette,
      execution_mode
    FROM agentsam_commands
    WHERE COALESCE(is_active, 1) = 1
      AND COALESCE(show_in_slash, 1) = 1
      AND (${scope.join(' OR ')})
    ORDER BY
      CASE workspace_id WHEN 'platform' THEN 0 ELSE 1 END,
      COALESCE(sort_order, 50) ASC,
      display_name ASC
    LIMIT ${limit}
  `;

  const { results } = await db.prepare(sql).bind(...binds).all();
  return results || [];
}

/**
 * Settings panel: full rows (active + inactive) for toggle UI.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ tenantId?: string | null, workspaceId?: string | null, limit?: number }} opts
 */
export async function listAgentsamCommandsForSettings(db, opts = {}) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 500), 800);
  const binds = [];
  const scope = [`workspace_id = 'platform'`, `COALESCE(is_global, 1) = 1`];
  const tenantId =
    opts.tenantId != null && String(opts.tenantId).trim() !== ''
      ? String(opts.tenantId).trim()
      : null;
  const workspaceId =
    opts.workspaceId != null && String(opts.workspaceId).trim() !== ''
      ? String(opts.workspaceId).trim()
      : null;
  if (tenantId) {
    scope.push(`tenant_id = ?`);
    binds.push(tenantId);
  }
  if (workspaceId) {
    scope.push(`workspace_id = ?`);
    binds.push(workspaceId);
  }

  const sql = `
    SELECT
      *,
      COALESCE(NULLIF(TRIM(pattern), ''), mapped_command) AS usage_hint,
      router_type AS handler_type,
      tool_key AS handler_ref
    FROM agentsam_commands
    WHERE (${scope.join(' OR ')})
    ORDER BY
      CASE workspace_id WHEN 'platform' THEN 0 ELSE 1 END,
      COALESCE(sort_order, 50) ASC,
      display_name ASC
    LIMIT ${limit}
  `;

  const { results } = await db.prepare(sql).bind(...binds).all();
  return results || [];
}
