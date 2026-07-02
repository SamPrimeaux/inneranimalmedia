/**
 * Mobile exec profile — parse client_surface / exec_lane from workspaceContext or envelope.
 *
 * Platform operators (Sam): iPhone dev = agentsam_terminal_remote (GCP iam-tunnel VM) — zero Mac dependency.
 * Tenant users: iPhone dev = agentsam_terminal_sandbox (MY_CONTAINER) + GitHub API tools.
 */

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
 * @param {unknown} wsCtx
 */
export function parsePlatformOperatorLane(wsCtx) {
  if (!wsCtx || typeof wsCtx !== 'object') return false;
  return /** @type {Record<string, unknown>} */ (wsCtx).platform_operator_lane === true;
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
 * Collapse exec_lane=auto on mobile into the lane tools should actually use.
 * @param {string|null|undefined} clientSurface
 * @param {'auto'|'remote'|'local'|'sandbox'|null|undefined} execLane
 * @param {boolean} [isPlatformOperator]
 * @returns {'auto'|'remote'|'local'|'sandbox'}
 */
export function resolveEffectiveExecLane(clientSurface, execLane, isPlatformOperator = false) {
  const lane = String(execLane || 'auto').trim().toLowerCase();
  if (!isMobileClientSurface(clientSurface)) {
    if (lane === 'auto' || lane === 'remote' || lane === 'local' || lane === 'sandbox') return lane;
    return 'auto';
  }
  if (lane === 'local' || lane === 'sandbox') return lane;
  if (lane === 'remote') return 'remote';
  return isPlatformOperator ? 'remote' : 'sandbox';
}

/**
 * Preferred terminal tool for this mobile turn.
 * @param {string|null|undefined} clientSurface
 * @param {'auto'|'remote'|'local'|'sandbox'|null|undefined} execLane
 * @param {boolean} [isPlatformOperator]
 * @returns {'agentsam_terminal_sandbox'|'agentsam_terminal_local'|'agentsam_terminal_remote'|null}
 */
export function resolveMobileTerminalToolHint(clientSurface, execLane, isPlatformOperator = false) {
  if (!isMobileClientSurface(clientSurface)) return null;
  const effective = resolveEffectiveExecLane(clientSurface, execLane, isPlatformOperator);
  if (effective === 'local') return 'agentsam_terminal_local';
  if (effective === 'remote') return 'agentsam_terminal_remote';
  return 'agentsam_terminal_sandbox';
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
 * @param {boolean} [isPlatformOperator]
 */
export function formatMobileExecProfilePromptBlock(
  clientSurface,
  execLane,
  enabledConnectors = [],
  enabledTools = [],
  sessionProjectId = null,
  isPlatformOperator = false,
) {
  if (!isMobileClientSurface(clientSurface)) return '';
  const lane = String(execLane || 'auto').trim().toLowerCase();
  const effectiveLane = resolveEffectiveExecLane(clientSurface, execLane, isPlatformOperator);
  const terminalHint = resolveMobileTerminalToolHint(clientSurface, execLane, isPlatformOperator);
  const lines = [
    '[Mobile client surface — Mac PTY optional only; never required for platform operators]',
    `client_surface: ${String(clientSurface).trim()}`,
    `exec_lane: ${lane}${effectiveLane !== lane ? ` (effective: ${effectiveLane})` : ''}`,
    isPlatformOperator ? 'platform_operator_lane: true' : '',
    '',
    'Routing law for this turn:',
    '- Prefer GitHub API tools and pinned context envelope content for file reads/writes.',
    '- Do NOT use agentsam_terminal_local on mobile unless exec_lane is explicitly local — phone has no local PTY.',
  ].filter(Boolean);

  if (isPlatformOperator) {
    lines.push(
      '- Platform operator on mobile: primary shell lane is agentsam_terminal_remote (GCP cloud desk at terminal.inneranimalmedia.com).',
      '- Clone path: /home/samprimeaux/inneranimalmedia — git, zsh, wrangler via CLOUDFLARE_API_TOKEN. Mac asleep is fine.',
      '- Use agentsam_terminal_sandbox only for heavy builds (vite-only, Playwright, GLB) — not routine git/shell.',
      '- Never block on Mac tunnel health for this user.',
    );
  } else {
    lines.push(
      '- Tenant user on mobile: use agentsam_terminal_sandbox (MY_CONTAINER) for npm/vite/wrangler/build/shell.',
      '- agentsam_terminal_remote is platform-operator only.',
    );
  }

  if (terminalHint) {
    lines.push(`- Preferred terminal tool this turn: ${terminalHint}.`);
  }
  if (lane === 'remote') {
    lines.push('- User selected Cloud desk — use agentsam_terminal_remote for all shell/git/wrangler work.');
  } else if (lane === 'sandbox') {
    lines.push('- User selected CF container sandbox — use agentsam_terminal_sandbox for command execution.');
  } else if (lane === 'local') {
    lines.push('- User selected Local Mac — try agentsam_terminal_local only if tunnel is healthy; otherwise fall back per operator policy.');
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
