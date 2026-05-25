import { userHasMembership, resolveFirstMembershipWorkspaceId } from './membership.js';

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

async function pragmaTableInfo(db, tableName) {
  if (!db || !tableName) return new Set();
  const safe = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(tableName)) ? String(tableName) : '';
  if (!safe) return new Set();
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${safe})`).all();
    return new Set((results || []).map((r) => String(r.name || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

function normalizeTenantIdFromEmail(email) {
  const em = trimOrNull(email);
  const local = em && em.includes('@') ? em.split('@')[0] : em;
  const base = String(local || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return `tenant_${base}_${crypto.randomUUID().slice(0, 8)}`;
}

function workspaceSlugFromTenantId(tenantId) {
  const tid = trimOrNull(tenantId);
  const tail = String(tid || '')
    .replace(/^tenant_/, '')
    .replace(/[^a-z0-9]/gi, '_')
    .slice(0, 36);
  return ('ws_' + tail).slice(0, 40);
}

/**
 * Resolve tenant default workspace from tenant_workspaces.
 * @param {any} env
 * @param {string} tenantId
 */
export async function resolveDefaultWorkspaceForTenant(env, tenantId) {
  const tid = trimOrNull(tenantId);
  if (!env?.DB || !tid) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT workspace_id FROM tenant_workspaces
       WHERE tenant_id = ? AND COALESCE(is_default, 0) = 1 AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(tid)
      .first();
    return trimOrNull(row?.workspace_id);
  } catch {
    return null;
  }
}

/**
 * Best-effort membership check. Returns true if user is a member of workspace.
 * @param {any} env
 * @param {string} userId
 * @param {string} workspaceId
 */
/** Membership plane: `memberships` (account_id = auth_users.id). */
export async function userHasWorkspaceMembership(env, userId, workspaceId) {
  return userHasMembership(env, userId, workspaceId);
}

/**
 * Ensure workspace_members row exists for (user, tenant, workspace).
 * Never invents a workspace_id; callers must provide a concrete workspaceId.
 *
 * @param {any} env
 * @param {{ userId: string, tenantId?: string|null, workspaceId: string, personUuid?: string|null, email?: string|null, displayName?: string|null, role?: string|null }} opts
 */
export async function ensureWorkspaceMember(env, opts) {
  const uid = trimOrNull(opts?.userId);
  const wid = trimOrNull(opts?.workspaceId);
  const tid = trimOrNull(opts?.tenantId);
  if (!env?.DB || !uid || !wid) return { ok: false, skipped: true };
  const role = trimOrNull(opts?.role) || 'member';
  const personUuid = trimOrNull(opts?.personUuid);
  const email = trimOrNull(opts?.email);
  const displayName = trimOrNull(opts?.displayName);

  const cols = await pragmaTableInfo(env.DB, 'workspace_members');
  try {
    const insertCols = [
      cols.has('id') && 'id',
      cols.has('workspace_id') && 'workspace_id',
      cols.has('tenant_id') && 'tenant_id',
      cols.has('user_id') && 'user_id',
      cols.has('person_uuid') && 'person_uuid',
      cols.has('email') && 'email',
      cols.has('display_name') && 'display_name',
      cols.has('role') && 'role',
      cols.has('is_active') && 'is_active',
      cols.has('joined_at') && 'joined_at',
      cols.has('created_at') && 'created_at',
      cols.has('updated_at') && 'updated_at',
    ].filter(Boolean);

    const insertVals = [];
    const binds = [];
    const push = (valExpr, bindVal) => {
      insertVals.push(valExpr);
      if (valExpr === '?') binds.push(bindVal);
    };
    for (const c of insertCols) {
      switch (c) {
        case 'id':
          push('?', `wm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`);
          break;
        case 'workspace_id':
          push('?', wid);
          break;
        case 'tenant_id':
          push('?', tid);
          break;
        case 'user_id':
          push('?', uid);
          break;
        case 'person_uuid':
          push('?', personUuid);
          break;
        case 'email':
          push('?', email);
          break;
        case 'display_name':
          push('?', displayName);
          break;
        case 'role':
          push('?', role);
          break;
        case 'is_active':
          push('?', 1);
          break;
        case 'joined_at':
          push(`unixepoch()`, null);
          break;
        case 'created_at':
          push(`unixepoch()`, null);
          break;
        case 'updated_at':
          push(`unixepoch()`, null);
          break;
        default:
          push('?', null);
          break;
      }
    }

    if (insertCols.length) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO workspace_members (${insertCols.join(', ')})
         VALUES (${insertVals.join(', ')})`,
      )
        .bind(...binds)
        .run();
    } else {
      // Extremely old schema fallback.
      await env.DB.prepare(
        `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES (?, ?, ?, unixepoch())`,
      )
        .bind(wid, uid, role)
        .run();
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Ensure auth_users has a tenant_id. If absent, create one and (best-effort) a tenants row.
 * @param {any} env
 * @param {{ id: string, email?: string|null, tenant_id?: string|null, active_tenant_id?: string|null }} authUser
 * @returns {Promise<string|null>}
 */
export async function ensureTenantForUser(env, authUser) {
  const userId = trimOrNull(authUser?.id);
  if (!env?.DB || !userId) return null;

  const existing =
    trimOrNull(authUser?.active_tenant_id) ||
    trimOrNull(authUser?.tenant_id) ||
    (await env.DB
      .prepare(`SELECT COALESCE(active_tenant_id, tenant_id) AS tid, email FROM auth_users WHERE id = ? LIMIT 1`)
      .bind(userId)
      .first()
      .then((r) => trimOrNull(r?.tid))
      .catch(() => null));

  if (existing) return existing;

  const tenantId = normalizeTenantIdFromEmail(authUser?.email);

  // best-effort tenants row (schema may vary across environments)
  try {
    await env.DB.prepare(
      `INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, unixepoch(), unixepoch())`,
    )
      .bind(tenantId, trimOrNull(authUser?.email) || tenantId)
      .run();
  } catch (_) {
    try {
      await env.DB.prepare(
        `INSERT INTO tenants (id, name, created_at) VALUES (?, ?, unixepoch())`,
      )
        .bind(tenantId, trimOrNull(authUser?.email) || tenantId)
        .run();
    } catch {
      /* table may not exist; ignore */
    }
  }

  try {
    await env.DB.prepare(
      `UPDATE auth_users
          SET tenant_id = ?, active_tenant_id = COALESCE(active_tenant_id, ?), updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(tenantId, tenantId, userId)
      .run();
  } catch {
    try {
      await env.DB.prepare(`UPDATE auth_users SET tenant_id = ? WHERE id = ?`).bind(tenantId, userId).run();
    } catch {
      /* ignore */
    }
  }

  return tenantId;
}

/**
 * Ensure a default workspace exists for a tenant and a tenant_workspaces default row is present.
 * @param {any} env
 * @param {string} tenantId
 * @param {{ id: string, email?: string|null, name?: string|null, person_uuid?: string|null }} [authUser]
 * @returns {Promise<string|null>} workspace id
 */
export async function ensureDefaultWorkspaceForTenant(env, tenantId, authUser) {
  const tid = trimOrNull(tenantId);
  if (!env?.DB || !tid) return null;

  const existing = await resolveDefaultWorkspaceForTenant(env, tid);
  if (existing) return existing;

  const wsId = workspaceSlugFromTenantId(tid);
  const display =
    trimOrNull(authUser?.name) ||
    (trimOrNull(authUser?.email) ? String(trimOrNull(authUser.email)).split('@')[0] : null) ||
    'My';
  const wsName = `${display} Workspace`;
  const wsHandle = wsId.replace(/^ws_/, '').slice(0, 60);

  // Create workspace rows in whichever tables exist.
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, handle, status, category, created_at)
       VALUES (?, ?, ?, 'active', 'personal', unixepoch())`,
    )
      .bind(wsId, wsName, wsHandle)
      .run();
  } catch {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO workspaces (id, name, handle, status, created_at)
         VALUES (?, ?, ?, 'active', unixepoch())`,
      )
        .bind(wsId, wsName, wsHandle)
        .run();
    } catch {
      /* ignore */
    }
  }

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO agentsam_workspace (id, tenant_id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, unixepoch(), unixepoch())`,
    )
      .bind(wsId, tid, wsName)
      .run();
  } catch {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO agentsam_workspace (workspace_id, display_name, created_at)
         VALUES (?, ?, unixepoch())`,
      )
        .bind(wsId, wsName)
        .run();
    } catch {
      /* ignore */
    }
  }

  // tenant_workspaces default mapping
  try {
    const twId = `tws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO tenant_workspaces
         (id, tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 1, 1, unixepoch(), unixepoch())`,
    )
      .bind(twId, tid, wsId)
      .run();
  } catch {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO tenant_workspaces
           (tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at)
         VALUES (?, ?, 'owner', 1, 1, unixepoch(), unixepoch())`,
      )
        .bind(tid, wsId)
        .run();
    } catch {
      /* ignore */
    }
  }

  return wsId;
}

