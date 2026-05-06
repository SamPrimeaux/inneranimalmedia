/**
 * agentsam_bootstrap resolution — multi-tenant workspace + bootstrap row selection.
 */
import { getSession, fetchAuthUserTenantId, authUserIsSuperadmin } from './auth.js';
import { resolveIamActorContext } from './identity.js';

export const WORKSPACE_CONTEXT_MISSING = 'WORKSPACE_CONTEXT_MISSING';
/** workspace_settings.workspace_root missing or invalid for the resolved workspace id */
export const WORKSPACE_ROOT_CONTEXT_MISSING = 'WORKSPACE_ROOT_CONTEXT_MISSING';

function trim(s) {
  if (s == null) return '';
  const t = String(s).trim();
  return t;
}

/**
 * @param {any} env
 * @param {string|null|undefined} workspaceId
 */
export async function resolveTenantIdForWorkspace(env, workspaceId) {
  const ws = trim(workspaceId);
  if (!ws || !env?.DB) return null;
  try {
    const tw = await env.DB.prepare(
      `SELECT tenant_id FROM tenant_workspaces
       WHERE workspace_id = ? AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(ws)
      .first();
    if (tw?.tenant_id) return trim(tw.tenant_id) || null;
    const row = await env.DB.prepare(
      `SELECT COALESCE(owner_tenant_id, default_tenant_id) AS tid
       FROM workspaces WHERE id = ? LIMIT 1`,
    )
      .bind(ws)
      .first();
    const tid = row?.tid;
    return tid != null && trim(tid) ? trim(tid) : null;
  } catch {
    return null;
  }
}

/**
 * Default workspace id for a tenant (tenant_workspaces.is_default).
 */
export async function resolveDefaultWorkspaceIdForTenant(env, tenantId) {
  const tid = trim(tenantId);
  if (!tid || !env?.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT workspace_id FROM tenant_workspaces
       WHERE tenant_id = ? AND COALESCE(is_default, 0) = 1 AND COALESCE(is_active, 1) = 1
       LIMIT 1`,
    )
      .bind(tid)
      .first();
    return row?.workspace_id ? trim(row.workspace_id) || null : null;
  } catch {
    return null;
  }
}

/**
 * Resolves effective workspace for authenticated requests without hardcoding tenant workspaces.
 *
 * @returns {Promise<{ workspaceId: string|null, error: string|null }>}
 */
export async function resolveEffectiveWorkspaceId(env, request, authUser, cache) {
  if (!env?.DB) return { workspaceId: null, error: WORKSPACE_CONTEXT_MISSING };

  let workspaceId = '';
  let session = cache?.__session ?? null;
  let actorCtx = null;

  if (request) {
    actorCtx = await resolveIamActorContext(request, env).catch(() => null);
    workspaceId =
      trim(request.headers.get('x-iam-workspace-id')) ||
      trim(actorCtx?.workspaceId) ||
      '';

    if (!session) {
      session = await getSession(env, request).catch(() => null);
      if (cache && typeof cache === 'object') cache.__session = session;
    }
  }

  const uid = trim(authUser?.id || actorCtx?.userId);

  if (!workspaceId && session?.workspace_id) workspaceId = trim(session.workspace_id);

  if (!workspaceId && uid) {
    try {
      const au = await env.DB.prepare(
        `SELECT active_workspace_id FROM auth_users WHERE id = ? LIMIT 1`,
      )
        .bind(uid)
        .first();
      if (au?.active_workspace_id) workspaceId = trim(au.active_workspace_id);
    } catch (_) {}
  }

  let tenantId =
    trim(authUser?.tenant_id) ||
    trim(actorCtx?.tenantId) ||
    trim(session?.tenant_id) ||
    '';

  if (!tenantId && uid) {
    tenantId = trim(await fetchAuthUserTenantId(env, uid).catch(() => null));
  }

  if (!workspaceId && tenantId) {
    workspaceId = trim(await resolveDefaultWorkspaceIdForTenant(env, tenantId)) || '';
  }

  if (!workspaceId && uid) {
    try {
      const wm = await env.DB.prepare(
        `SELECT workspace_id FROM workspace_members
         WHERE user_id = ? AND COALESCE(is_active, 1) = 1
         ORDER BY joined_at DESC
         LIMIT 1`,
      )
        .bind(uid)
        .first();
      if (wm?.workspace_id) workspaceId = trim(wm.workspace_id);
    } catch (_) {}
  }

  if (!workspaceId && authUser && authUserIsSuperadmin(authUser)) {
    // Superadmin may operate in an explicitly configured platform workspace ONLY.
    // Never fallback to a branded literal workspace id at runtime.
    workspaceId = trim(env.WORKSPACE_ID) || '';
  }

  if (!workspaceId) {
    return { workspaceId: null, error: WORKSPACE_CONTEXT_MISSING };
  }

  return { workspaceId, error: null };
}

