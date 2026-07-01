/**
 * Mobile exec profile — parse client_surface / exec_lane from workspaceContext or envelope.
 */

/**
 * @param {unknown} wsCtx
 * @returns {string|null}
 */
export function parseClientSurface(wsCtx) {
  if (!wsCtx || typeof wsCtx !== 'object') return null;
  const s = /** @type {Record<string, unknown>} */ (wsCtx).client_surface;
  const raw = s != null ? String(s).trim() : '';
  return raw || null;
}

/**
 * @param {unknown} wsCtx
 * @returns {'auto'|'remote'|'local'|'sandbox'|null}
 */
export function parseExecLane(wsCtx) {
  if (!wsCtx || typeof wsCtx !== 'object') return null;
  const lane = /** @type {Record<string, unknown>} */ (wsCtx).exec_lane;
  const raw = lane != null ? String(lane).trim().toLowerCase() : '';
  if (raw === 'auto' || raw === 'remote' || raw === 'local' || raw === 'sandbox') return raw;
  return null;
}

/**
 * @param {string|null|undefined} clientSurface
 */
export function isMobileClientSurface(clientSurface) {
  return String(clientSurface || '')
    .trim()
    .toLowerCase()
    .startsWith('mobile');
}

/**
 * Mobile sessions should not auto-pick Mac localpty when Mac may be asleep.
 * @param {string|null|undefined} clientSurface
 * @param {'auto'|'remote'|'local'|'sandbox'|null|undefined} execLane
 */
export function shouldSkipLocalTerminalTunnel(clientSurface, execLane) {
  if (!isMobileClientSurface(clientSurface)) return false;
  const lane = String(execLane || 'auto').trim().toLowerCase();
  return lane !== 'local';
}

/**
 * @param {string|null|undefined} clientSurface
 * @param {'auto'|'remote'|'local'|'sandbox'|null|undefined} execLane
 */
export function formatMobileExecProfilePromptBlock(clientSurface, execLane) {
  if (!isMobileClientSurface(clientSurface)) return '';
  const lane = String(execLane || 'auto').trim().toLowerCase();
  const lines = [
    '[Mobile client surface — Mac local PTY may be offline]',
    `client_surface: ${String(clientSurface).trim()}`,
    `exec_lane: ${lane}`,
    '',
    'Routing law for this turn:',
    '- Prefer GitHub API tools and pinned context envelope content for file reads/writes.',
    '- Do NOT use agentsam_terminal_local — the user is on a phone; their Mac may be asleep.',
    '- For shell/git/build on the repo clone, use agentsam_terminal_remote (GCP cloud desk).',
    '- For isolated experiments, use agentsam_terminal_sandbox.',
  ];
  if (lane === 'remote') {
    lines.push('- User selected Cloud desk — always use agentsam_terminal_remote for terminal work.');
  } else if (lane === 'sandbox') {
    lines.push('- User selected Sandbox — prefer agentsam_terminal_sandbox for command execution.');
  }
  return lines.join('\n');
}
