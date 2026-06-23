/**
 * Workspace D1 access — collab lane for workspace members (e.g. fuelnfreetime).
 *
 * Platform env.DB (inneranimalmedia-business / cf87b717…) is superadmin-only.
 * Workspace-scoped D1 (e.g. fuel 9fd6ff92…) is reached via Cloudflare D1 HTTP API
 * with platform token for members, or BYOK credentials when configured.
 */
import { authUserIsSuperadmin, fetchAuthUserTenantId } from './auth.js';
import { IAM_D1_DATABASE_ID as PLATFORM_D1_DATABASE_ID } from './d1-graphql-analytics.js';
import { parseWorkspaceMetadata, getAgentsamWorkspace } from './agentsam-workspace.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { resolveWorkspaceCloudflareCredentials } from './workspace-cloudflare-credentials.js';
import { userCanAccessWorkspace } from './workspace-access.js';

export { PLATFORM_D1_DATABASE_ID };

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {Record<string, unknown>|null|undefined} workspaceRow
 * @returns {Array<{ binding: string, database_name: string, database_id: string }>}
 */
export function resolveWorkspaceD1Catalog(workspaceRow) {
  if (!workspaceRow) return [];

  const meta = parseWorkspaceMetadata(workspaceRow.metadata_json);
  /** @type {Array<{ binding: string, database_name: string, database_id: string }>} */
  const catalog = [];
  const seen = new Set();

  const pushEntry = (entry) => {
    const databaseId = trim(entry?.database_id);
    if (!databaseId || databaseId === PLATFORM_D1_DATABASE_ID) return;
    const databaseName =
      trim(entry?.database_name) ||
      trim(workspaceRow.workspace_slug) ||
      trim(entry?.binding) ||
      databaseId;
    const binding = trim(entry?.binding) || trim(workspaceRow.d1_binding) || 'DB';
    const key = databaseId.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    catalog.push({ binding, database_name: databaseName, database_id: databaseId });
  };

  const arr = meta.d1_databases;
  if (Array.isArray(arr)) {
    for (const item of arr) pushEntry(item);
  }

  const fallbackId = trim(workspaceRow.d1_database_id);
  if (fallbackId && fallbackId !== PLATFORM_D1_DATABASE_ID) {
    pushEntry({
      binding: workspaceRow.d1_binding,
      database_name: workspaceRow.workspace_slug,
      database_id: fallbackId,
    });
  }

  return catalog;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {string} workspaceId
 * @param {{ database_id?: string, database_name?: string }|null|undefined} [catalogEntry]
 */
async function buildWorkspaceD1Grant(env, authUser, workspaceId, catalogEntry = null) {
  const ws = trim(workspaceId);
  if (!ws || !authUser) return null;
  if (!(await userCanAccessWorkspace(env, authUser, ws))) return null;

  const row = await getAgentsamWorkspace(env, ws);
  const catalog = resolveWorkspaceD1Catalog(row);
  let databaseId = trim(catalogEntry?.database_id);
  if (!databaseId && catalogEntry?.database_name) {
    const name = trim(catalogEntry.database_name).toLowerCase();
    databaseId = trim(catalog.find((e) => e.database_name.toLowerCase() === name)?.database_id);
  }
  if (!databaseId) {
    const d1Binding = await getDefaultWorkspaceDataBinding(env, ws, 'cloudflare_d1');
    databaseId = trim(d1Binding?.external_database_id);
  }
  if (!databaseId) return null;

  const isPlatformD1 = databaseId === PLATFORM_D1_DATABASE_ID;
  const isSuper = authUserIsSuperadmin(authUser);
  if (isPlatformD1) return null;

  const d1Binding = await getDefaultWorkspaceDataBinding(env, ws, 'cloudflare_d1');
  const accountFromBinding = trim(d1Binding?.external_account_id) || trim(row?.cloudflare_account_id);

  const userId = trim(authUser?.id);
  let tenantId = trim(authUser?.tenant_id);
  if (!tenantId && userId) {
    tenantId = trim(await fetchAuthUserTenantId(env, userId).catch(() => ''));
  }

  if (userId && tenantId) {
    const creds = await resolveWorkspaceCloudflareCredentials(env, userId, tenantId, ws);
    if (creds.ok && creds.token) {
      const accountId = trim(creds.account_id) || accountFromBinding;
      if (accountId) {
        return {
          via: creds.platform_bypass ? 'platform_superadmin' : 'byo_api_key',
          token: String(creds.token),
          account_id: accountId,
          database_id: databaseId,
          workspace_id: ws,
        };
      }
    }
  }

  const token = trim(env?.CLOUDFLARE_API_TOKEN);
  const accountId = accountFromBinding || trim(env?.CLOUDFLARE_ACCOUNT_ID);
  if (!token || !accountId) return null;

  if (!isSuper) {
    return {
      via: 'workspace_membership',
      token,
      account_id: accountId,
      database_id: databaseId,
      workspace_id: ws,
    };
  }

  return {
    via: 'platform_superadmin',
    token,
    account_id: accountId,
    database_id: databaseId,
    workspace_id: ws,
  };
}

/**
 * Remote D1 grant for Database Studio / agentsam D1 tools.
 * Returns null when workspace has no D1, platform D1 for non-superadmin, or access denied.
 *
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {string} workspaceId
 * @returns {Promise<{
 *   via: 'workspace_membership' | 'byo_api_key' | 'platform_superadmin',
 *   token: string,
 *   account_id: string,
 *   database_id: string,
 *   workspace_id: string,
 * }|null>}
 */
export async function resolveWorkspaceMemberD1Grant(env, authUser, workspaceId) {
  return buildWorkspaceD1Grant(env, authUser, workspaceId);
}

/**
 * Resolve remote D1 grant by catalog database_name (e.g. fuelnfreetime).
 *
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {string} databaseName
 */
export async function resolveD1GrantByDatabaseName(env, authUser, databaseName) {
  const name = trim(databaseName).toLowerCase();
  if (!name || !authUser || !env?.DB) return null;

  try {
    const { results } = await env.DB.prepare(
      `SELECT aw.*
       FROM agentsam_workspace aw
       WHERE COALESCE(aw.status, 'active') != 'archived'
         AND (
           lower(trim(aw.workspace_slug)) = ?
           OR EXISTS (
             SELECT 1
             FROM json_each(COALESCE(json_extract(aw.metadata_json, '$.d1_databases'), '[]'))
             WHERE lower(trim(json_extract(value, '$.database_name'))) = ?
           )
         )`,
    )
      .bind(name, name)
      .all();

    for (const row of results || []) {
      const workspaceId = trim(row.id);
      if (!workspaceId) continue;
      if (!(await userCanAccessWorkspace(env, authUser, workspaceId))) continue;

      const catalog = resolveWorkspaceD1Catalog(row);
      const entry =
        catalog.find((e) => e.database_name.toLowerCase() === name) ||
        catalog.find((e) => trim(row.workspace_slug).toLowerCase() === name) ||
        catalog[0];
      if (!entry) continue;

      const grant = await buildWorkspaceD1Grant(env, authUser, workspaceId, entry);
      if (grant) return grant;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * D1 databases visible to the authenticated user (collab lane catalog).
 *
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @returns {Promise<Array<{ database_name: string, database_id: string, workspace_id: string, workspace_name?: string|null }>>}
 */
export async function listAccessibleD1Databases(env, authUser) {
  const userId = authUser?.id != null ? String(authUser.id).trim() : '';
  if (!userId || !env?.DB) return [];

  try {
    const { results } = await env.DB.prepare(
      `SELECT aw.*
       FROM workspace_members wm
       INNER JOIN agentsam_workspace aw ON aw.id = wm.workspace_id
       WHERE wm.user_id = ?
         AND COALESCE(wm.is_active, 1) = 1
         AND COALESCE(aw.status, 'active') != 'archived'
         AND (
           (aw.d1_database_id IS NOT NULL AND TRIM(aw.d1_database_id) != '')
           OR json_array_length(COALESCE(json_extract(aw.metadata_json, '$.d1_databases'), '[]')) > 0
         )`,
    )
      .bind(userId)
      .all();

    /** @type {Array<{ database_name: string, database_id: string, workspace_id: string, workspace_name?: string|null }>} */
    const out = [];
    const seen = new Set();

    for (const row of results || []) {
      const workspaceId = trim(row.id);
      if (!workspaceId) continue;
      if (!(await userCanAccessWorkspace(env, authUser, workspaceId))) continue;

      const workspaceName = row.display_name != null ? String(row.display_name) : null;
      for (const entry of resolveWorkspaceD1Catalog(row)) {
        const key = `${workspaceId}:${entry.database_id}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          database_name: entry.database_name,
          database_id: entry.database_id,
          workspace_id: workspaceId,
          workspace_name: workspaceName,
        });
      }
    }

    return out.sort((a, b) => a.database_name.localeCompare(b.database_name));
  } catch {
    return [];
  }
}

/**
 * Workspace D1 databases visible via active membership (collab lane).
 * Never includes platform business D1 (cf87b717).
 *
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @returns {Promise<Array<{ database_id: string, workspace_id: string, workspace_name?: string|null }>>}
 */
export async function listWorkspaceMemberD1Grants(env, authUser) {
  const rows = await listAccessibleD1Databases(env, authUser);
  return rows.map(({ database_id, workspace_id, workspace_name }) => ({
    database_id,
    workspace_id,
    workspace_name,
  }));
}
