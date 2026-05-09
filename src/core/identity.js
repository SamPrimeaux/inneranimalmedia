/**
 * src/core/identity.js
 *
 * Resolves authenticated identity from a live request.
 * Returns null if session is missing or expired.
 * Callers must handle null as 401 — never substitute defaults.
 */
import { getSession, getAuthUser, fetchAuthUserTenantId } from './auth.js';
import {
  resolveDefaultWorkspaceForTenant,
  ensureUserTenantWorkspace,
  userHasWorkspaceMembership,
} from './workspace-provisioning.js';

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function envAllowsAutoProvision(env) {
  const raw = env?.ALLOW_USER_PROVISIONING;
  if (raw == null) return true;
  const s = String(raw).trim().toLowerCase();
  if (s === '0' || s === 'false' || s === 'no') return false;
  return true;
}

/**
 * Request-scoped actor context for tenancy, workspace headers, and MCP tool scope.
 * Does not default tenant/workspace to branded literals — derives from session, actor, and optional `x-iam-workspace-id`.
 */
export async function resolveIamActorContext(request, env) {
  const session = await getSession(env, request).catch(() => null);
  const actor = await getAuthUser(request, env).catch(() => null);

  let tenantId =
    trimOrNull(actor?.active_tenant_id) ||
    trimOrNull(actor?.tenant_id) ||
    trimOrNull(session?.tenant_id);

  let workspaceIdHeader = trimOrNull(request.headers.get('x-iam-workspace-id'));
  let workspaceId =
    workspaceIdHeader ||
    trimOrNull(actor?.active_workspace_id) ||
    trimOrNull(session?.workspace_id);

  let userId =
    trimOrNull(actor?.auth_id) ||
    trimOrNull(actor?.user_id) ||
    trimOrNull(actor?.id) ||
    trimOrNull(session?.user_id);

  if (!tenantId && userId && env?.DB) {
    try {
      tenantId = trimOrNull(await fetchAuthUserTenantId(env, userId));
    } catch (_) {}
  }

  const personUuid =
    actor?.person_uuid != null && String(actor.person_uuid).trim() !== ''
      ? String(actor.person_uuid).trim()
      : null;

  const isSuperadmin = Number(actor?.is_superadmin) === 1;

  // Validate x-iam-workspace-id only if user is a member or superadmin; otherwise ignore it.
  if (workspaceIdHeader && userId && env?.DB && !isSuperadmin) {
    const ok = await userHasWorkspaceMembership(env, userId, workspaceIdHeader);
    if (!ok) {
      workspaceIdHeader = null;
      workspaceId = trimOrNull(actor?.active_workspace_id) || trimOrNull(session?.workspace_id);
    }
  }

  // If still missing, resolve tenant default workspace. No branded fallbacks.
  if (!workspaceId && tenantId && env?.DB) {
    workspaceId = await resolveDefaultWorkspaceForTenant(env, tenantId);
  }

  const sessionId =
    trimOrNull(actor?.session_id) ||
    trimOrNull(session?.session_id) ||
    null;

  // Auto-provision tenant/workspace for authenticated users when allowed.
  // This must never fallback to a branded workspace; it only creates/sets rows for THIS user/tenant.
  if (envAllowsAutoProvision(env) && env?.DB && userId && !isSuperadmin) {
    if (!tenantId || !workspaceId) {
      try {
        const provision = await ensureUserTenantWorkspace(env, {
          id: userId,
          email: actor?.email ?? null,
          name: actor?.name ?? null,
          tenant_id: actor?.tenant_id ?? null,
          active_tenant_id: actor?.active_tenant_id ?? null,
          active_workspace_id: actor?.active_workspace_id ?? null,
          person_uuid: actor?.person_uuid ?? null,
        });
        if (!tenantId) tenantId = trimOrNull(provision?.tenantId);
        if (!workspaceId) workspaceId = trimOrNull(provision?.workspaceId);
      } catch {
        /* warn-only; error returned below */
      }
    }
  }

  // For authenticated (non-superadmin) requests, missing workspace is an error state.
  const error =
    userId && tenantId && !workspaceId && !isSuperadmin
      ? 'WORKSPACE_CONTEXT_MISSING'
      : null;

  return {
    actor,
    session,
    tenantId,
    workspaceId,
    userId,
    personUuid,
    isSuperadmin,
    sessionId,
    error,
  };
}

