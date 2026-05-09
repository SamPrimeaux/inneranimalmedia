/**
 * Resolve a unified actor for MCP and protected API paths.
 * Fails closed on missing tenancy or illegal workspace override.
 */

import { resolveIamActorContext } from './identity.js';
import { userHasWorkspaceMembership } from './workspace-provisioning.js';

function trim(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @typedef {{
 *   ok: true,
 *   userId: string,
 *   authUserId: string,
 *   tenantId: string,
 *   workspaceId: string,
 *   personUuid: string | null,
 *   sessionId: string | null,
 *   agentId: string | null,
 *   actorType: 'user'|'service',
 *   actorSource: string,
 *   roles: string[],
 *   scopes: string[],
 *   isSuperadmin: boolean,
 * }} ResolvedActorOk
 */

/**
 * @typedef {{
 *   ok: false,
 *   code: 'ACTOR_CONTEXT_MISSING'|'WORKSPACE_ACCESS_DENIED',
 *   message: string,
 * }} ResolvedActorErr
 */

/**
 * @param {Request} request
 * @param {any} env
 * @param {{
 *   workspaceIdParam?: string | null,
 *   agentId?: string | null,
 *   actorSource?: string | null,
 *   serviceActor?: {
 *     userId: string,
 *     tenantId: string,
 *     workspaceId: string,
 *     personUuid?: string | null,
 *     sessionId?: string | null,
 *     agentId?: string | null,
 *     source?: string | null,
 *   } | null,
 * }} [options]
 * @returns {Promise<ResolvedActorOk|ResolvedActorErr>}
 */
export async function resolveActorContext(request, env, options = {}) {
  const opts = options || {};

  if (opts.serviceActor) {
    const sa = opts.serviceActor;
    const userId = trim(sa.userId);
    const tenantId = trim(sa.tenantId);
    const workspaceId = trim(sa.workspaceId);
    if (!userId.startsWith('au_') || !tenantId || !workspaceId) {
      return {
        ok: false,
        code: 'ACTOR_CONTEXT_MISSING',
        message: 'service actor requires au_* userId and tenant/workspace',
      };
    }
    return {
      ok: true,
      userId,
      authUserId: userId,
      tenantId,
      workspaceId,
      personUuid: sa.personUuid != null ? trim(sa.personUuid) || null : null,
      sessionId: sa.sessionId != null ? trim(sa.sessionId) || null : null,
      agentId: sa.agentId != null ? trim(sa.agentId) || null : null,
      actorType: 'service',
      actorSource: trim(sa.source) || 'system',
      roles: [],
      scopes: [],
      isSuperadmin: false,
    };
  }

  const iam = await resolveIamActorContext(request, env);
  const workspaceIdParam = opts.workspaceIdParam != null ? trim(opts.workspaceIdParam) : '';

  const userId = trim(iam?.userId);
  const tenantId = trim(iam?.tenantId);
  let workspaceId = trim(iam?.workspaceId);
  const personUuid = iam?.personUuid != null && trim(iam.personUuid) !== '' ? trim(iam.personUuid) : null;
  const sessionId = iam?.sessionId != null && trim(iam.sessionId) !== '' ? trim(iam.sessionId) : null;
  const isSuperadmin = Number(iam?.actor?.is_superadmin) === 1;

  if (!userId || !tenantId || !workspaceId) {
    return {
      ok: false,
      code: 'ACTOR_CONTEXT_MISSING',
      message: iam?.error || 'missing userId, tenantId, or workspaceId',
    };
  }

  if (workspaceIdParam && workspaceIdParam !== workspaceId) {
    if (!isSuperadmin) {
      const ok = await userHasWorkspaceMembership(env, userId, workspaceIdParam);
      if (!ok) {
        return { ok: false, code: 'WORKSPACE_ACCESS_DENIED', message: 'workspace not allowed for user' };
      }
    }
    workspaceId = workspaceIdParam;
  }

  return {
    ok: true,
    userId,
    authUserId: userId,
    tenantId,
    workspaceId,
    personUuid,
    sessionId,
    agentId: opts.agentId != null ? trim(opts.agentId) || null : null,
    actorType: 'user',
    actorSource: trim(opts.actorSource) || 'dashboard',
    roles: [],
    scopes: [],
    isSuperadmin,
  };
}