async function userCanAccessWorkspace(env, authUser, workspaceId) {
  const wid = trim(workspaceId);
  const uid = trim(authUser?.id);
  if (!wid || !uid || !env?.DB) return false;
  if (authUserIsSuperadmin(authUser)) return true;
  let tenantId = trim(authUser?.tenant_id);
  if (!tenantId) tenantId = trim(await fetchAuthUserTenantId(env, uid).catch(() => null));
  const ws = await env.DB.prepare(`SELECT user_id, tenant_id FROM workspaces WHERE id = ?`).bind(wid).first();
  if (!ws) return false;
  if (String(ws.user_id || '') === uid) return true;
  if (tenantId && String(ws.tenant_id || '') === tenantId) return true;
  const m = await env.DB
    .prepare(
      `SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1`,
    )
    .bind(wid, uid)
    .first();
  return !!m;
}

/**
 * Terminal: optional explicit workspace from URL/body must pass membership checks; otherwise session/auth resolution.
 *
 * @returns {Promise<{ workspaceId: string|null, error: string|null }>}
 */
export async function resolveTerminalWorkspaceId(env, request, authUser, explicitRaw) {
  const explicit = trim(explicitRaw);
  if (explicit) {
    if (!(await userCanAccessWorkspace(env, authUser, explicit))) {
      return { workspaceId: null, error: 'Forbidden' };
    }
    return { workspaceId: explicit, error: null };
  }
  const base = await resolveEffectiveWorkspaceId(env, request, authUser, {});
  if (base.error || !base.workspaceId) {
    return { workspaceId: null, error: WORKSPACE_CONTEXT_MISSING };
  }
  return { workspaceId: base.workspaceId, error: null };
}

/**
 * Active bootstrap row for the given identity + workspace scope.
 *
 * Selection order:
 * 1. user_id + workspace_id (active)
 * 2. person_uuid + workspace_id (active)
 * 3. tenant_id + workspace_id (active)
 * 4. If workspace unknown, caller should call resolveEffectiveWorkspaceId first.
 * 5. user_id-only when exactly one active bootstrap exists for that user (legacy), only if workspace could not be resolved.
 *
 * @param {any} env
 * @param {{ userId?: string|null, personUuid?: string|null, tenantId?: string|null, workspaceId?: string|null }} opts
 */
