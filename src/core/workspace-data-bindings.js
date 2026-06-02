/**
 * Workspace BYO resource selection — SSOT is agentsam_workspace (not agentsam_workspace_data_bindings).
 */

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseMeta(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
async function loadAgentsamWorkspace(env, workspaceId) {
  if (!env?.DB || !workspaceId) return null;
  return env.DB.prepare(
    `SELECT id, tenant_id, d1_database_id, d1_binding, metadata_json, r2_bucket, worker_name
       FROM agentsam_workspace
      WHERE id = ?
      LIMIT 1`,
  )
    .bind(String(workspaceId))
    .first()
    .catch(() => null);
}

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} provider
 */
export async function getDefaultWorkspaceDataBinding(env, workspaceId, provider) {
  const ws = trim(workspaceId);
  const prov = trim(provider).toLowerCase();
  if (!ws || !prov) return null;

  const row = await loadAgentsamWorkspace(env, ws);
  if (!row) return null;

  const meta = parseMeta(row.metadata_json);

  if (prov === 'cloudflare_d1' || prov === 'cloudflare') {
    const d1Id = trim(row.d1_database_id);
    if (!d1Id) return null;
    return {
      id: row.id,
      workspace_id: ws,
      provider: prov,
      external_database_id: d1Id,
      external_account_id: trim(meta.cloudflare_account_id) || trim(meta.account_id) || null,
      selected_as_default: 1,
      metadata_json: row.metadata_json,
    };
  }

  if (prov === 'supabase') {
    const ref =
      trim(meta.supabase_project_ref) ||
      trim(meta.project_ref) ||
      trim(meta.external_project_ref) ||
      null;
    if (!ref) return null;
    return {
      id: row.id,
      workspace_id: ws,
      provider: 'supabase',
      external_project_ref: ref,
      external_project_id: trim(meta.supabase_project_id) || trim(meta.project_id) || null,
      selected_as_default: 1,
      metadata_json: row.metadata_json,
    };
  }

  return null;
}

/**
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} [provider]
 */
export async function listWorkspaceDataBindings(env, workspaceId, provider = null) {
  const binding = await getDefaultWorkspaceDataBinding(
    env,
    workspaceId,
    provider || 'cloudflare_d1',
  );
  if (binding) return [binding];
  if (provider) return [];
  const supa = await getDefaultWorkspaceDataBinding(env, workspaceId, 'supabase');
  const cf = await getDefaultWorkspaceDataBinding(env, workspaceId, 'cloudflare_d1');
  return [cf, supa].filter(Boolean);
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
  const provider = String(row.provider).toLowerCase();
  const existing = (await loadAgentsamWorkspace(env, ws)) || { metadata_json: '{}' };
  const meta = parseMeta(existing.metadata_json);

  if (provider === 'cloudflare_d1' && row.external_database_id != null) {
    await env.DB.prepare(
      `UPDATE agentsam_workspace
          SET d1_database_id = ?, updated_at = unixepoch()
        WHERE id = ?`,
    )
      .bind(String(row.external_database_id), ws)
      .run();
    return;
  }

  if (provider === 'supabase') {
    if (row.external_project_ref != null) {
      meta.supabase_project_ref = String(row.external_project_ref);
      meta.project_ref = String(row.external_project_ref);
    }
    if (row.external_project_id != null) {
      meta.supabase_project_id = String(row.external_project_id);
    }
    if (row.external_account_id != null) {
      meta.cloudflare_account_id = String(row.external_account_id);
    }
    await env.DB.prepare(
      `UPDATE agentsam_workspace
          SET metadata_json = ?, updated_at = unixepoch()
        WHERE id = ?`,
    )
      .bind(JSON.stringify(meta), ws)
      .run();
    return;
  }

  if (row.external_account_id != null) {
    meta.cloudflare_account_id = String(row.external_account_id);
    await env.DB.prepare(
      `UPDATE agentsam_workspace SET metadata_json = ?, updated_at = unixepoch() WHERE id = ?`,
    )
      .bind(JSON.stringify(meta), ws)
      .run();
  }
}
