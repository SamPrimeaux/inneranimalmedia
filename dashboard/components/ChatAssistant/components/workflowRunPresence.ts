import type { AgentMode, AgentPresenceState } from '../../../features/mode-presence/agentModePresenceMap';
import type { WorkflowRunState } from './WorkflowRunBoard';

export type WorkflowRunPresenceView = {
  state: AgentPresenceState;
  title: string;
  description?: string;
  meta?: string;
  pill: string;
};

export function resolveWorkflowRunPresence(
  runState: WorkflowRunState,
  mode: AgentMode = 'multitask',
): WorkflowRunPresenceView | null {
  const { status, workflowKey, stepsTotal, stepsCompleted, currentNodeKey, errorMessage, runId } =
    runState;
  if (status === 'idle' || !runId) return null;

  const progress =
    stepsTotal > 0 ? `${stepsCompleted} / ${stepsTotal} steps` : `${stepsCompleted} steps`;

  if (status === 'awaiting_approval') {
    return {
      state: 'approval_required',
      title: 'Waiting for your approval',
      description: 'This workflow node is paused until you allow or deny.',
      meta: currentNodeKey ? `${workflowKey} · ${currentNodeKey}` : workflowKey ?? undefined,
      pill: 'approval',
    };
  }

  if (status === 'completed') {
    return {
      state: 'complete',
      title: 'Workflow complete',
      description: workflowKey ?? undefined,
      meta: progress,
      pill: 'done',
    };
  }

  if (status === 'failed' || status === 'error') {
    return {
      state: 'failed',
      title: 'Workflow needs attention',
      description: errorMessage?.slice(0, 160) || workflowKey || undefined,
      meta: progress,
      pill: 'error',
    };
  }

  const fanout =
    mode === 'multitask' || (stepsTotal != null && stepsTotal > 3);
  return {
    state: fanout ? 'multitask_fanout' : 'task_queue',
    title: fanout ? 'Running parallel workstreams' : 'Working through the task queue',
    description: workflowKey ?? undefined,
    meta: [progress, currentNodeKey].filter(Boolean).join(' · ') || runId.slice(0, 18),
    pill: fanout ? 'fanout' : 'queue',
  };
}
