import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { WorkflowGraph, WorkflowGraphNode } from '../workflowTypes';
import { EXECUTOR_NODE_TYPES } from '../workflowTypes';
import {
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  patchWorkflow,
  updateNode,
} from '../lib/workflowApi';
import { WorkflowNodeIcon, nodeAccent } from '../WorkflowNodeIcon';
import { apiNodeTypeToUi } from '../workflowTypes';

type Props = {
  graph: WorkflowGraph | null;
  selectedNodeKey: string | null;
  connectFrom: string | null;
  onGraphChanged: () => void;
  onConnectFrom: (key: string | null) => void;
};

export function WorkflowConfigPanel({
  graph,
  selectedNodeKey,
  connectFrom,
  onGraphChanged,
  onConnectFrom,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newNodeKey, setNewNodeKey] = useState('');
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeType, setNewNodeType] = useState('agent');
  const [edgeTo, setEdgeTo] = useState('');

  const selected: WorkflowGraphNode | null =
    graph?.nodes.find((n) => n.node_key === selectedNodeKey) ?? null;

  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState('agent');
  const [editHandler, setEditHandler] = useState('');

  useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditType(selected.node_type);
    setEditHandler(selected.handler_key ?? '');
  }, [selected?.node_key]);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!graph) {
    return <div className="wf-empty">Select a workflow to configure steps.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="wf-card">
        <div style={{ fontSize: 10, color: 'var(--wf-muted)', fontFamily: 'var(--wf-font-mono)' }}>Registry</div>
        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{graph.displayName}</div>
        <div style={{ fontSize: 10, color: 'var(--wf-muted)', marginTop: 6, wordBreak: 'break-all' }}>
          registry: {graph.registryId}
          <br />
          dag: {graph.dagWorkflowId}
          {graph.mcpWorkflowId && (
            <>
              <br />
              mcp: {graph.mcpWorkflowId}
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {graph.riskLevel && <span className="wf-tag">{graph.riskLevel} risk</span>}
          {graph.requiresApproval && <span className="wf-tag">approval</span>}
          {graph.mcpGraphMode === 1 && <span className="wf-tag success">graph_mode</span>}
        </div>
      </div>

      {selected ? (
        <div className="wf-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <WorkflowNodeIcon type={apiNodeTypeToUi(selected.node_type)} size={18} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{selected.title}</div>
              <div style={{ fontSize: 10, color: 'var(--wf-muted)' }}>{selected.node_key}</div>
            </div>
          </div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--wf-muted)', marginBottom: 4 }}>Title</label>
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            style={{ width: '100%', marginBottom: 8, height: 30, borderRadius: 8, border: '1px solid var(--wf-border)', padding: '0 8px', fontSize: 12 }}
          />
          <label style={{ display: 'block', fontSize: 10, color: 'var(--wf-muted)', marginBottom: 4 }}>Node type</label>
          <select
            value={editType}
            onChange={(e) => setEditType(e.target.value)}
            style={{ width: '100%', marginBottom: 8, height: 30, borderRadius: 8, border: '1px solid var(--wf-border)', fontSize: 12 }}
          >
            {EXECUTOR_NODE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--wf-muted)', marginBottom: 4 }}>Handler key</label>
          <input
            value={editHandler}
            onChange={(e) => setEditHandler(e.target.value)}
            placeholder="optional handler_key"
            style={{ width: '100%', marginBottom: 8, height: 30, borderRadius: 8, border: '1px solid var(--wf-border)', padding: '0 8px', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="wf-btn primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await updateNode(graph.registryId, selected.node_key, {
                    title: editTitle,
                    node_type: editType,
                    handler_key: editHandler || null,
                  });
                  onGraphChanged();
                })
              }
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save step
            </button>
            <button
              type="button"
              className="wf-btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await deleteNode(graph.registryId, selected.node_key);
                  onGraphChanged();
                })
              }
            >
              <Trash2 size={12} />
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: nodeAccent(apiNodeTypeToUi(selected.node_type)) }}>
            Backend maps to agentsam_workflow_nodes on dag id {graph.dagWorkflowId}
          </div>
        </div>
      ) : (
        <div className="wf-empty">Select a node on the canvas to edit config, risk, and handler mapping.</div>
      )}

      <div className="wf-card">
        <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 8 }}>Add stage</div>
        <input
          placeholder="node_key"
          value={newNodeKey}
          onChange={(e) => setNewNodeKey(e.target.value)}
          style={{ width: '100%', height: 28, marginBottom: 6, borderRadius: 8, border: '1px solid var(--wf-border)', padding: '0 8px', fontSize: 11 }}
        />
        <input
          placeholder="title"
          value={newNodeTitle}
          onChange={(e) => setNewNodeTitle(e.target.value)}
          style={{ width: '100%', height: 28, marginBottom: 6, borderRadius: 8, border: '1px solid var(--wf-border)', padding: '0 8px', fontSize: 11 }}
        />
        <select
          value={newNodeType}
          onChange={(e) => setNewNodeType(e.target.value)}
          style={{ width: '100%', height: 28, marginBottom: 6, borderRadius: 8, border: '1px solid var(--wf-border)', fontSize: 11 }}
        >
          {EXECUTOR_NODE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="wf-btn primary"
          disabled={busy || !newNodeKey.trim()}
          onClick={() =>
            void run(async () => {
              await createNode(graph.registryId, {
                node_key: newNodeKey.trim(),
                title: newNodeTitle.trim() || newNodeKey.trim(),
                node_type: newNodeType,
              });
              setNewNodeKey('');
              setNewNodeTitle('');
              onGraphChanged();
            })
          }
        >
          <Plus size={12} /> Add node
        </button>
      </div>

      <div className="wf-card">
        <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 6 }}>Connect stages</div>
        <p style={{ fontSize: 10, color: 'var(--wf-muted)', margin: '0 0 8px' }}>
          Source: {connectFrom || 'double-click a node or use rail Connect'}
        </p>
        <select
          value={edgeTo}
          onChange={(e) => setEdgeTo(e.target.value)}
          style={{ width: '100%', height: 28, marginBottom: 6, borderRadius: 8, border: '1px solid var(--wf-border)', fontSize: 11 }}
        >
          <option value="">Target node…</option>
          {graph.nodes
            .filter((n) => n.node_key !== connectFrom)
            .map((n) => (
              <option key={n.node_key} value={n.node_key}>
                {n.title}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="wf-btn"
          disabled={!connectFrom || !edgeTo || busy}
          onClick={() =>
            void run(async () => {
              await createEdge(graph.registryId, connectFrom!, edgeTo);
              setEdgeTo('');
              onConnectFrom(null);
              onGraphChanged();
            })
          }
        >
          Create edge
        </button>
        {graph.edges.length > 0 && (
          <ul style={{ marginTop: 8, padding: 0, listStyle: 'none', fontSize: 10 }}>
            {graph.edges.map((e) => (
              <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span>
                  {e.from} → {e.to}
                </span>
                <button
                  type="button"
                  className="wf-btn icon"
                  style={{ width: 24, height: 24 }}
                  onClick={() =>
                    void run(async () => {
                      await deleteEdge(graph.registryId, e.id);
                      onGraphChanged();
                    })
                  }
                >
                  <Trash2 size={10} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p style={{ fontSize: 11, color: 'var(--wf-danger)' }}>{error}</p>}
    </div>
  );
}
