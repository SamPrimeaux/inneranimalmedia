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
 * @param {unknown} wsCtx
 * @returns {string[]}
 */
export function parseEnabledConnectors(wsCtx) {
  if (!wsCtx || typeof wsCtx !== 'object') return [];
  const raw = /** @type {Record<string, unknown>} */ (wsCtx).enabled_connectors;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 24);
}

/**
 * @param {unknown} wsCtx
 */
export function parseAssumeMacLocal(wsCtx) {
  if (!wsCtx || typeof wsCtx !== 'object') return false;
  return /** @type {Record<string, unknown>} */ (wsCtx).assume_mac_local === true;
}

/**
 * @param {unknown} wsCtx
 * @returns {string[]}
 */
export function parseEnabledTools(wsCtx) {
  if (!wsCtx || typeof wsCtx !== 'object') return [];
  const raw = /** @type {Record<string, unknown>} */ (wsCtx).enabled_tools;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 200);
}

/**
 * @param {unknown} wsCtx
 */
export function parseSessionProjectId(wsCtx) {
  if (!wsCtx || typeof wsCtx !== 'object') return null;
  const id = /** @type {Record<string, unknown>} */ (wsCtx).session_project_id;
  const raw = id != null ? String(id).trim() : '';
  return raw || null;
}

/**
 * @param {string|null|undefined} clientSurface
 * @param {'auto'|'remote'|'local'|'sandbox'|null|undefined} execLane
 * @param {string[]} [enabledConnectors]
 * @param {string[]} [enabledTools]
 * @param {string|null} [sessionProjectId]
 */
export function formatMobileExecProfilePromptBlock(
  clientSurface,
  execLane,
  enabledConnectors = [],
  enabledTools = [],
  sessionProjectId = null,
) {
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
    lines.push('- User selected CF container sandbox — prefer agentsam_terminal_sandbox for command execution.');
  }
  if (sessionProjectId) {
    lines.push('', `Session project context: ${sessionProjectId}`);
  }
  if (enabledConnectors.length) {
    lines.push('', `Session-enabled connectors: ${enabledConnectors.join(', ')}`);
    lines.push('Only use tools from connectors the user enabled for this chat unless they ask otherwise.');
  } else {
    lines.push('', 'No optional connectors enabled — do not assume GitHub, Drive, Cloudflare, or Mac local access.');
  }
  if (enabledTools.length) {
    lines.push('', `Session-enabled tools (${enabledTools.length}): ${enabledTools.slice(0, 24).join(', ')}${enabledTools.length > 24 ? '…' : ''}`);
  }
  return lines.join('\n');
}
