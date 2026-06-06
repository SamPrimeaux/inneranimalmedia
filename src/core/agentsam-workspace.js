/**
 * agentsam_workspace — SSOT for workspace identity and runtime bindings.
 * UI-only columns (settings_json, state_json, theme_id, user_id) remain on `workspaces` compat.
 */

function trim(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function getAgentsamWorkspace(env, workspaceId) {
  const wid = trim(workspaceId);
  if (!env?.DB || !wid) return null;
  return env.DB.prepare(
    `SELECT id, workspace_slug, tenant_id, name, display_name, description,
            root_path, r2_bucket, r2_prefix, status, metadata_json,
            github_repo, default_model_id, primary_subagent_id,
            d1_database_id, d1_binding, worker_name, workspace_ref_id,
            created_at, updated_at
       FROM agentsam_workspace
      WHERE id = ?
      LIMIT 1`,
  )
    .bind(wid)
    .first()
    .catch(() => null);
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function agentsamWorkspaceExists(env, workspaceId) {
  const row = await getAgentsamWorkspace(env, workspaceId);
  return !!row;
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function getWorkspaceTenantId(env, workspaceId) {
  const row = await getAgentsamWorkspace(env, workspaceId);
  const tid = row?.tenant_id;
  return tid != null && trim(tid) ? trim(tid) : null;
}

/**
 * Owner user_id — compat read from workspaces until migrated to workspace_members-only.
 * @param {any} env
 * @param {string} workspaceId
 */
export async function getWorkspaceOwnerUserId(env, workspaceId) {
  const wid = trim(workspaceId);
  if (!env?.DB || !wid) return null;
  const row = await env.DB.prepare(`SELECT user_id FROM workspaces WHERE id = ? LIMIT 1`)
    .bind(wid)
    .first()
    .catch(() => null);
  const uid = row?.user_id;
  return uid != null && trim(uid) ? trim(uid) : null;
}

/**
 * Tenant id — SSOT agentsam_workspace, compat fallback workspaces.
 * @param {any} env
 * @param {string} workspaceId
 */
export async function getWorkspaceTenantIdWithFallback(env, workspaceId) {
  const fromAw = await getWorkspaceTenantId(env, workspaceId);
  if (fromAw) return fromAw;
  const wid = trim(workspaceId);
  if (!env?.DB || !wid) return null;
  const row = await env.DB.prepare(
    `SELECT COALESCE(tenant_id, owner_tenant_id, default_tenant_id) AS tid
       FROM workspaces WHERE id = ? LIMIT 1`,
  )
    .bind(wid)
    .first()
    .catch(() => null);
  const tid = row?.tid;
  return tid != null && trim(tid) ? trim(tid) : null;
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function workspaceRowExists(env, workspaceId) {
  if (await agentsamWorkspaceExists(env, workspaceId)) return true;
  const wid = trim(workspaceId);
  if (!env?.DB || !wid) return false;
  const row = await env.DB.prepare(`SELECT 1 AS ok FROM workspaces WHERE id = ? LIMIT 1`)
    .bind(wid)
    .first()
    .catch(() => null);
  return !!row;
}

/**
 * @param {any} env
 * @param {string} workspaceId
 */
export async function getWorkspaceGithubRepo(env, workspaceId) {
  const row = await getAgentsamWorkspace(env, workspaceId);
  const gh = row?.github_repo;
  return gh != null && trim(gh) ? trim(gh) : null;
}

/**
 * Sync operational patch fields to agentsam_workspace (best-effort).
 * @param {any} env
 * @param {string} workspaceId
 * @param {Record<string, unknown>} col
 */
export async function patchAgentsamWorkspaceFromApiCol(env, workspaceId, col) {
  const wid = trim(workspaceId);
  if (!env?.DB || !wid || !col || typeof col !== 'object') return;
  const sets = [];
  const binds = [];
  const map = {
    display_name: 'display_name',
    name: 'name',
    slug: 'workspace_slug',
    handle: 'workspace_slug',
    r2_prefix: 'r2_prefix',
    github_repo: 'github_repo',
    description: 'description',
    default_model_id: 'default_model_id',
    status: 'status',
  };
  for (const [src, dst] of Object.entries(map)) {
    if (col[src] !== undefined) {
      sets.push(`${dst} = ?`);
      binds.push(col[src]);
    }
  }
  if (!sets.length) return;
  sets.push('updated_at = unixepoch()');
  binds.push(wid);
  await env.DB.prepare(`UPDATE agentsam_workspace SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run()
    .catch(() => {});
}

/**
 * Insert SSOT row when provisioning a new workspace (idempotent).
 * @param {any} env
 * @param {{ id: string, workspaceSlug: string, tenantId?: string|null, name: string, displayName?: string|null, githubRepo?: string|null, r2Prefix?: string|null, description?: string|null }} opts
 */
export async function insertAgentsamWorkspaceRow(env, opts) {
  const id = trim(opts?.id);
  if (!env?.DB || !id) return;
  const slug = trim(opts.workspaceSlug) || id.replace(/^ws_/, '');
  const name = trim(opts.name) || id;
  const displayName = trim(opts.displayName) || name;
  const tenantId = trim(opts.tenantId) || null;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO agentsam_workspace
       (id, workspace_slug, tenant_id, name, display_name, status,
        r2_prefix, github_repo, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, unixepoch(), unixepoch())`,
  )
    .bind(
      id,
      slug,
      tenantId,
      name,
      displayName,
      opts.r2Prefix != null && trim(opts.r2Prefix) ? trim(opts.r2Prefix) : null,
      opts.githubRepo != null && trim(opts.githubRepo) ? trim(opts.githubRepo) : null,
      opts.description != null && trim(opts.description) ? trim(opts.description) : null,
    )
    .run()
    .catch(() => {});
}
