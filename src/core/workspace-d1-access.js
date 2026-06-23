/**
 * Workspace D1 access — collab lane for workspace members (e.g. fuelnfreetime).
 *
 * Platform env.DB (inneranimalmedia-business / cf87b717…) is superadmin-only.
 * Workspace-scoped D1 (e.g. fuel 9fd6ff92…) is reached via Cloudflare D1 HTTP API
 * with platform token for members, or BYOK credentials when configured.
 */
import { authUserIsSuperadmin, fetchAuthUserTenantId } from './auth.js';
import { IAM_D1_DATABASE_ID as PLATFORM_D1_DATABASE_ID } from './d1-graphql-analytics.js';
import { getDefaultWorkspaceDataBinding } from './workspace-data-bindings.js';
import { resolveWorkspaceCloudflareCredentials } from './workspace-cloudflare-credentials.js';
import { userCanAccessWorkspace } from './workspace-access.js';

export { PLATFORM_D1_DATABASE_ID };

function trim(v) {
  return v == null ? '' : String(v).trim();
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
  const ws = trim(workspaceId);
  if (!ws || !authUser) return null;
  if (!(await userCanAccessWorkspace(env, authUser, ws))) return null;

  const d1Binding = await getDefaultWorkspaceDataBinding(env, ws, 'cloudflare_d1');
  const databaseId = trim(d1Binding?.external_database_id);
  if (!databaseId) return null;

  const isPlatformD1 = databaseId === PLATFORM_D1_DATABASE_ID;
  const isSuper = authUserIsSuperadmin(authUser);

  if (isPlatformD1 && !isSuper) return null;
  if (isPlatformD1 && isSuper) return null;

  const userId = trim(authUser?.id);
  let tenantId = trim(authUser?.tenant_id);
  if (!tenantId && userId) {
    tenantId = trim(await fetchAuthUserTenantId(env, userId).catch(() => ''));
  }

  const accountFromBinding = trim(d1Binding?.external_account_id);

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
 * Workspace D1 databases visible via active membership (collab lane).
 * Never includes platform business D1 (cf87b717).
 *
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @returns {Promise<Array<{ database_id: string, workspace_id: string, workspace_name?: string|null }>>}
 */
export async function listWorkspaceMemberD1Grants(env, authUser) {
  const userId = authUser?.id != null ? String(authUser.id).trim() : '';
  if (!userId || !env?.DB) return [];

  try {
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT
         aw.id AS workspace_id,
         aw.display_name AS workspace_name,
         aw.d1_database_id
       FROM workspace_members wm
       INNER JOIN agentsam_workspace aw ON aw.id = wm.workspace_id
       WHERE wm.user_id = ?
         AND COALESCE(wm.is_active, 1) = 1
         AND COALESCE(aw.status, 'active') != 'archived'
         AND aw.d1_database_id IS NOT NULL
         AND TRIM(aw.d1_database_id) != ''`,
    )
      .bind(userId)
      .all();

    /** @type {Array<{ database_id: string, workspace_id: string, workspace_name?: string|null }>} */
    const grants = [];
    const seen = new Set();

    for (const row of results || []) {
      const workspaceId = trim(row.workspace_id);
      const databaseId = trim(row.d1_database_id);
      if (!workspaceId || !databaseId) continue;
      if (databaseId === PLATFORM_D1_DATABASE_ID) continue;
      if (!(await userCanAccessWorkspace(env, authUser, workspaceId))) continue;

      const key = `${workspaceId}:${databaseId}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      grants.push({
        database_id: databaseId,
        workspace_id: workspaceId,
        workspace_name: row.workspace_name != null ? String(row.workspace_name) : null,
      });
    }

    return grants.sort((a, b) => a.workspace_id.localeCompare(b.workspace_id));
  } catch {
    return [];
  }
}
