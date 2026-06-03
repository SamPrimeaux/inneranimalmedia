import type { AgentMode } from '../../components/ChatAssistant/types';
import type { AgentPresenceState as ModePresenceState } from './agentModePresenceMap';

/** Map runtime / SSE / deriveAgentPresence states → mode-presence canonical state. */
export function normalizeChatPresenceState(
  state: string | null | undefined,
  mode?: AgentMode,
  opts?: { cardStatus?: 'thinking' | 'working' | 'blocked' | 'done' | 'error' },
): ModePresenceState {
  const raw = String(state || 'idle').trim().toLowerCase();
  const m = String(mode || 'agent').toLowerCase() as AgentMode;

  if (opts?.cardStatus === 'error' || raw === 'failed') return 'failed';
  if (opts?.cardStatus === 'done' || raw === 'complete') return 'complete';
  if (opts?.cardStatus === 'blocked' || raw === 'approval_required') return 'approval_required';
  if (
    raw === 'waiting_approval' ||
    raw === 'browser_human_input' ||
    opts?.cardStatus === 'blocked'
  ) {
    return 'approval_required';
  }

  if (raw === 'browser_live' || raw === 'browser_debug') return 'browser';
  if (raw === 'browser_capture') return 'browser';
  if (raw === 'web_search' || raw === 'web_fetch') return 'reading';
  if (raw === 'filing') return 'files';
  if (raw === 'database') return 'database';
  if (raw === 'imaging') return 'imaging';
  if (raw === 'drawing') return 'drawing';

  if (raw === 'executing') return 'executing';
  if (raw === 'verifying') return 'verifying';
  if (raw === 'tool') return 'tool_routing';

  if (m === 'plan') {
    if (raw === 'planning' || raw === 'thinking') return 'mapping';
    if (raw === 'task_queue' || raw === 'plan_progress') return 'task_stack';
    if (raw === 'handoff_ready') return 'handoff_ready';
    if (raw === 'mapping' || raw === 'task_stack' || raw === 'risk_scan') return raw as ModePresenceState;
  }

  if (m === 'ask') {
    if (raw === 'thinking' || raw === 'reading') return 'reading_context';
    if (raw === 'planning') return 'reading_context';
  }

  if (m === 'debug') {
    if (raw === 'thinking' || raw === 'planning') return 'trace_probe';
  }

  if (m === 'multitask') {
    if (raw === 'thinking' || raw === 'planning') return 'multitask_fanout';
  }

  if (raw === 'idle') return 'thinking';

  return raw as ModePresenceState;
}

/** True when icon should come from mode-scoped library (map-build, trace-probe, …). */
export function isModeScopedPresenceState(mode: AgentMode | undefined, state: ModePresenceState): boolean {
  const m = mode || 'agent';
  const modeScoped: Partial<Record<AgentMode, ModePresenceState[]>> = {
    agent: ['tool_routing', 'executing', 'writing', 'verifying', 'terminal', 'tool', 'database', 'reading'],
    ask: ['reading_context', 'tracing_sources', 'answering', 'clarifying', 'reading', 'thinking'],
    plan: ['mapping', 'task_stack', 'risk_scan', 'handoff_ready', 'planning'],
    debug: ['trace_probe', 'fault_isolate', 'hypothesis', 'regression_check', 'thinking', 'tool'],
    multitask: [
      'subagent_spawn',
      'delegate_subtask',
      'parallel_work',
      'multitask_fanout',
      'merge_results',
      'summarizing_subagents',
    ],
  };
  return (modeScoped[m] || []).includes(state);
}
