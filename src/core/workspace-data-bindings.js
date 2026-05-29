/**
 * D1 helpers for agentsam_workspace_data_bindings (customer BYO resource selection).
 */

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} provider
 */
export async function getDefaultWorkspaceDataBinding(env, workspaceId, provider) {
  if (!env?.DB || !workspaceId || !provider) return null;
  return env.DB.prepare(
    `SELECT * FROM agentsam_workspace_data_bindings
     WHERE workspace_id = ? AND provider = ? AND selected_as_default = 1
     ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(String(workspaceId), String(provider))
    .first();
}

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} [provider]
 */
export async function listWorkspaceDataBindings(env, workspaceId, provider = null) {
  if (!env?.DB || !workspaceId) return [];
  if (provider) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM agentsam_workspace_data_bindings
       WHERE workspace_id = ? AND provider = ?
       ORDER BY selected_as_default DESC, updated_at DESC`,
    )
      .bind(String(workspaceId), String(provider))
      .all();
    return results || [];
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM agentsam_workspace_data_bindings
     WHERE workspace_id = ?
     ORDER BY provider, selected_as_default DESC, updated_at DESC`,
  )
    .bind(String(workspaceId))
    .all();
  return results || [];
}

/**
 * @param {any} env
 * @param {{
 *   id: string,
 *   tenant_id: string,
 *   user_id: string,
 *   workspace_id: string,
 *   provider: string,
 *   connection_id?: string|null,
 *   external_account_id?: string|null,
 *   external_project_id?: string|null,
 *   external_project_ref?: string|null,
 *   external_database_id?: string|null,
 *   display_name?: string|null,
 *   selected_as_default?: boolean|number,
 *   capabilities_json?: string|null,
 *   scopes_json?: string|null,
 *   health_status?: string|null,
 *   metadata_json?: string|null,
 * }} row
 */
export async function upsertWorkspaceDataBinding(env, row) {
  if (!env?.DB) throw new Error('DB unavailable');
  const ws = String(row.workspace_id);
  const provider = String(row.provider);
  const isDefault = row.selected_as_default ? 1 : 0;

  if (isDefault) {
    await env.DB.prepare(
      `UPDATE agentsam_workspace_data_bindings
       SET selected_as_default = 0, updated_at = unixepoch()
       WHERE workspace_id = ? AND provider = ?`,
    )
      .bind(ws, provider)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO agentsam_workspace_data_bindings (
       id, tenant_id, user_id, workspace_id, provider,
       connection_id, external_account_id, external_project_id, external_project_ref,
       external_database_id, display_name, selected_as_default,
       capabilities_json, scopes_json, health_status, last_verified_at, metadata_json,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
     ON CONFLICT(id) DO UPDATE SET
       connection_id = excluded.connection_id,
       external_account_id = excluded.external_account_id,
       external_project_id = excluded.external_project_id,
       external_project_ref = excluded.external_project_ref,
       external_database_id = excluded.external_database_id,
       display_name = excluded.display_name,
       selected_as_default = excluded.selected_as_default,
       capabilities_json = excluded.capabilities_json,
       scopes_json = excluded.scopes_json,
       health_status = excluded.health_status,
       last_verified_at = excluded.last_verified_at,
       metadata_json = excluded.metadata_json,
       updated_at = unixepoch()`,
  )
    .bind(
      String(row.id),
      String(row.tenant_id),
      String(row.user_id),
      ws,
      provider,
      row.connection_id != null ? String(row.connection_id) : null,
      row.external_account_id != null ? String(row.external_account_id) : null,
      row.external_project_id != null ? String(row.external_project_id) : null,
      row.external_project_ref != null ? String(row.external_project_ref) : null,
      row.external_database_id != null ? String(row.external_database_id) : null,
      row.display_name != null ? String(row.display_name) : null,
      isDefault,
      row.capabilities_json != null ? String(row.capabilities_json) : null,
      row.scopes_json != null ? String(row.scopes_json) : null,
      row.health_status != null ? String(row.health_status) : 'unknown',
      row.last_verified_at != null ? Number(row.last_verified_at) : null,
      row.metadata_json != null ? String(row.metadata_json) : null,
    )
    .run();
}
