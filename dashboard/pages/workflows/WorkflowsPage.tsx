/**
 * Workflow Studio — /dashboard/workflows
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import './workflows.css';
import type { DrawerMode, InspectorTab, McpWorkflowListItem, WorkflowGraph, WorkflowListItem } from './workflowTypes';
import {
  fetchMcpWorkflowList,
  fetchWorkflowGraph,
  fetchWorkflowList,
  saveCanvasLayout,
  createNode,
} from './lib/workflowApi';
import { autoLayoutNodes } from './lib/workflowLayout';
import { WorkflowCanvas, type NodeStatus } from './components/WorkflowCanvas';
import { WorkflowRail } from './components/WorkflowRail';
import { WorkflowDrawer } from './components/WorkflowDrawer';
import { WorkflowInspector } from './components/WorkflowInspector';
import {
  useWorkflowRunner,
  type WorkflowRow,
} from '../../features/agent-chat/components/WorkflowRunBoard';

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
    setNodeStatuses((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === 'running') next[k] = 'completed';
      });
      next[nodeKey] = ok ? 'running' : 'failed';
      return next;
    });
    const inc = edges.filter((e) => e.to === nodeKey).map((e) => e.id);
    if (inc.length) {
      setActiveEdges((prev) => {
        const s = new Set(prev);
        inc.forEach((id) => s.add(id));
        return s;
      });
    }
    if (ok) {
      setTimeout(() => {
        setNodeStatuses((prev) => ({ ...prev, [nodeKey]: 'completed' }));
      }, 400);
    }
  }
  if (t === 'workflow_error') {
    const nodeKey = String(d.current_node_key ?? d.node_key ?? '');
    if (nodeKey) setNodeStatuses((prev) => ({ ...prev, [nodeKey]: 'failed' }));
  }
}

export const WorkflowsPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [mcpItems, setMcpItems] = useState<McpWorkflowListItem[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);

  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphVersion, setGraphVersion] = useState(0);

  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('config');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [connectMode, setConnectMode] = useState(false);
  const [traceMode, setTraceMode] = useState(false);

  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  const [graphEdges, setGraphEdges] = useState<WfEdgeLite[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const list = await fetchWorkflowList();
      setWorkflows(list);
      if (list.length && !selectedRegistryId) setSelectedRegistryId(list[0].id);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, [selectedRegistryId]);

  const loadMcp = useCallback(async () => {
    setMcpLoading(true);
    setMcpError(null);
    try {
      setMcpItems(await fetchMcpWorkflowList());
    } catch (e) {
      setMcpError(e instanceof Error ? e.message : String(e));
    } finally {
      setMcpLoading(false);
    }
  }, []);

  const loadGraph = useCallback(async (registryId: string) => {
    setGraphLoading(true);
    try {
      const g = await fetchWorkflowGraph(registryId);
      setGraph(g);
      setGraphEdges(g.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })));
    } catch (e) {
      setGraph(null);
      setGraphEdges([]);
      showToast(e instanceof Error ? e.message : 'Failed to load graph');
    } finally {
      setGraphLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadList();
    void loadMcp();
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
      const t = String(d.type ?? '');
      if (t === 'workflow_complete') showToast('Workflow completed');
      if (t === 'workflow_error') showToast(String(d.message ?? 'Workflow error'));
      if (t === 'workflow_approval_required') {
        showToast('Approval required — see Run tab');
        setInspectorTab('run');
      }
    },
  });

  const selectedWorkflowRow: WorkflowRow | null =
    workflows.find((w) => w.id === selectedRegistryId) ?? null;

  const isRunning = runState.status === 'running' || runState.status === 'awaiting_approval';

  const handleStart = useCallback(() => {
    if (!selectedWorkflowRow) {
      showToast('Select a workflow from the library first');
      return;
    }
    setNodeStatuses({});
    setActiveEdges(new Set());
    setInspectorTab('run');
    void startWorkflow(selectedWorkflowRow);
  }, [selectedWorkflowRow, startWorkflow, showToast]);

  const handleSavePositions = useCallback(
    async (positions: Record<string, { x: number; y: number }>) => {
      if (!selectedRegistryId) return;
      const out = await saveCanvasLayout(selectedRegistryId, positions);
      if (out.updated === 0 && !out.ok) {
        showToast('Layout save did not update any nodes');
      }
    },
    [selectedRegistryId, showToast],
  );

  const handleValidate = useCallback(() => {
    if (!graph) {
      showToast('No workflow loaded');
      return;
    }
    if (!graph.nodes.length) {
      showToast('Validation failed: no nodes');
      return;
    }
    const orphan = graph.nodes.filter(
      (n) => !graph.edges.some((e) => e.to === n.node_key || e.from === n.node_key),
    );
    if (graph.edges.length && orphan.length === graph.nodes.length) {
      showToast('Warning: nodes are not connected by edges');
      return;
    }
    showToast(`Valid: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  }, [graph, showToast]);

  const handleAutoLayout = useCallback(async () => {
    if (!graph || !selectedRegistryId) return;
    const pos = autoLayoutNodes(graph.nodes, graph.edges);
    await saveCanvasLayout(selectedRegistryId, pos);
    bumpGraph();
    showToast('Auto layout saved');
  }, [graph, selectedRegistryId, bumpGraph, showToast]);

  const handleAddBlock = useCallback(
    async (nodeType: string) => {
      if (!selectedRegistryId) {
        showToast('Select a workflow first');
        return;
      }
      const key = `step_${Date.now().toString(36).slice(-6)}`;
      try {
        await createNode(selectedRegistryId, {
          node_key: key,
          title: key.replace(/_/g, ' '),
          node_type: nodeType,
        });
        bumpGraph();
        showToast(`Added ${nodeType} stage`);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Add node failed');
      }
    },
    [selectedRegistryId, bumpGraph, showToast],
  );

  const handleSelectMcpKey = useCallback(
    (workflowKey: string) => {
      const reg = workflows.find((w) => w.workflow_key === workflowKey);
      if (reg) {
        setSelectedRegistryId(reg.id);
        showToast(`Loaded registry row for ${workflowKey}`);
      } else {
        showToast(`No agentsam_workflows row for key ${workflowKey}`);
      }
    },
    [workflows, showToast],
  );

  return (
    <div className={`wf-studio${inspectorOpen ? '' : ''}`}>
      <header className="wf-topbar">
        <div className="min-w-0 flex-1">
          <div className="wf-topbar-title">{graph?.displayName ?? 'Workflow Studio'}</div>
          {graph?.workflowKey && (
            <div className="wf-topbar-sub">{graph.workflowKey}</div>
          )}
        </div>
        <button
          type="button"
          className="wf-btn primary"
          onClick={() => setDrawerMode(drawerMode ? null : 'blocks')}
        >
          <Menu size={14} />
          Workflow actions
        </button>
      </header>

      <div className={`wf-main${inspectorOpen ? '' : ' inspector-collapsed'}`}>
        <div className="wf-workspace">
          <WorkflowRail
            drawerMode={drawerMode}
            connectMode={connectMode}
            traceMode={traceMode}
            inspectorOpen={inspectorOpen}
            onOpenDrawer={(mode) => {
              setDrawerMode(mode);
              if (mode === 'mcp') void loadMcp();
            }}
            onToggleConnect={() => {
              setConnectMode((v) => !v);
              showToast(connectMode ? 'Connect mode off' : 'Connect mode: pick source node, then target in inspector');
            }}
            onToggleTrace={() => {
              setTraceMode((v) => !v);
              showToast(traceMode ? 'Trace preview off' : 'Trace preview on canvas');
            }}
            onValidate={handleValidate}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
          />

          <WorkflowDrawer
            mode={drawerMode}
            onClose={() => setDrawerMode(null)}
            onToast={showToast}
            workflows={workflows}
            listLoading={listLoading}
            listError={listError}
            selectedRegistryId={selectedRegistryId}
            onSelectWorkflow={(id) => {
              setSelectedRegistryId(id);
              setSelectedNodeKey(null);
              setConnectFrom(null);
            }}
            onRefreshList={() => void loadList()}
            mcpItems={mcpItems}
            mcpLoading={mcpLoading}
            mcpError={mcpError}
            onRefreshMcp={() => void loadMcp()}
            onSelectMcpKey={handleSelectMcpKey}
            onAddBlock={(t) => void handleAddBlock(t)}
            onAutoLayout={() => void handleAutoLayout()}
            onRun={handleStart}
            canRun={!!selectedWorkflowRow}
            isRunning={isRunning}
          />

          <WorkflowCanvas
            graph={graph}
            graphLoading={graphLoading}
            selectedNodeKey={selectedNodeKey}
            onSelectNode={(key) => {
              setSelectedNodeKey(key);
              if (connectMode && key) {
                if (!connectFrom) setConnectFrom(key);
                else if (connectFrom !== key) {
                  setInspectorTab('config');
                  showToast(`Link ${connectFrom} → ${key} in Config tab`);
                }
              }
            }}
            connectFrom={connectFrom}
            onSavePositions={handleSavePositions}
            externalStatuses={nodeStatuses}
            externalActiveEdges={activeEdges}
            liveRunning={isRunning}
            traceMode={traceMode}
          />

          <div className={`wf-toast${toast ? ' show' : ''}`} role="status">
            {toast}
          </div>
        </div>

        {inspectorOpen && (
          <WorkflowInspector
            tab={inspectorTab}
            onTab={setInspectorTab}
            graph={graph}
            selectedNodeKey={selectedNodeKey}
            connectFrom={connectFrom}
            onGraphChanged={bumpGraph}
            onConnectFrom={setConnectFrom}
            runState={runState}
            onApprove={handleApproval}
            approvalBusy={approvalBusy}
            onStartRun={handleStart}
            canRun={!!selectedWorkflowRow}
            isRunning={isRunning}
          />
        )}
      </div>
    </div>
  );
};
