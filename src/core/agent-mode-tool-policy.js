/**
 * Mode tool policy — enforced in loadToolsForRequest + validateToolCall.
 * D1 agent_mode_configs was dropped (417); policy is mode defaults + route profile merge.
 */
/** Mirrors agentsam-route-tool-resolver DEFAULT_ROUTE_TOOL blocked_capabilities by mode. */
const MODE_BLOCKED_CAPABILITIES = {
  ask: ['terminal_execute', 'terminal_run', 'd1_query', 'worker_deploy', 'python_execute'],
  plan: ['terminal_execute', 'terminal_run'],
  debug: [],
  agent: [],
  multitask: [],
};

/** @typedef {{ allowTools: string[], denyTools: string[], requireApprovalTools: string[] }} ModeToolPolicy */

const TERMINAL_TOOLS = ['terminal_run', 'terminal_execute', 'run_command', 'bash'];
const DEPLOY_TOOLS = ['worker_deploy', 'deploy'];
const BROWSER_TOOLS = ['browser_navigate', 'playwright_screenshot'];

/** Capability keys blocked → tool names (minimal map). */
const CAPABILITY_BLOCK_TOOL_NAMES = {
  terminal_execute: TERMINAL_TOOLS,
  terminal_run: TERMINAL_TOOLS,
  worker_deploy: DEPLOY_TOOLS,
};

/**
 * @param {string} modeSlug
 */
function basePolicyForMode(modeSlug) {
  const mode = String(modeSlug || 'agent').toLowerCase();
  /** @type {ModeToolPolicy} */
  const policy = { allowTools: [], denyTools: [], requireApprovalTools: [] };

  switch (mode) {
    case 'ask':
      policy.denyTools = [
        ...TERMINAL_TOOLS,
        ...DEPLOY_TOOLS,
        'fs_search_files',
        'd1_write',
        'd1_batch_write',
        'python_execute',
      ];
      break;
    case 'plan':
      policy.denyTools = [...TERMINAL_TOOLS, ...DEPLOY_TOOLS, 'python_execute'];
      break;
    case 'debug':
    case 'agent':
    case 'multitask':
      break;
    default:
      policy.denyTools = [...TERMINAL_TOOLS];
      break;
  }
  return policy;
}

/**
 * @param {string} modeSlug
 */
function blockedCapabilitiesForMode(modeSlug) {
  const mode = String(modeSlug || 'agent').toLowerCase();
  return MODE_BLOCKED_CAPABILITIES[mode] ?? MODE_BLOCKED_CAPABILITIES.agent;
}

/**
 * @param {string[]} blockedCapabilities
 */
function denyToolsFromBlockedCapabilities(blockedCapabilities) {
  const out = [];
  for (const cap of blockedCapabilities || []) {
    const key = String(cap || '').trim();
    const names = CAPABILITY_BLOCK_TOOL_NAMES[key];
    if (names) out.push(...names);
  }
  return out;
}

/**
 * @param {any} env
 * @param {string} modeSlug
 * @param {{ routeKey?: string|null, taskType?: string|null }} [opts]
 * @returns {Promise<ModeToolPolicy>}
 */
export async function loadModeToolPolicy(env, modeSlug, opts = {}) {
  const policy = basePolicyForMode(modeSlug);
  const denied = new Set(policy.denyTools.map((t) => String(t)));

  for (const t of denyToolsFromBlockedCapabilities(blockedCapabilitiesForMode(modeSlug))) {
    denied.add(t);
  }

  if (env?.DB && opts.routeKey) {
    try {
      const { resolveAgentChatRouteToolRequirements } = await import('./agentsam-route-tool-resolver.js');
      const req = await resolveAgentChatRouteToolRequirements(env, {
        routeKey: opts.routeKey,
        taskType: opts.taskType,
        modeSlug,
      });
      for (const t of denyToolsFromBlockedCapabilities(req?.blocked_capabilities)) {
        denied.add(t);
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  if (String(modeSlug).toLowerCase() === 'ask') {
    for (const t of BROWSER_TOOLS) denied.add(t);
  }

  return {
    allowTools: policy.allowTools,
    denyTools: [...denied],
    requireApprovalTools: policy.requireApprovalTools,
  };
}
