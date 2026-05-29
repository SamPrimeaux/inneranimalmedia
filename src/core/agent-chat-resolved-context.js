/**
 * Canonical resolved identity/workspace context for Agent Sam chat requests.
 * Built once per /api/agent/chat after session auth — tools must not re-infer tenant/workspace.
 */
import { loadAgentSamUserPolicy } from './agent-policy.js';
import { FS_SEARCH_PTY_REPO_DIR } from './fs-search-rg-parse.js';

/**
 * @param {any} env
 * @param {{
 *   request?: Request,
 *   userId: string,
 *   tenantId?: string|null,
 *   workspaceId: string,
 *   workSessionId?: string|null,
 *   sessionId?: string|null,
 *   userPolicy?: Record<string, unknown>|null,
 * }} input
 */
export async function buildAgentChatResolvedContext(env, input) {
  const userId = String(input.userId || '').trim();
  const workspaceId = String(input.workspaceId || '').trim();
  const tenantId = input.tenantId != null ? String(input.tenantId).trim() : '';
  const workSessionId =
    input.workSessionId != null && String(input.workSessionId).trim() !== ''
      ? String(input.workSessionId).trim()
      : null;
  const sessionId =
    input.sessionId != null && String(input.sessionId).trim() !== ''
      ? String(input.sessionId).trim()
      : null;

  const policy =
    input.userPolicy && typeof input.userPolicy === 'object'
      ? input.userPolicy
      : userId
        ? await loadAgentSamUserPolicy(env, userId, workspaceId)
        : null;

  return {
    user_id: userId,
    tenant_id: tenantId || null,
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    work_session_id: workSessionId,
    session_id: sessionId,
    policy,
    can_run_pty: Number(policy?.can_run_pty) === 1,
    workspace_root: FS_SEARCH_PTY_REPO_DIR,
  };
}

/**
 * Merge resolved chat context into tool runContext (idempotent).
 * @param {Record<string, unknown>} runContext
 * @param {Record<string, unknown>|null|undefined} resolved
 */
export function mergeResolvedContextIntoRunContext(runContext, resolved) {
  if (!resolved || typeof resolved !== 'object') return runContext;
  const rc = runContext && typeof runContext === 'object' ? runContext : {};
  if (!rc.userId && !rc.user_id && resolved.user_id) {
    rc.userId = resolved.user_id;
    rc.user_id = resolved.user_id;
  }
  if (!rc.workspaceId && !rc.workspace_id && resolved.workspace_id) {
    rc.workspaceId = resolved.workspace_id;
    rc.workspace_id = resolved.workspace_id;
  }
  if (!rc.tenantId && !rc.tenant_id && resolved.tenant_id) {
    rc.tenantId = resolved.tenant_id;
    rc.tenant_id = resolved.tenant_id;
  }
  if (!rc.workSessionId && !rc.work_session_id && resolved.work_session_id) {
    rc.workSessionId = resolved.work_session_id;
    rc.work_session_id = resolved.work_session_id;
  }
  if (!rc.resolvedContext) rc.resolvedContext = resolved;
  return rc;
}
