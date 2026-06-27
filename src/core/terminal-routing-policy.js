/**
 * Terminal exec routing — local (Mac) vs remote (GCP iam-tunnel).
 * agentsam_terminal_remote must never auto-pick conn_mac_local via health_mac_local.
 */

export const TERMINAL_GCP_CONNECTION_ID = 'conn_gcp_iam_tunnel';

const REMOTE_TOOL_NAMES = new Set([
  'agentsam_terminal_remote',
  'terminal_execute',
  'terminal_run',
  'terminal_wrangler',
]);

const LOCAL_TOOL_NAMES = new Set(['agentsam_terminal_local']);

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
    return {
      target_type: explicitType || 'user_hosted_tunnel',
      target_id: explicitTarget || null,
      lane: 'mac_local',
    };
  }

  if (REMOTE_TOOL_NAMES.has(toolName)) {
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
