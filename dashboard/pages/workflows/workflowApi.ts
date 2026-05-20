import type { WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode, WorkflowListItem } from './workflowTypes';
import { apiNodeTypeToUi } from './workflowTypes';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchWorkflowList(): Promise<WorkflowListItem[]> {
  const data = await apiJson<WorkflowListItem[] | { workflows?: WorkflowListItem[] }>(
    '/api/agentsam/workflows',
  );
  if (Array.isArray(data)) return data;
  return Array.isArray(data.workflows) ? data.workflows : [];
}

type GraphPayload = {
  workflow: Record<string, unknown>;
  dag_workflow_id?: string;
  nodes?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  canvas_layout?: Record<string, { x?: number; y?: number }>;
};

export function mapGraphPayload(payload: GraphPayload): WorkflowGraph {
  const w = payload.workflow;
  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload.edges) ? payload.edges : [];
  const layout = payload.canvas_layout && typeof payload.canvas_layout === 'object' ? payload.canvas_layout : {};

  const nodes: WorkflowGraphNode[] = rawNodes.map((n, i) => {
    const nodeKey = String(n.node_key ?? n.id ?? `node_${i + 1}`);
    const row = Math.floor(i / 3);
    const col = i % 3;
    const saved = layout[nodeKey];
    return {
      id: nodeKey,
      node_key: nodeKey,
      node_type: String(n.node_type ?? 'agent'),
      title: String(n.title ?? n.display_name ?? nodeKey),
      description: n.description != null ? String(n.description) : null,
      handler_key: n.handler_key != null ? String(n.handler_key) : null,
      sort_order: Number(n.sort_order ?? i * 10),
      x: Number(saved?.x ?? 60 + col * 240),
      y: Number(saved?.y ?? 80 + row * 130),
    };
  });

  const edges: WorkflowGraphEdge[] = rawEdges
    .map((e, i) => ({
      id: String(e.id ?? `edge_${i + 1}`),
      from: String(e.from_node_key ?? e.from ?? ''),
      to: String(e.to_node_key ?? e.to ?? ''),
      label: e.label != null ? String(e.label) : null,
    }))
    .filter((e) => e.from && e.to);

  const executionOrder = rawNodes
    .slice()
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
    .map((n) => String(n.node_key ?? ''));

  return {
    registryId: String(w.id ?? ''),
    workflowKey: String(w.workflow_key ?? ''),
    displayName: String(w.display_name ?? w.workflow_key ?? w.id ?? 'Workflow'),
    description: w.description != null ? String(w.description) : undefined,
    dagWorkflowId: String(payload.dag_workflow_id ?? w.id ?? ''),
    nodes,
    edges,
    executionOrder: executionOrder.filter(Boolean),
  };
}

export async function fetchWorkflowGraph(registryId: string): Promise<WorkflowGraph> {
  const data = await apiJson<GraphPayload>(
    `/api/agentsam/workflows/${encodeURIComponent(registryId)}`,
  );
  return mapGraphPayload(data);
}

export async function saveCanvasLayout(
  registryId: string,
  positions: Record<string, { x: number; y: number }>,
): Promise<void> {
  await apiJson(`/api/agentsam/workflows/${encodeURIComponent(registryId)}/layout`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positions }),
  });
}

export async function createNode(
  registryId: string,
  body: {
    node_key: string;
    title?: string;
    node_type: string;
    handler_key?: string;
    description?: string;
  },
): Promise<void> {
  await apiJson(`/api/agentsam/workflows/${encodeURIComponent(registryId)}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateNode(
  registryId: string,
  nodeKey: string,
  body: Record<string, unknown>,
): Promise<void> {
  await apiJson(
    `/api/agentsam/workflows/${encodeURIComponent(registryId)}/nodes/${encodeURIComponent(nodeKey)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

export async function deleteNode(registryId: string, nodeKey: string): Promise<void> {
  await apiJson(
    `/api/agentsam/workflows/${encodeURIComponent(registryId)}/nodes/${encodeURIComponent(nodeKey)}`,
    { method: 'DELETE' },
  );
}

export async function createEdge(
  registryId: string,
  from: string,
  to: string,
): Promise<void> {
  await apiJson(`/api/agentsam/workflows/${encodeURIComponent(registryId)}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_node_key: from, to_node_key: to }),
  });
}

export async function deleteEdge(registryId: string, edgeId: string): Promise<void> {
  await apiJson(
    `/api/agentsam/workflows/${encodeURIComponent(registryId)}/edges/${encodeURIComponent(edgeId)}`,
    { method: 'DELETE' },
  );
}

export async function patchWorkflow(
  registryId: string,
  body: { display_name?: string; description?: string },
): Promise<void> {
  await apiJson(`/api/agentsam/workflows/${encodeURIComponent(registryId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export { apiNodeTypeToUi };
