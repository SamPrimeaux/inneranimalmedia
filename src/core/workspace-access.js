/**
 * Workspace visibility and access — membership-scoped for all non-superadmin users.
 * Never expose another user's ws_* via tenant_id alone.
 *
 * Hard blocklist: agentsam_workspace_blocklist (migration 546).
 * Any workspace in that table is invisible to everyone except its owner_user_id,
 * regardless of tenant, membership, or session resolution.
 */
import { fetchAuthUserTenantId, platformTenantIdFromEnv } from './auth.js';
import { getWorkspaceOwnerUserId, getWorkspaceTenantIdWithFallback, workspaceRowExists } from './agentsam-workspace.js';
import { filterWorkspacesForOperatorPolicy, userIsPlatformOperator } from './platform-operator-policy.js';

export function isAuthSuperadmin(authUser) {
  return Number(authUser?.is_superadmin) === 1;
}

/**
 * Check agentsam_workspace_blocklist. Returns true if the workspace is blocked
 * for this user (i.e. exists in blocklist AND user is not the owner).
 * Non-fatal — defaults to NOT blocked on error (fail open to membership checks).
 * @param {any} env
 * @param {string} workspaceId
 * @param {string} userId  auth_users.id
 */
async function isWorkspaceBlocklisted(env, workspaceId, userId) {
  if (!env?.DB || !workspaceId || !userId) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT owner_user_id FROM agentsam_workspace_blocklist WHERE workspace_id = ? LIMIT 1`,
    )
      .bind(String(workspaceId).trim())
      .first();
    if (!row) return false;                              // not in blocklist — allowed
    return String(row.owner_user_id).trim() !== String(userId).trim(); // blocked if not owner
  } catch {
    return false;
  }
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

/** Non-superadmin: workspace tenant must match the user's tenant (blocks cross-tenant membership rows). */
function workspaceTenantMatchesUser(wsTenantId, userTenantId) {
  const wt = wsTenantId != null ? String(wsTenantId).trim() : '';
  const ut = userTenantId != null ? String(userTenantId).trim() : '';
  if (!ut) return false;
  if (!wt) return true;
  return wt === ut;
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

  const uid = String(authUser?.id || '').trim();

  // Hard blocklist gate — superadmin bypasses ONLY if they are the declared owner
  if (!isAuthSuperadmin(authUser) || uid) {
    const blocked = await isWorkspaceBlocklisted(env, wid, uid);
    if (blocked) return false;
  }

  if (isAuthSuperadmin(authUser)) return true;

  const { candidates, tenantId: userTenantId } = await resolveWorkspaceAccessContext(env, authUser);
  if (!candidates.length) return false;

  try {
    if (!(await workspaceRowExists(env, wid))) return false;

    const ph = inClausePlaceholders(candidates);
    const memberRow = await env.DB.prepare(
      `SELECT 1 AS ok FROM workspace_members
       WHERE workspace_id = ? AND user_id IN (${ph}) AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
      .bind(wid, ...candidates)
      .first();
    if (memberRow) return true;

    const wsTenantId = await getWorkspaceTenantIdWithFallback(env, wid);
    if (!workspaceTenantMatchesUser(wsTenantId, userTenantId)) return false;
    const ownerUserId = await getWorkspaceOwnerUserId(env, wid);
    if (ownerUserId && candidates.some((c) => ownerUserId === c)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * List workspaces visible in switchers / settings (member-scoped unless superadmin).
 * Blocklisted workspaces are excluded from non-owner results via LEFT JOIN filter.
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
  const orderBy = opts.orderBy || 'aw.updated_at DESC';
  const limit = opts.limit != null && Number(opts.limit) > 0 ? Math.min(Number(opts.limit), 500) : null;
  const limitSql = limit ? ` LIMIT ${limit}` : '';

  if (!candidates.length && !isSuper) return [];

  const userId = String(authUser?.id || '').trim();

  if (isSuper) {
    // Superadmin sees platform tenant workspaces — but blocklist still applies
    // for non-owner superadmin sessions (prevents cross-account admin bleed).
    const sql = `
      SELECT DISTINCT aw.id, aw.display_name, aw.workspace_slug AS slug,
        COALESCE(w.workspace_type, w.category) AS workspace_type,
        aw.status, aw.r2_prefix,
        COALESCE(NULLIF(TRIM(w.github_repo), ''), aw.github_repo) AS github_repo,
        w.settings_json,
        aw.description, aw.tenant_id, w.user_id, aw.created_at, aw.updated_at,
        aw.name, aw.workspace_slug AS handle, w.category, w.brand,
        COALESCE(wm.role, 'owner') AS member_role
      FROM agentsam_workspace aw
      LEFT JOIN workspaces w ON w.id = aw.id
      LEFT JOIN workspace_members wm
        ON wm.workspace_id = aw.id AND wm.user_id = ?
      LEFT JOIN agentsam_workspace_blocklist bl
        ON bl.workspace_id = aw.id
      WHERE (
          aw.tenant_id = ?
          OR wm.user_id = ?
          OR (aw.tenant_id IS NULL AND ? = 1)
        )
        AND aw.status != 'archived'
        AND (bl.workspace_id IS NULL OR bl.owner_user_id = ?)
      ORDER BY ${orderBy}${limitSql}`;
    const { results } = await db
      .prepare(sql)
      .bind(userId, tenantId ?? '', userId, seeNullTenantUnowned, userId)
      .all();
    return results || [];
  }

  // Non-superadmin: membership + owner scoped, blocklist enforced via JOIN
  const ph = inClausePlaceholders(candidates);
  const tid = tenantId != null ? String(tenantId).trim() : '';
  const tenantClause = tid
    ? ` AND (
        aw.tenant_id IS NULL
        OR aw.tenant_id = ?
        OR EXISTS (
          SELECT 1 FROM workspace_members wm_collab
          WHERE wm_collab.workspace_id = aw.id
            AND wm_collab.user_id IN (${ph})
            AND COALESCE(wm_collab.is_active, 1) = 1
        )
      )`
    : ` AND (
        aw.tenant_id IS NULL
        OR EXISTS (
          SELECT 1 FROM workspace_members wm_collab
          WHERE wm_collab.workspace_id = aw.id
            AND wm_collab.user_id IN (${ph})
            AND COALESCE(wm_collab.is_active, 1) = 1
        )
      )`;
  const sql = `
    SELECT DISTINCT aw.id, aw.display_name, aw.workspace_slug AS slug,
      COALESCE(w.workspace_type, w.category) AS workspace_type,
      aw.status, aw.r2_prefix,
      COALESCE(NULLIF(TRIM(w.github_repo), ''), aw.github_repo) AS github_repo,
      w.settings_json,
      aw.description, aw.tenant_id, w.user_id, aw.created_at, aw.updated_at,
      aw.name, aw.workspace_slug AS handle, w.category, w.brand,
      COALESCE(wm.role, 'owner') AS member_role
    FROM agentsam_workspace aw
    LEFT JOIN workspaces w ON w.id = aw.id
    LEFT JOIN workspace_members wm
      ON wm.workspace_id = aw.id AND wm.user_id IN (${ph})
    LEFT JOIN agentsam_workspace_blocklist bl
      ON bl.workspace_id = aw.id
    WHERE (
        EXISTS (
          SELECT 1 FROM workspace_members wm2
          WHERE wm2.workspace_id = aw.id
            AND wm2.user_id IN (${ph})
            AND COALESCE(wm2.is_active, 1) = 1
        )
        OR w.user_id IN (${ph})
      )
      ${tenantClause}
      AND aw.status != 'archived'
      AND (bl.workspace_id IS NULL OR bl.owner_user_id IN (${ph}))
    ORDER BY ${orderBy}${limitSql}`;
  const binds = [...candidates, ...candidates, ...candidates, ...candidates];
  if (tid) binds.push(tid);
  binds.push(...candidates); // for blocklist owner check
  const { results } = await db.prepare(sql).bind(...binds).all();
  const isOp = await userIsPlatformOperator(env, authUser, authUser?.active_workspace_id);
  return filterWorkspacesForOperatorPolicy(results || [], isOp);
}

/**
 * Settings API workspace rows (id + display fields).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {any} env
 * @param {any} authUser
 */
export async function fetchWorkspaceRowsForSettingsApi(db, env, authUser) {
  const rows = await listAccessibleWorkspaces(db, env, authUser, { orderBy: 'COALESCE(aw.display_name, aw.name, aw.id) ASC' });
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
