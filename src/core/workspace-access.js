/**
 * Workspace visibility and access — membership-scoped for all non-superadmin users.
 * Never expose another user's ws_* via tenant_id alone.
 */
import { fetchAuthUserTenantId, platformTenantIdFromEnv } from './auth.js';

export function isAuthSuperadmin(authUser) {
  return Number(authUser?.is_superadmin) === 1;
}

/**
 * auth_users.id (au_*) vs users.id (usr_*) — workspace_members.user_id may match either.
 * @param {any} env
 * @param {any} authUser
 * @returns {Promise<string[]>}
 */
export async function workspaceMemberUserCandidates(env, authUser) {
  const uid = String(authUser?.id || '').trim();
  const email = authUser?.email != null ? String(authUser.email).trim() : '';
  /** @type {Set<string>} */
  const ids = new Set();
  if (uid) ids.add(uid);
  if (!env?.DB) return [...ids];
  try {
    const row = await env.DB.prepare(
      `SELECT u.id AS app_user_id
       FROM auth_users au
       LEFT JOIN users u ON u.auth_id = au.id OR LOWER(COALESCE(u.email,'')) = LOWER(au.email)
       WHERE au.id = ? OR LOWER(COALESCE(au.email,'')) = LOWER(?)
       LIMIT 1`,
    )
      .bind(uid, email || uid)
      .first();
    if (row?.app_user_id != null && String(row.app_user_id).trim()) {
      ids.add(String(row.app_user_id).trim());
    }
  } catch {
    /* ignore */
  }
  return [...ids];
}

/**
 * @param {string[]} candidates
 */
function inClausePlaceholders(candidates) {
  const n = candidates.length;
  return n > 0 ? candidates.map(() => '?').join(', ') : "''";
}

/**
 * Non-superadmin: workspace_members and workspace owner user_id only.
 * Superadmin: platform tenant rows + membership + null-tenant unowned (operator).
 * @param {any} env
 * @param {any} authUser
 * @returns {Promise<{ isSuper: boolean, candidates: string[], tenantId: string|null, seeNullTenantUnowned: number }>}
 */
export async function resolveWorkspaceAccessContext(env, authUser) {
  const isSuper = isAuthSuperadmin(authUser);
  const candidates = await workspaceMemberUserCandidates(env, authUser);
  let tenantId =
    authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : null;
  if (!tenantId && authUser?.id) {
    tenantId = await fetchAuthUserTenantId(env, authUser.id).catch(() => null);
  }
  if (!tenantId && authUser?.email) {
    tenantId = await fetchAuthUserTenantId(env, authUser.email).catch(() => null);
  }
  const platformTid = platformTenantIdFromEnv(env);
  const seeNullTenantUnowned = isSuper || (platformTid && tenantId === platformTid) ? 1 : 0;
  return { isSuper, candidates, tenantId, seeNullTenantUnowned };
}

/**
 * @param {any} env
 * @param {any} authUser
 * @param {string} workspaceId
 */
export async function userCanAccessWorkspace(env, authUser, workspaceId) {
  if (!env?.DB || !authUser || !workspaceId) return false;
  const wid = String(workspaceId).trim();
  if (!wid) return false;
  if (isAuthSuperadmin(authUser)) return true;

  const candidates = await workspaceMemberUserCandidates(env, authUser);
  if (!candidates.length) return false;

  try {
    const ws = await env.DB.prepare(`SELECT user_id FROM workspaces WHERE id = ? LIMIT 1`)
      .bind(wid)
      .first();
    if (!ws) return false;
    if (candidates.some((c) => String(ws.user_id || '') === c)) return true;
    const ph = inClausePlaceholders(candidates);
    const m = await env.DB.prepare(
      `SELECT 1 AS ok FROM workspace_members
       WHERE workspace_id = ? AND user_id IN (${ph}) AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
      .bind(wid, ...candidates)
      .first();
    return !!m;
  } catch {
    return false;
  }
}

/**
 * List workspaces visible in switchers / settings (member-scoped unless superadmin).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {any} env
 * @param {any} authUser
 * @param {{ orderBy?: string, limit?: number }} [opts]
 */
export async function listAccessibleWorkspaces(db, env, authUser, opts = {}) {
  const { isSuper, candidates, tenantId, seeNullTenantUnowned } = await resolveWorkspaceAccessContext(
    env,
    authUser,
  );
  const orderBy = opts.orderBy || 'w.updated_at DESC';
  const limit = opts.limit != null && Number(opts.limit) > 0 ? Math.min(Number(opts.limit), 500) : null;
  const limitSql = limit ? ` LIMIT ${limit}` : '';

  if (!candidates.length && !isSuper) return [];

  if (isSuper) {
    const userId = String(authUser.id || '').trim();
    const sql = `
      SELECT DISTINCT w.id, w.display_name, w.slug, w.workspace_type,
        w.status, w.r2_prefix, w.github_repo, w.settings_json,
        w.description, w.tenant_id, w.user_id, w.created_at, w.updated_at,
        w.name, w.handle, w.category, w.brand,
        COALESCE(wm.role, 'owner') AS member_role
      FROM workspaces w
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = w.id AND wm.user_id = ?
      WHERE (
          w.tenant_id = ?
          OR wm.user_id = ?
          OR (w.tenant_id IS NULL AND ? = 1)
        )
        AND (w.is_archived = 0 OR w.is_archived IS NULL)
      ORDER BY ${orderBy}${limitSql}`;
    const { results } = await db
      .prepare(sql)
      .bind(userId, tenantId ?? '', userId, seeNullTenantUnowned)
      .all();
    return results || [];
  }

  const ph = inClausePlaceholders(candidates);
  const sql = `
    SELECT DISTINCT w.id, w.display_name, w.slug, w.workspace_type,
      w.status, w.r2_prefix, w.github_repo, w.settings_json,
      w.description, w.tenant_id, w.user_id, w.created_at, w.updated_at,
      w.name, w.handle, w.category, w.brand,
      COALESCE(wm.role, 'owner') AS member_role
    FROM workspaces w
    LEFT JOIN workspace_members wm
      ON wm.workspace_id = w.id AND wm.user_id IN (${ph})
    WHERE (
        EXISTS (
          SELECT 1 FROM workspace_members wm2
          WHERE wm2.workspace_id = w.id
            AND wm2.user_id IN (${ph})
            AND COALESCE(wm2.is_active, 1) = 1
        )
        OR w.user_id IN (${ph})
      )
      AND (w.is_archived = 0 OR w.is_archived IS NULL)
    ORDER BY ${orderBy}${limitSql}`;
  const binds = [...candidates, ...candidates, ...candidates];
  const { results } = await db.prepare(sql).bind(...binds).all();
  return results || [];
}

/**
 * Settings API workspace rows (id + display fields).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {any} env
 * @param {any} authUser
 */
export async function fetchWorkspaceRowsForSettingsApi(db, env, authUser) {
  const rows = await listAccessibleWorkspaces(db, env, authUser, { orderBy: 'COALESCE(w.display_name, w.name, w.id) ASC' });
  return rows.map((w) => ({
    id: w.id,
    name:
      (w.display_name != null && String(w.display_name).trim()) ||
      (w.name != null && String(w.name).trim()) ||
      String(w.id),
    display_name: w.display_name ?? w.name ?? w.id,
    slug: w.slug ?? w.handle ?? null,
    github_repo: w.github_repo ?? null,
    status: w.status ?? null,
    category: w.category ?? w.workspace_type ?? null,
    brand: w.brand ?? null,
  }));
}