export async function resolveIdentity(env, request) {
  if (!env?.DB) return null;

  const ctx = await resolveIamActorContext(request, env);
  if (!ctx.userId) return null;

  const tenantId = ctx.tenantId;
  if (!tenantId) return null;

  let workspaceIdResolved = ctx.workspaceId;
  let workspaceSlug = null;
  let defaultModelId = null;

  const user = ctx.actor || (await getAuthUser(request, env).catch(() => null));

  if (workspaceIdResolved) {
    try {
      const row = await env.DB.prepare(
        `SELECT w.id AS workspace_id, w.handle AS handle, aw.default_model_id
         FROM workspaces w
         LEFT JOIN agentsam_workspace aw ON aw.id = w.id
         WHERE w.id = ?
         LIMIT 1`,
      )
        .bind(workspaceIdResolved)
        .first();
      if (row) {
        workspaceSlug = row.handle ?? null;
        defaultModelId = row.default_model_id ?? null;
      }
    } catch (_) {}
  } else {
    const defaultWs = await env.DB.prepare(
      `SELECT tw.workspace_id AS workspace_id, w.handle AS handle,
              aw.default_model_id
       FROM tenant_workspaces tw
       JOIN workspaces w ON w.id = tw.workspace_id
       LEFT JOIN agentsam_workspace aw ON aw.id = tw.workspace_id
       WHERE tw.tenant_id = ?
         AND tw.is_default = 1
         AND tw.is_active = 1
       LIMIT 1`,
    )
      .bind(tenantId)
      .first()
      .catch(() => null);

    const fallbackWs = defaultWs
      ? null
      : await env.DB.prepare(
          `SELECT w.id AS workspace_id, w.handle AS handle,
                  aw.default_model_id
           FROM workspaces w
           LEFT JOIN agentsam_workspace aw ON aw.id = w.id
           WHERE w.status = 'active'
             AND (w.owner_tenant_id = ? OR w.default_tenant_id = ?)
           ORDER BY w.created_at ASC
           LIMIT 1`,
        )
          .bind(tenantId, tenantId)
          .first()
          .catch(() => null);

    const ws = defaultWs || fallbackWs || null;
    workspaceIdResolved = ws?.workspace_id ?? null;
    workspaceSlug = ws?.handle ?? null;
    defaultModelId = ws?.default_model_id ?? null;
  }

  return {
    userId: ctx.userId,
    tenantId,
    workspaceId: workspaceIdResolved,
    workspaceSlug,
    defaultModelId,
    email: user?.email ?? null,
    name: user?.name ?? null,
    isSuperadmin: ctx.isSuperadmin,
    personUuid: ctx.personUuid,
    sessionId: ctx.sessionId,
    error: ctx.error,
  };
}

export async function resolveSessionIds(env, request) {
  const id = await resolveIdentity(env, request);
  if (!id) return null;
  return {
    userId: id.userId,
    tenantId: id.tenantId,
    workspaceId: id.workspaceId,
  };
}

/** Multi-user runtime actor contract (no seed-id fallbacks). */
export {
  runtimeActorFromIamContext,
  assertRuntimeActor,
  assertRuntimeActorForTool,
  assertActorContext,
  isRuntimeActorComplete,
  ledgerBindingsFromActor,
  isCanonicalAuthUserId,
  isTenantId,
  isWorkspaceId,
} from './runtime-actor.js';
