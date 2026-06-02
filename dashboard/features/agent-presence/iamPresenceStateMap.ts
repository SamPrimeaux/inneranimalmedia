// dashboard/features/agent-presence/iamPresenceStateMap.ts

export type AgentPresenceIcon =
  // legacy "surface" icons (still used for generic tool classification)
  | 'spark'
  | 'scan'
  | 'terminal'
  | 'diff'
  | 'pixel'
  | 'path'
  | 'files'
  | 'browser'
  // agent-work loading states lab (2026 remaster)
  | 'agent-spark'
  | 'subagent-swarm'
  | 'fanout-orbit'
  | 'delegate-chain'
  | 'work-queue'
  | 'tool-router'
  | 'review-gate'
  | 'merge-weave'
  | 'approval-wait'
  | 'done-bloom'
  | 'error-signal'
  | 'skeleton-plan';

export type AgentPresenceTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger';

export type AgentPresenceState =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'subagent_spawn'
  | 'delegate_subtask'
  | 'multitask_fanout'
  | 'parallel_work'
  | 'task_queue'
  | 'tool_routing'
  | 'merge_results'
  | 'summarizing_subagents'
  | 'approval_required'
  | 'loading_panel'
  | 'reading'
  | 'writing'
  | 'tool'
  | 'terminal'
  | 'browser'
  | 'database'
  | 'files'
  | 'drawing'
  | 'imaging'
  | 'waiting_approval'
  | 'complete'
  | 'failed';
