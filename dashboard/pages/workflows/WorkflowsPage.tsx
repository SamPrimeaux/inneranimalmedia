/**
 * D1 workflow surface — graph canvas + live SSE runner.
 */
import React, { useCallback, useState } from 'react';
import { Network } from 'lucide-react';
import { WorkflowCanvas, type WorkflowCanvasProps } from './WorkflowCanvas';
import type { NodeStatus } from './WorkflowCanvas';
import {
  WorkflowPicker,
  WorkflowRunCard,
  useWorkflowRunner,
} from '../../features/agent-chat/components/WorkflowRunBoard';
import type { WorkflowRow } from '../../features/agent-chat/components/WorkflowRunBoard';

type WfEdgeLite = { id: string; from: string; to: string };

function applyWorkflowSseToCanvas(
  d: Record<string, unknown>,
  edges: WfEdgeLite[],
  setNodeStatuses: React.Dispatch<React.SetStateAction<Record<string, NodeStatus>>>,
  setActiveEdges: React.Dispatch<React.SetStateAction<Set<string>>>,
) {
  const t = String(d.type ?? '');
  if (t === 'workflow_start') {
    setNodeStatuses({});
    setActiveEdges(new Set());
    return;
  }
  if (t === 'workflow_step') {
    const nodeKey = String(d.current_node_key ?? d.node_key ?? '');
    const ok = d.ok !== false;
    if (!nodeKey) return;
    const inc = edges.filter((e) => e.to === nodeKey).map((e) => e.id);
    if (inc.length) {
      setActiveEdges((prev) => {
        const s = new Set(prev);
        inc.forEach((id) => s.add(id));
        return s;
      });
    }
    setNodeStatuses((prev) => ({
      ...prev,
      [nodeKey]: ok ? 'completed' : 'failed',
    }));
  }
  if (t === 'workflow_error') {
    const nodeKey = String(d.current_node_key ?? d.node_key ?? '');
    if (nodeKey) {
      setNodeStatuses((prev) => ({ ...prev, [nodeKey]: 'failed' }));
    }
  }
}

export const WorkflowsPage: React.FC = () => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [graphEdges, setGraphEdges] = useState<WfEdgeLite[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());

  const { runState, approvalBusy, startWorkflow, handleApproval } = useWorkflowRunner({
    onSseChunk: (d) => {
      applyWorkflowSseToCanvas(d, graphEdges, setNodeStatuses, setActiveEdges);
    },
  });

  const loadGraphEdges = useCallback(async (workflowId: string) => {
    try {
      const res = await fetch(`/api/agentsam/workflows/${encodeURIComponent(workflowId)}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = await res.json();
      const raw = Array.isArray(data?.edges) ? data.edges : [];
      setGraphEdges(
        raw.map((e: Record<string, unknown>, i: number) => ({
          id: String(e.id ?? e.edge_key ?? `e${i + 1}`),
          from: String(e.from_node_key ?? e.from ?? ''),
          to: String(e.to_node_key ?? e.to ?? ''),
        })).filter((e: WfEdgeLite) => e.from && e.to),
      );
    } catch {
      setGraphEdges([]);
    }
  }, []);

  const handleStart = useCallback(
    (workflow: WorkflowRow) => {
      setSelectedWorkflowId(workflow.id);
      setNodeStatuses({});
      setActiveEdges(new Set());
      void loadGraphEdges(workflow.id);
      void startWorkflow(workflow);
    },
    [loadGraphEdges, startWorkflow],
  );

  const canvasProps: WorkflowCanvasProps = {
    externalStatuses: nodeStatuses,
    externalActiveEdges: activeEdges,
    selectedWorkflowId,
    onWorkflowIdChange: (id) => {
      setSelectedWorkflowId(id);
      void loadGraphEdges(id);
    },
    liveRunning: runState.status === 'running' || runState.status === 'awaiting_approval',
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--dashboard-canvas)] text-[var(--dashboard-text)]">
      <header className="shrink-0 border-b border-[var(--dashboard-border)] px-4 py-3 flex items-center gap-3 bg-[var(--dashboard-panel)]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] text-[var(--solar-cyan)]">
          <Network size={18} strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold text-[var(--text-heading)] tracking-tight">Workflows</h1>
          <p className="text-[11px] text-[var(--dashboard-muted)] mt-0.5">
            Drag nodes on the graph, run live from D1, and trace steps on the canvas.
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-row">
        <div className="flex-1 min-w-0 min-h-0">
          <WorkflowCanvas {...canvasProps} />
        </div>

        <aside className="w-[min(100%,22rem)] shrink-0 border-l border-[var(--dashboard-border)] flex flex-col min-h-0 bg-[var(--dashboard-panel)] overflow-hidden">
          <section className="shrink-0 border-b border-[var(--dashboard-border)] overflow-hidden">
            <WorkflowPicker
              onStartWorkflow={handleStart}
              isRunning={runState.status === 'running' || runState.status === 'awaiting_approval'}
            />
          </section>

          {runState.status !== 'idle' && (
            <section className="flex-1 min-h-0 overflow-y-auto p-3">
              <WorkflowRunCard
                runState={runState}
                onApprove={handleApproval}
                approvalBusy={approvalBusy}
              />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
