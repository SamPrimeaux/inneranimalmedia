/**
 * Mode tool policy — enforced in loadToolsForRequest + validateToolCall.
 * D1 agent_mode_configs was dropped (417); policy is mode defaults + route profile merge.
 *
 * Ask mode contract: read-only evidence tools allowed when the route/compiler selects them;
 * mutation and execution tools denied (terminal, writes, deploy, python_execute, etc.).
 */
import {
  ASK_MUTATION_DENY_TOOL_NAMES,
  explicitMemorySaveIntent,
  isMemoryWriteTool,
  isMutationOrExecutionTool,
} from './agent-tool-planes.js';

/** Mirrors agentsam-route-tool-resolver DEFAULT_ROUTE_TOOL blocked_capabilities by mode. */
const MODE_BLOCKED_CAPABILITIES = {
  ask: [
    'terminal_execute',
    'terminal_run',
    'worker_deploy',
    'd1_write',
    'python_execute',
    'memory.write',
  ],
  plan: ['terminal_execute', 'terminal_run'],
  debug: [],
  agent: [],
  multitask: [],
};

/** @typedef {{ allowTools: string[], denyTools: string[], requireApprovalTools: string[] }} ModeToolPolicy */

const TERMINAL_TOOLS = ['terminal_run', 'terminal_execute', 'run_command', 'bash', 'pty', 'pty_run'];
const DEPLOY_TOOLS = ['worker_deploy', 'deploy'];
/** Browser automation — not read-only inspect/snapshot tools. */
const BROWSER_AUTOMATION_TOOLS = ['browser_navigate', 'playwright_screenshot'];

/** Capability keys blocked → tool names (minimal map). */
const CAPABILITY_BLOCK_TOOL_NAMES = {
  terminal_execute: TERMINAL_TOOLS,
  terminal_run: TERMINAL_TOOLS,
  worker_deploy: DEPLOY_TOOLS,
  d1_write: ['d1_write', 'd1_batch_write', 'supabase_write', 'd1_migrate', 'wrangler_d1_migrate'],
  python_execute: ['python_execute'],
  'memory.write': ['agentsam_memory_write', 'agentsam_memory_save', 'agent_memory_write'],
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
      policy.denyTools = [...ASK_MUTATION_DENY_TOOL_NAMES];
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

  return {
    allowTools: policy.allowTools,
    denyTools: [...denied],
    requireApprovalTools: policy.requireApprovalTools,
  };
}

const FILE_MUTATION_TOOLS = ['fs_write_file', 'fs_edit_file', 'github_create_file', 'github_update_file'];

/**
 * Secondary gate from RuntimeProfile.write_policy (Ask/Plan read-only contract).
 * @param {{ can_edit_files?: boolean, can_terminal?: boolean, can_d1_write?: boolean, can_deploy?: boolean, can_browser_automation?: boolean, can_memory_write?: boolean }|null|undefined} writePolicy
 * @param {string} toolName
 * @param {{ userMessage?: string|null }} [opts]
 */
export function toolBlockedByWritePolicy(writePolicy, toolName, opts = {}) {
  if (!writePolicy || typeof writePolicy !== 'object') return false;
  const n = String(toolName || '').trim();
  if (!n) return false;
  if (isMemoryWriteTool(n)) {
    if (writePolicy.can_memory_write) return false;
    if (explicitMemorySaveIntent(opts.userMessage)) return false;
    return true;
  }
  if (!writePolicy.can_terminal && TERMINAL_TOOLS.includes(n)) return true;
  if (!writePolicy.can_deploy && DEPLOY_TOOLS.includes(n)) return true;
  if (!writePolicy.can_d1_write && ['d1_write', 'd1_batch_write', 'supabase_write', 'd1_migrate'].includes(n)) {
    return true;
  }
  if (!writePolicy.can_browser_automation && BROWSER_AUTOMATION_TOOLS.includes(n)) return true;
  if (!writePolicy.can_edit_files && FILE_MUTATION_TOOLS.includes(n)) return true;
  if (isMutationOrExecutionTool(n) && !writePolicy.can_edit_files && !writePolicy.can_terminal) {
    if (TERMINAL_TOOLS.includes(n) || DEPLOY_TOOLS.includes(n) || FILE_MUTATION_TOOLS.includes(n)) return true;
  }
  return false;
}