export async function resolveActiveBootstrap(env, opts) {
  if (!env?.DB) return null;

  let wid = trim(opts.workspaceId);
  const uid = trim(opts.userId);
  const pid = trim(opts.personUuid);
  let tid = trim(opts.tenantId);

  if (!tid && wid) {
    tid = trim(await resolveTenantIdForWorkspace(env, wid)) || '';
  }

  if (!wid && tid) {
    wid = trim(await resolveDefaultWorkspaceIdForTenant(env, tid)) || '';
  }

  let row = null;

  if (wid && uid) {
    row = await env.DB.prepare(
      `SELECT * FROM agentsam_bootstrap
       WHERE COALESCE(is_active, 1) = 1 AND user_id = ? AND workspace_id = ?
       LIMIT 1`,
    )
      .bind(uid, wid)
      .first()
      .catch(() => null);
  }

  if (!row && wid && pid) {
    row = await env.DB.prepare(
      `SELECT * FROM agentsam_bootstrap
       WHERE COALESCE(is_active, 1) = 1 AND person_uuid = ? AND workspace_id = ?
       LIMIT 1`,
    )
      .bind(pid, wid)
      .first()
      .catch(() => null);
  }

  if (!row && wid && tid) {
    row = await env.DB.prepare(
      `SELECT * FROM agentsam_bootstrap
       WHERE COALESCE(is_active, 1) = 1 AND tenant_id = ? AND workspace_id = ?
       LIMIT 1`,
    )
      .bind(tid, wid)
      .first()
      .catch(() => null);
  }

  if (!row && !wid && uid) {
    try {
      const cnt = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agentsam_bootstrap
         WHERE user_id = ? AND COALESCE(is_active, 1) = 1`,
      )
        .bind(uid)
        .first();
      const n = Number(cnt?.n || 0);
      if (n === 1) {
        row = await env.DB.prepare(
          `SELECT * FROM agentsam_bootstrap
           WHERE user_id = ? AND COALESCE(is_active, 1) = 1
           LIMIT 1`,
        )
          .bind(uid)
          .first()
          .catch(() => null);
      }
    } catch (_) {}
  }

  return row || null;
}

/**
 * Workspace + bootstrap slice for routing / telemetry (replaces legacy user-only bootstrap SELECT).
 *
 * @returns {Promise<{ workspace_id: string|null, bootstrap: object|null, error: string|null }>}
 */
export async function resolveBootstrapWorkspaceContext(env, request, userId, cache) {
  const uid = userId != null ? String(userId).trim() : '';
  if (!uid) {
    return { workspace_id: IAM_SAM_FALLBACK_WORKSPACE_ID, bootstrap: null, error: null };
  }

  if (cache && typeof cache === 'object' && cache.__bootstrapCtx != null) {
    return cache.__bootstrapCtx;
  }

  const authUser = request ? await getAuthUser(request, env).catch(() => null) : null;

  let syntheticAuth = authUser;
  if (!syntheticAuth && uid && env?.DB) {
    try {
      const ur = await env.DB.prepare(`SELECT * FROM auth_users WHERE id = ? LIMIT 1`).bind(uid).first();
      if (ur) {
        syntheticAuth = {
          id: ur.id,
          tenant_id: ur.tenant_id,
          person_uuid: ur.person_uuid,
          email: ur.email,
          is_superadmin: ur.is_superadmin ? 1 : 0,
        };
      }
    } catch (_) {}
  }

  const wsRes = await resolveEffectiveWorkspaceId(env, request, syntheticAuth, cache || {});
  if (wsRes.error) {
    const out = { workspace_id: null, bootstrap: null, error: wsRes.error };
    if (cache && typeof cache === 'object') cache.__bootstrapCtx = out;
    return out;
  }

  const wid = wsRes.workspaceId;
  const tid =
    trim(syntheticAuth?.tenant_id) ||
    trim(await fetchAuthUserTenantId(env, uid).catch(() => null)) ||
    trim(await resolveTenantIdForWorkspace(env, wid)) ||
    '';

  const boot = await resolveActiveBootstrap(env, {
    userId: uid,
    personUuid: syntheticAuth?.person_uuid || null,
    tenantId: tid || null,
    workspaceId: wid,
  });

  const out = {
    workspace_id: wid,
    bootstrap: boot || null,
    error: null,
  };
  if (cache && typeof cache === 'object') cache.__bootstrapCtx = out;
  return out;
}
