/**
 * Agent Sam composer mode contract — shared between dashboard types and Worker runtime.
 * Keep in sync with `dashboard/components/ChatAssistant/types.ts` AgentMode / AGENT_MODES.
 */

/** @typedef {'ask'|'plan'|'agent'|'debug'|'multitask'|'auto'} AgentMode */

export const AGENT_MODES = Object.freeze([
  { id: 'agent', label: 'Agent', description: 'Execute and open surfaces' },
  { id: 'plan', label: 'Plan', description: 'Design technical plans' },
  { id: 'debug', label: 'Debug', description: 'Inspect, prove, and fix' },
  { id: 'multitask', label: 'Multitask', description: 'Coordinate workflows' },
  { id: 'ask', label: 'Ask', description: 'Talk and answer questions' },
]);

/** Composer mode contract — color, tool profile, role (Cursor-inspired). */
export const AGENT_MODE_CONTRACT = Object.freeze({
  ask: {
    color: 'green',
    tool_profile: 'readonly_context',
    role: 'answer / understand / explore',
  },
  plan: {
    color: 'blue',
    tool_profile: 'plan_artifact',
    role: 'design / decompose',
  },
  agent: {
    color: 'purple',
    tool_profile: 'execution',
    role: 'execute / build',
  },
  debug: {
    color: 'orange',
    tool_profile: 'execution',
    role: 'inspect / prove / fix',
  },
  multitask: {
    color: 'cyan',
    // D1: agentsam_tool_profile_bindings.task_type=multitask → composer_multitask
    // Cursor-aligned: parent inherits Agent-level tools; RWS children further scope.
    tool_profile: 'composer_multitask',
    role: 'coordinate / fan-out',
  },
});

const RUNTIME_MODE_SET = new Set(['agent', 'plan', 'debug', 'multitask', 'ask', 'auto']);

/**
 * Composer runtime contract (lowercase): ask | plan | agent | debug | multitask | auto
 * @param {unknown} raw
 * @returns {AgentMode}
 */
export function normalizeAgentRuntimeMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (RUNTIME_MODE_SET.has(v)) return /** @type {AgentMode} */ (v);
  return 'agent';
}

/**
 * @param {unknown} raw
 * @returns {raw is Exclude<AgentMode, 'auto'>}
 */
export function isComposerAgentMode(raw) {
  const v = normalizeAgentRuntimeMode(raw);
  return v !== 'auto' && RUNTIME_MODE_SET.has(v);
}

/**
 * API shape for GET /api/agent/modes — keep dashboard-free; Worker is SSOT for mode list.
 */
export function listAgentModesForApi() {
  return [
    ...AGENT_MODES.map((m) => ({
      slug: m.id,
      label: m.label,
      description: m.description,
      color: AGENT_MODE_CONTRACT[m.id]?.color ?? null,
      icon: null,
      temperature: 0.7,
      auto_run: 0,
      max_tool_calls: 15,
    })),
    {
      slug: 'auto',
      label: 'Auto',
      description: 'Automatic routing',
      color: null,
      icon: null,
      temperature: 0.7,
      auto_run: 0,
      max_tool_calls: 15,
    },
  ];
}
