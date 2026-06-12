/**
 * Platform operator gate — explicit agentsam_user_policy.platform_operator plus
 * operator-identity registry fallback for Sam tenant superadmins.
 */
import { isPlatformOperator, resolveOperatorAuthUserRow } from './operator-identity.js';

export const PLATFORM_WORKSPACE_ID = 'ws_inneranimalmedia';

const OPERATOR_TERMINAL_TOOL_KEYS = new Set([
  'agentsam_terminal_local',
  'agentsam_terminal_remote',
]);

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * @param {any} env
 * @param {string} userId
 * @param {string} [workspaceId]
 */
async function loadPlatformOperatorPolicy(env, userId, workspaceId) {
  if (!env?.DB || !userId) return null;
  const uid = trim(userId);
  const wid = trim(workspaceId);
  try {
    if (wid) {
      const row = await env.DB.prepare(
        `SELECT platform_operator
           FROM agentsam_user_policy
          WHERE user_id = ? AND workspace_id = ?
          LIMIT 1`,
      )
        .bind(uid, wid)
        .first();
      if (row) return Number(row.platform_operator) === 1;
    }
    const anyRow = await env.DB.prepare(
      `SELECT platform_operator
         FROM agentsam_user_policy
        WHERE user_id = ? AND platform_operator = 1
        LIMIT 1`,
    )
      .bind(uid)
      .first();
    if (anyRow) return true;
    const denyRow = await env.DB.prepare(
      `SELECT platform_operator
         FROM agentsam_user_policy
        WHERE user_id = ? AND platform_operator = 0
        LIMIT 1`,
    )
      .bind(uid)
      .first();
    if (denyRow && !anyRow) return false;
  } catch {
    /* column may be missing pre-migration */
  }
  return null;
}

/**
 * True when the user may use operator terminal MCP tools and platform workspace switch.
 *
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {string} [workspaceId]
 */
export async function userIsPlatformOperator(env, authUser, workspaceId) {
  const row = await resolveOperatorAuthUserRow(env, authUser);
  const userId = trim(row?.id || authUser?.id);
  if (!userId) return false;

  const policy = await loadPlatformOperatorPolicy(env, userId, workspaceId);
  if (policy === true) return true;
  if (policy === false) return false;

  return isPlatformOperator(env, row);
}

/**
 * @param {string} toolKey
 */
export function isOperatorOnlyTerminalTool(toolKey) {
  return OPERATOR_TERMINAL_TOOL_KEYS.has(trim(toolKey).toLowerCase());
}

/**
 * Hide platform workspace from switchers for non-operators (defense in depth).
 *
 * @param {any[]} workspaces
 * @param {boolean} isOperator
 */
export function filterWorkspacesForOperatorPolicy(workspaces, isOperator) {
  if (isOperator || !Array.isArray(workspaces)) return workspaces || [];
  return workspaces.filter((w) => trim(w?.id) !== PLATFORM_WORKSPACE_ID);
}

/**
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {string} workspaceId
 */
export async function userCanActivatePlatformWorkspace(env, authUser, workspaceId) {
  if (trim(workspaceId) !== PLATFORM_WORKSPACE_ID) return true;
  return userIsPlatformOperator(env, authUser, workspaceId);
}
