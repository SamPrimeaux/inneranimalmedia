/**
 * Terminal exec routing — three lanes (see docs/platform/terminal-three-lane-model.md):
 *   local  → user_hosted_tunnel (caller's device)
 *   remote → platform_vm GCP iam-tunnel (Sam operator cloud desk)
 *   sandbox → container per zone_slug (all users, isolated dev)
 */

import { isSamOperatorLaneUserId } from './platform-operator-policy.js';

export const TERMINAL_GCP_CONNECTION_ID = 'conn_gcp_iam_tunnel';

const REMOTE_TOOL_NAMES = new Set(['agentsam_terminal_remote']);

const LEGACY_TERMINAL_TOOL_NAMES = new Set([
  'terminal_execute',
  'terminal_run',
  'terminal_wrangler',
]);

const LOCAL_TOOL_NAMES = new Set(['agentsam_terminal_local']);

const SANDBOX_TOOL_NAMES = new Set(['agentsam_terminal_sandbox']);

/**
 * @param {{
 *   tool_name?: string|null,
 *   toolName?: string|null,
 *   tool_key?: string|null,
 *   toolKey?: string|null,
 *   target_id?: string|null,
 *   target_type?: string|null,
 * }} [ctx]
 */
export function resolveTerminalExecRouting(ctx = {}) {
  const toolName = String(
    ctx.tool_name || ctx.toolName || ctx.tool_key || ctx.toolKey || '',
  ).trim();
  const explicitTarget = ctx.target_id != null ? String(ctx.target_id).trim() : '';
  const explicitType = ctx.target_type != null ? String(ctx.target_type).trim() : '';

  if (LOCAL_TOOL_NAMES.has(toolName)) {
    // Any user with a provisioned device tunnel (Connor Windows, Sam Mac, etc.)
    return {
      target_type: explicitType || 'user_hosted_tunnel',
      target_id: explicitTarget || null,
      lane: isSamOperatorLaneUserId(ctx.user_id ?? ctx.userId) ? 'mac_local' : 'user_local',
    };
  }

  if (SANDBOX_TOOL_NAMES.has(toolName)) {
    return {
      target_type: explicitType || 'container',
      target_id: explicitTarget || null,
      lane: 'sandbox_container',
    };
  }

  if (LEGACY_TERMINAL_TOOL_NAMES.has(toolName)) {
    return {
      target_type: explicitType || 'container',
      target_id: explicitTarget || null,
      lane: 'sandbox_container',
    };
  }

  if (REMOTE_TOOL_NAMES.has(toolName)) {
    if (!isSamOperatorLaneUserId(ctx.user_id ?? ctx.userId)) {
      return {
        target_type: explicitType || 'platform_vm',
        target_id: explicitTarget || null,
        lane: 'forbidden_non_operator',
        forbidden: true,
      };
    }
    return {
      target_type: explicitType || 'platform_vm',
      target_id: explicitTarget || TERMINAL_GCP_CONNECTION_ID,
      lane: 'gcp_primary',
    };
  }

  if (explicitType || explicitTarget) {
    return {
      target_type: explicitType || null,
      target_id: explicitTarget || null,
      lane: explicitTarget === TERMINAL_GCP_CONNECTION_ID ? 'gcp_primary' : null,
    };
  }

  return { target_type: null, target_id: null, lane: null };
}

/**
 * @param {string|null|undefined} toolName
 */
export function terminalToolPrefersGcpLane(toolName) {
  return REMOTE_TOOL_NAMES.has(String(toolName || '').trim());
}

/**
 * Remote VM (terminal.inneranimalmedia.com) is platform-operator only.
 * Local uses the caller's user_hosted_tunnel — see validateUserLocalTerminalAccess.
 */
export function validateSamOperatorTerminalAccess(userId, toolName) {
  const tk = String(toolName || '').trim();
  if (tk !== 'agentsam_terminal_remote') {
    return { ok: true };
  }
  if (isSamOperatorLaneUserId(userId)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: 'operator_lane_forbidden',
    user_message:
      'agentsam_terminal_remote (GCP cloud desk) is restricted to platform operators. Use agentsam_terminal_local for your own device tunnel or agentsam_terminal_sandbox for an isolated dev container zone.',
  };
}

/**
 * Local terminal requires a provisioned user_hosted_tunnel for this user/workspace.
 * @param {import('@cloudflare/workers-types').D1Database|null|undefined} db
 * @param {string|null|undefined} userId
 * @param {string|null|undefined} workspaceId
 * @returns {Promise<{ ok: true } | { ok: false, error: string, user_message: string }>}
 */
export async function validateUserLocalTerminalAccess(db, userId, workspaceId) {
  const uid = userId != null ? String(userId).trim() : '';
  const wid = workspaceId != null ? String(workspaceId).trim() : '';
  if (!uid || !wid) {
    return {
      ok: false,
      error: 'auth_required',
      user_message: 'Sign in and select a workspace to use agentsam_terminal_local.',
    };
  }
  if (!db) {
    return {
      ok: false,
      error: 'db_unavailable',
      user_message: 'Terminal provisioning check unavailable.',
    };
  }
  const { getUserHostedTunnelConnection } = await import('./terminal.js');
  const conn = await getUserHostedTunnelConnection(db, uid, wid);
  if (!conn?.ws_url) {
    return {
      ok: false,
      error: 'user_hosted_tunnel_not_provisioned',
      user_message:
        'No device tunnel configured. Install cloudflared on your machine and complete terminal setup (Settings → Terminal) to use agentsam_terminal_local.',
    };
  }
  return { ok: true };
}
