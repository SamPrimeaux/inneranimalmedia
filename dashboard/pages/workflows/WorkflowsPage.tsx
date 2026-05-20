/**
 * D1 workflow surface — graph editor + live SSE runner.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Network } from 'lucide-react';
import { WorkflowCanvas, type NodeStatus } from './WorkflowCanvas';
import { WorkflowEditorPanel } from './WorkflowEditorPanel';
import {
  fetchWorkflowGraph,
  fetchWorkflowList,
  saveCanvasLayout,
} from './workflowApi';
import type { WorkflowGraph, WorkflowListItem } from './workflowTypes';
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
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);

  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  const [graphEdges, setGraphEdges] = useState<WfEdgeLite[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const list = await fetchWorkflowList();
      setWorkflows(list);
      if (list.length && !selectedRegistryId) {
        setSelectedRegistryId(list[0].id);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadGraph = useCallback(async (registryId: string) => {
    setGraphLoading(true);
    try {
      const g = await fetchWorkflowGraph(registryId);
      setGraph(g);
      setGraphEdges(
        g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
      );
    } catch {
      setGraph(null);
      setGraphEdges([]);
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (selectedRegistryId) void loadGraph(selectedRegistryId);
  }, [selectedRegistryId, graphVersion, loadGraph]);

  const bumpGraph = useCallback(() => {
    setGraphVersion((v) => v + 1);
    void loadList();
  }, [loadList]);

  const { runState, approvalBusy, startWorkflow, handleApproval } = useWorkflowRunner({
    onSseChunk: (d) => {
      applyWorkflowSseToCanvas(d, graphEdges, setNodeStatuses, setActiveEdges);
    },
  });

  const handleStart = useCallback(
    (workflow: WorkflowRow) => {
      setSelectedRegistryId(workflow.id);
      setNodeStatuses({});
      setActiveEdges(new Set());
      setSelectedNodeKey(null);
      void startWorkflow(workflow);
    },
    [startWorkflow],
  );

  const handleSavePositions = useCallback(
    async (positions: Record<string, { x: number; y: number }>) => {
      if (!selectedRegistryId) return;
      await saveCanvasLayout(selectedRegistryId, positions);
    },
    [selectedRegistryId],
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--dashboard-canvas)] text-[var(--dashboard-text)]">
      <header className="shrink-0 border-b border-[var(--dashboard-border)] px-4 py-3 flex items-center gap-3 bg-[var(--dashboard-panel)]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] text-[var(--solar-cyan)]">
          <Network size={18} strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold text-[var(--text-heading)] tracking-tight">
            Workflows
          </h1>
          <p className="text-[11px] text-[var(--dashboard-muted)] mt-0.5">
            Edit D1 graph nodes and edges, save layout, and run live with SSE tracing.
          </p>
        </div>
        {graph?.dagWorkflowId && (
          <div className="hidden sm:block text-[10px] font-mono text-[var(--dashboard-muted)]">
            dag: <span className="text-[var(--solar-cyan)]">{graph.dagWorkflowId}</span>
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 flex flex-row">
        <div className="flex-1 min-w-0 min-h-0">
          <WorkflowCanvas
            workflows={workflows}
            listLoading={listLoading}
            listError={listError}
            onRefreshList={() => void loadList()}
            graph={graph}
            graphLoading={graphLoading}
            selectedRegistryId={selectedRegistryId}
            onSelectWorkflow={(id) => {
              setSelectedRegistryId(id);
              setSelectedNodeKey(null);
              setConnectFrom(null);
            }}
            selectedNodeKey={selectedNodeKey}
            onSelectNode={setSelectedNodeKey}
            connectFrom={connectFrom}
            onConnectFrom={setConnectFrom}
            onSavePositions={handleSavePositions}
            externalStatuses={nodeStatuses}
            externalActiveEdges={activeEdges}
            liveRunning={runState.status === 'running' || runState.status === 'awaiting_approval'}
          />
        </div>

        <aside className="w-[min(100%,24rem)] shrink-0 border-l border-[var(--dashboard-border)] flex flex-col min-h-0 bg-[var(--dashboard-panel)] overflow-hidden">
          <section className="shrink-0 border-b border-[var(--dashboard-border)] overflow-y-auto max-h-[38%]">
            <WorkflowPicker
              onStartWorkflow={handleStart}
              isRunning={runState.status === 'running' || runState.status === 'awaiting_approval'}
            />
          </section>

          <section className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <WorkflowEditorPanel
              graph={graph}
              selectedNodeKey={selectedNodeKey}
              onSelectNode={setSelectedNodeKey}
              onGraphChanged={bumpGraph}
              connectFrom={connectFrom}
              onConnectFrom={setConnectFrom}
            />
          </section>

          {runState.status !== 'idle' && (
            <section className="flex-1 min-h-0 overflow-y-auto p-3 border-t border-[var(--dashboard-border)]">
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