/**
 * Alias for resolveDefaultWorkspaceForTenant (kept for callsite readability).
 * @param {any} env
 * @param {string} tenantId
 */
export async function resolveDefaultWorkspaceForTenantId(env, tenantId) {
  return await resolveDefaultWorkspaceForTenant(env, tenantId);
}

/**
 * Idempotently ensure auth_users has active tenant/workspace fields populated.
 * Does not hardcode branded defaults; derives from auth_users + tenant defaults + membership.
 *
 * @param {any} env
 * @param {{ id: string, tenant_id?: string|null, active_tenant_id?: string|null, active_workspace_id?: string|null, person_uuid?: string|null }} authUser
 */
export async function ensureUserTenantWorkspace(env, authUser) {
  const userId = trimOrNull(authUser?.id);
  if (!env?.DB || !userId) return { ok: false, reason: 'no_db_or_user' };

  let tenantId = trimOrNull(authUser?.active_tenant_id) || trimOrNull(authUser?.tenant_id) || null;
  let workspaceId = trimOrNull(authUser?.active_workspace_id) || null;

  if (!tenantId) {
    tenantId = await ensureTenantForUser(env, authUser);
  }

  if (!workspaceId && tenantId) {
    workspaceId = await resolveDefaultWorkspaceForTenant(env, tenantId);
    if (!workspaceId) {
      workspaceId = await ensureDefaultWorkspaceForTenant(env, tenantId, authUser);
    }
  }

  // If we have a candidate workspaceId, ensure membership and wire it into auth_users.
  if (workspaceId) {
    try {
      await ensureWorkspaceMember(env, {
        userId,
        tenantId,
        workspaceId,
        personUuid: trimOrNull(authUser?.person_uuid),
        email: trimOrNull(authUser?.email),
        displayName: trimOrNull(authUser?.name),
        role: 'owner',
      });
    } catch {
      /* ignore */
    }
    try {
      await env.DB.prepare(
        `UPDATE auth_users SET
           active_tenant_id = COALESCE(active_tenant_id, tenant_id),
           active_workspace_id = COALESCE(active_workspace_id, ?),
           updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(workspaceId, userId)
        .run();
    } catch {
      /* ignore */
    }
  } else if (tenantId) {
    try {
      await env.DB.prepare(
        `UPDATE auth_users SET
           active_tenant_id = COALESCE(active_tenant_id, tenant_id),
           updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(userId)
        .run();
    } catch {
      /* ignore */
    }
  }

  return { ok: true, tenantId, workspaceId };
}

