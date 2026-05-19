// dashboard/features/agent-presence/iamPresenceStateMap.ts

export type AgentPresenceIcon =
  | 'spark'
  | 'scan'
  | 'terminal'
  | 'diff'
  | 'pixel'
  | 'path'
  | 'files'
  | 'browser';

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
