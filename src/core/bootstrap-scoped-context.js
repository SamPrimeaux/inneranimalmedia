/**
 * User/workspace-scoped bootstrap attachments — no platform R2 or tenant-wide bucket leakage.
 */
import { authUserIsSuperadmin } from './auth.js';
import { fetchUserGithubLogin, fetchWorkspaceGithubRepo } from './github-repo-scope.js';
import { loadUserCloudflareR2Credentials } from './user-storage-r2-credentials.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseJsonSafe(raw, fallback = {}) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

/**
 * Bootstrap row must belong to the requesting user (never another user's row).
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string} userId
 */
export function bootstrapRowMatchesUser(row, userId) {
  const uid = trim(userId);
  if (!row || !uid) return false;
  const rowUid = trim(row.user_id);
  if (!rowUid) return false;
  return rowUid === uid;
}

/**
 * Tenant-scoped storage names only (project_storage). Never platform Worker bindings.
 * @param {any} env
 * @param {string} tenantId
 */
export async function loadTenantScopedStorageNames(env, tenantId) {
  const tid = trim(tenantId);
  if (!tid || !env?.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT storage_name, storage_id, storage_type
         FROM project_storage
        WHERE tenant_id = ? AND COALESCE(status, 'active') = 'active'
        ORDER BY storage_name`,
    )
      .bind(tid)
      .all();
    return (results || []).map((r) => ({
      name: trim(r.storage_name) || trim(r.storage_id),
      storage_id: trim(r.storage_id) || null,
      storage_type: trim(r.storage_type) || 'r2',
    }));
  } catch {
    return [];
  }
}

/**
 * Safe runtime slice merged into /api/agentsam/config and agent bootstrap cache.
 * @param {any} env
 * @param {{
 *   authUser: { id?: string, tenant_id?: string, is_superadmin?: number|boolean },
 *   workspaceId: string,
 *   tenantId?: string|null,
 *   bootstrapRow?: Record<string, unknown>|null,
 * }} opts
 */
export async function buildScopedBootstrapContext(env, opts) {
  const authUser = opts.authUser || {};
  const userId = trim(authUser.id);
  const workspaceId = trim(opts.workspaceId);
  const tenantId =
    trim(opts.tenantId) ||
    trim(authUser.tenant_id) ||
    '';
  const isSuper = authUserIsSuperadmin(authUser);

  const [githubLogin, workspaceRepo, tenantBuckets, r2Creds] = await Promise.all([
    userId ? fetchUserGithubLogin(env, userId) : Promise.resolve(null),
    workspaceId ? fetchWorkspaceGithubRepo(env, tenantId, workspaceId) : Promise.resolve(null),
    tenantId ? loadTenantScopedStorageNames(env, tenantId) : Promise.resolve([]),
    userId ? loadUserCloudflareR2Credentials(env, userId) : Promise.resolve(null),
  ]);

  const capabilities = parseJsonSafe(opts.bootstrapRow?.capabilities_json, {});

  return {
    isolation: {
      mode: 'user_workspace',
      user_id: userId || null,
      tenant_id: tenantId || null,
      workspace_id: workspaceId || null,
    },
    github: {
      login: githubLogin,
      workspace_repo: workspaceRepo,
      owner_namespace: githubLogin || null,
    },
    storage: {
      tenant_buckets: tenantBuckets,
      r2_byok_connected: !!(r2Creds?.accessKeyId && r2Creds?.secretAccessKey),
      platform_r2_visible: isSuper,
      media_upload_bucket: isSuper ? 'inneranimalmedia' : null,
    },
    capabilities,
  };
}

/**
 * API payload: bootstrap row (user-matched only) + scoped_context.
 * @param {any} env
 * @param {{
 *   authUser: { id?: string, tenant_id?: string, is_superadmin?: number|boolean },
 *   workspaceId: string,
 *   tenantId?: string|null,
 *   bootstrapRow?: Record<string, unknown>|null,
 * }} opts
 */
export async function buildBootstrapApiPayload(env, opts) {
  const userId = trim(opts.authUser?.id);
  const row = opts.bootstrapRow;
  const matched = bootstrapRowMatchesUser(row, userId) ? row : null;

  const scoped_context = await buildScopedBootstrapContext(env, {
    ...opts,
    bootstrapRow: matched,
  });

  if (!matched) {
    return {
      workspace_id: opts.workspaceId,
      user_id: userId,
      scoped_context,
      bootstrap_missing: true,
    };
  }

  return {
    ...matched,
    scoped_context,
    bootstrap_missing: false,
  };
}
