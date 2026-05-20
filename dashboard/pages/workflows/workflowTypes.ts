/** UI node categories (mapped to D1 node_type on save). */
export type WorkflowUiNodeType =
  | 'trigger'
  | 'agent'
  | 'mcp_tool'
  | 'terminal'
  | 'db_query'
  | 'approval_gate'
  | 'branch'
  | 'webhook'
  | 'eval'
  | 'output';

export type NodeStatus = 'idle' | 'running' | 'completed' | 'failed';

export type WorkflowListItem = {
  id: string;
  workflow_key: string;
  display_name: string;
  description?: string | null;
  risk_level?: string | null;
  requires_approval?: number | boolean;
  node_count?: number;
  edge_count?: number;
};

export type WorkflowGraphNode = {
  id: string;
  node_key: string;
  node_type: string;
  title: string;
  description?: string | null;
  handler_key?: string | null;
  sort_order?: number;
  x: number;
  y: number;
};

export type WorkflowGraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string | null;
};

export type WorkflowGraph = {
  registryId: string;
  workflowKey: string;
  displayName: string;
  description?: string;
  dagWorkflowId: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  executionOrder: string[];
};

export const EXECUTOR_NODE_TYPES: { value: string; label: string; ui: WorkflowUiNodeType }[] = [
  { value: 'agent', label: 'Agent (LLM)', ui: 'agent' },
  { value: 'mcp_tool', label: 'MCP tool', ui: 'mcp_tool' },
  { value: 'terminal', label: 'Terminal', ui: 'terminal' },
  { value: 'db_query', label: 'D1 query', ui: 'db_query' },
  { value: 'approval_gate', label: 'Approval gate', ui: 'approval_gate' },
  { value: 'branch', label: 'Branch', ui: 'branch' },
  { value: 'webhook', label: 'Webhook', ui: 'webhook' },
  { value: 'eval', label: 'Eval gate', ui: 'eval' },
];

export function apiNodeTypeToUi(nt: string): WorkflowUiNodeType {
  const t = String(nt || '').toLowerCase();
  if (t === 'agent') return 'agent';
  if (t === 'mcp_tool') return 'mcp_tool';
  if (t === 'terminal') return 'terminal';
  if (t === 'db_query') return 'db_query';
  if (t === 'approval_gate') return 'approval_gate';
  if (t === 'branch') return 'branch';
  if (t === 'webhook') return 'webhook';
  if (t === 'eval') return 'eval';
  if (t === 'trigger') return 'trigger';
  if (t === 'output') return 'output';
  return 'agent';
}
