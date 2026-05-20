import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Loader2,
  RefreshCw,
  GitBranch,
  CheckCircle2,
  XCircle,
  Circle,
} from 'lucide-react';
import type { WorkflowGraph, WorkflowListItem, NodeStatus } from './workflowTypes';
import { apiNodeTypeToUi } from './workflowTypes';
import { WorkflowNodeIcon, nodeAccent } from './WorkflowNodeIcon';

const NW = 176;
const NH = 68;
const STEP_MS = 700;

export type WorkflowCanvasProps = {
  workflows: WorkflowListItem[];
  listLoading: boolean;
  listError: string | null;
  onRefreshList: () => void;
  graph: WorkflowGraph | null;
  graphLoading: boolean;
  selectedRegistryId: string | null;
  onSelectWorkflow: (id: string) => void;
  selectedNodeKey: string | null;
  onSelectNode: (key: string | null) => void;
  connectFrom: string | null;
  onConnectFrom: (key: string | null) => void;
  onPositionsSaved?: () => void;
  onSavePositions: (positions: Record<string, { x: number; y: number }>) => Promise<void>;
  externalStatuses?: Record<string, NodeStatus>;
  externalActiveEdges?: Set<string>;
  liveRunning?: boolean;
};

type NodePos = { x: number; y: number };
type Drag =
  | { kind: 'node'; id: string; ox: number; oy: number }
  | { kind: 'pan'; sx: number; sy: number };

function edgePath(src: NodePos, tgt: NodePos): string {
  const sx = src.x + NW;
  const sy = src.y + NH / 2;
  const tx = tgt.x;
  const ty = tgt.y + NH / 2;
  const cx = (sx + tx) / 2;
  return `M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`;
}

function statusLabel(status: NodeStatus): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

function StatusGlyph({ status }: { status: NodeStatus }) {
  if (status === 'running') return <Loader2 size={10} className="animate-spin" />;
  if (status === 'completed') return <CheckCircle2 size={10} />;
  if (status === 'failed') return <XCircle size={10} />;
  return <Circle size={8} />;
}

export function WorkflowCanvas({
  workflows,
  listLoading,
  listError,
  onRefreshList,
  graph,
  graphLoading,
  selectedRegistryId,
  onSelectWorkflow,
  selectedNodeKey,
  onSelectNode,
  connectFrom,
  onConnectFrom,
  onSavePositions,
  externalStatuses,
  externalActiveEdges,
  liveRunning = false,
}: WorkflowCanvasProps) {
  const [nodePos, setNodePos] = useState<Record<string, NodePos>>({});
  const [localStatuses, setLocalStatuses] = useState<Record<string, NodeStatus>>({});
  const [localActiveEdges, setLocalActiveEdges] = useState<Set<string>>(new Set());
  const [previewRunning, setPreviewRunning] = useState(false);
  const [pan, setPan] = useState({ x: 48, y: 48 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const simGen = useRef(0);
  const layoutDirty = useRef(false);

  const displayStatuses = externalStatuses ?? localStatuses;
  const displayActiveEdges = externalActiveEdges ?? localActiveEdges;
  const running = liveRunning || previewRunning;

  useEffect(() => {
    if (!graph) {
      setNodePos({});
      return;
    }
    const pos: Record<string, NodePos> = {};
    graph.nodes.forEach((n) => {
      pos[n.node_key] = { x: n.x, y: n.y };
    });
    setNodePos(pos);
    layoutDirty.current = false;
  }, [graph?.registryId, graph?.nodes.length]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(2.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = canvasRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: (cx - r.left) / zoom - pan.x, y: (cy - r.top) / zoom - pan.y };
    },
    [zoom, pan],
  );

  const persistLayout = useCallback(async () => {
    if (!graph || !layoutDirty.current) return;
    setSaveBusy(true);
    try {
      const positions: Record<string, { x: number; y: number }> = {};
      graph.nodes.forEach((n) => {
        const p = nodePos[n.node_key];
        if (p) positions[n.node_key] = { x: Math.round(p.x), y: Math.round(p.y) };
      });
      await onSavePositions(positions);
      layoutDirty.current = false;
    } finally {
      setSaveBusy(false);
    }
  }, [graph, nodePos, onSavePositions]);

  const onNodeDown = useCallback(
    (e: React.MouseEvent, nid: string) => {
      e.stopPropagation();
      onSelectNode(nid);
      const w = toWorld(e.clientX, e.clientY);
      const p = nodePos[nid] ?? { x: 0, y: 0 };
      setDrag({ kind: 'node', id: nid, ox: w.x - p.x, oy: w.y - p.y });
    },
    [toWorld, nodePos, onSelectNode],
  );

  const onCanvasDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current || (e.target as HTMLElement).dataset?.canvasBg === '1') {
        onSelectNode(null);
      }
      setDrag({ kind: 'pan', sx: e.clientX - pan.x, sy: e.clientY - pan.y });
    },
    [pan, onSelectNode],
  );

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drag) return;
      if (drag.kind === 'node') {
        const w = toWorld(e.clientX, e.clientY);
        layoutDirty.current = true;
        setNodePos((p) => ({
          ...p,
          [drag.id]: { x: w.x - drag.ox, y: w.y - drag.oy },
        }));
      } else {
        setPan({ x: e.clientX - drag.sx, y: e.clientY - drag.sy });
      }
    },
    [drag, toWorld],
  );

  const onUp = useCallback(() => {
    if (drag?.kind === 'node') void persistLayout();
    setDrag(null);
  }, [drag, persistLayout]);

  const runPreview = useCallback(async () => {
    if (!graph?.nodes.length || running) return;
    const order = graph.executionOrder.length
      ? graph.executionOrder
      : graph.nodes.map((n) => n.node_key);
    const gen = ++simGen.current;
    setPreviewRunning(true);
    setLocalStatuses({});
    setLocalActiveEdges(new Set());

    for (const nid of order) {
      if (simGen.current !== gen) return;
      setLocalStatuses((p) => ({ ...p, [nid]: 'running' }));
      const inc = graph.edges.filter((e) => e.to === nid).map((e) => e.id);
      setLocalActiveEdges((p) => {
        const s = new Set(p);
        inc.forEach((id) => s.add(id));
        return s;
      });
      await new Promise<void>((r) => setTimeout(r, STEP_MS));
      if (simGen.current !== gen) return;
      setLocalStatuses((p) => ({ ...p, [nid]: 'completed' }));
    }
    setPreviewRunning(false);
  }, [graph, running]);

  const gs = 24 * zoom;

  return (
    <div className="flex h-full min-h-0 bg-[var(--dashboard-canvas)] text-[var(--dashboard-text)]">
      <aside className="w-[260px] shrink-0 flex flex-col border-r border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]">
        <div className="px-4 py-3 border-b border-[var(--dashboard-border)] flex items-center justify-between gap-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--dashboard-muted)]">
              Registry
            </div>
            <div className="text-[12px] font-semibold text-[var(--text-heading)]">agentsam_workflows</div>
          </div>
          <button
            type="button"
            onClick={onRefreshList}
            className="p-1.5 rounded-lg border border-[var(--dashboard-border)] hover:border-[var(--solar-cyan)]/40 text-[var(--dashboard-muted)]"
            title="Refresh list"
          >
            <RefreshCw size={14} className={listLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listError && (
            <p className="px-3 py-2 text-[11px] text-red-400">{listError}</p>
          )}
          {listLoading && !workflows.length ? (
            <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-[var(--dashboard-muted)]">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            workflows.map((wf) => (
              <button
                key={wf.id}
                type="button"
                onClick={() => onSelectWorkflow(wf.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--dashboard-border)] transition-colors ${
                  selectedRegistryId === wf.id
                    ? 'bg-[var(--scene-bg)] border-l-2 border-l-[var(--solar-cyan)]'
                    : 'border-l-2 border-l-transparent hover:bg-[var(--scene-bg)]/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GitBranch size={14} className="shrink-0 text-[var(--solar-cyan)]" />
                  <span className="text-[12px] font-medium truncate">
                    {wf.display_name || wf.workflow_key}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--dashboard-muted)] mt-1 pl-5">
                  {wf.node_count ?? 0} nodes · {wf.edge_count ?? 0} edges
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]">
          <span className="flex-1 text-[12px] text-[var(--dashboard-muted)] truncate">
            {graph?.displayName ?? 'Select a workflow'}
          </span>
          {saveBusy && (
            <span className="text-[10px] text-[var(--solar-cyan)] flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Saving layout
            </span>
          )}
          <span className="text-[10px] text-[var(--dashboard-muted)] tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="p-1.5 rounded border border-[var(--dashboard-border)] text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]"
            onClick={() => setZoom((z) => Math.min(2.5, z * 1.15))}
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="p-1.5 rounded border border-[var(--dashboard-border)] text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]"
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.15))}
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="p-1.5 rounded border border-[var(--dashboard-border)] text-[var(--dashboard-muted)]"
            onClick={() => {
              setPan({ x: 48, y: 48 });
              setZoom(1);
            }}
            title="Reset view"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            disabled={running || graphLoading || !graph?.nodes.length}
            onClick={() => void runPreview()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[var(--dashboard-border)] text-[11px] font-medium disabled:opacity-40 hover:border-[var(--solar-cyan)]/50"
          >
            {previewRunning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            Preview steps
          </button>
        </div>

        <div
          ref={canvasRef}
          data-canvas-bg="1"
          onMouseDown={onCanvasDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-[var(--dashboard-canvas)]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, var(--dashboard-border) 1px, transparent 0)`,
            backgroundSize: `${gs}px ${gs}px`,
            backgroundPosition: `${pan.x % gs}px ${pan.y % gs}px`,
          }}
        >
          {graphLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--dashboard-canvas)]/80">
              <Loader2 size={24} className="animate-spin text-[var(--solar-cyan)]" />
            </div>
          )}

          {!graphLoading && graph && !graph.nodes.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--dashboard-muted)]">
              <GitBranch size={32} strokeWidth={1.25} className="opacity-40" />
              <p className="text-[13px]">No nodes in this workflow</p>
              <p className="text-[11px] max-w-xs text-center opacity-80">
                Use the editor panel to add nodes, then link them with edges.
              </p>
            </div>
          )}

          {!graphLoading && graph && graph.nodes.length > 0 && (
            <div
              className="absolute origin-top-left"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: 3200,
                height: 2200,
              }}
            >
              <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                <defs>
                  <marker id="wf-arr" markerWidth="7" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 Z" fill="var(--dashboard-border)" />
                  </marker>
                  <marker id="wf-arr-active" markerWidth="7" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 Z" fill="var(--solar-cyan)" />
                  </marker>
                </defs>
                {graph.edges.map((edge) => {
                  const src = nodePos[edge.from];
                  const tgt = nodePos[edge.to];
                  if (!src || !tgt) return null;
                  const d = edgePath(src, tgt);
                  const on = displayActiveEdges.has(edge.id);
                  return (
                    <g key={edge.id}>
                      <path
                        d={d}
                        fill="none"
                        stroke={on ? 'var(--solar-cyan)' : 'var(--dashboard-border)'}
                        strokeWidth={on ? 2 : 1.5}
                        markerEnd={on ? 'url(#wf-arr-active)' : 'url(#wf-arr)'}
                      />
                      {on && (
                        <path
                          d={d}
                          fill="none"
                          stroke="var(--solar-cyan)"
                          strokeWidth={2}
                          strokeDasharray="8 6"
                          className="animate-pulse"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>

              {graph.nodes.map((node) => {
                const pos = nodePos[node.node_key] ?? { x: node.x, y: node.y };
                const uiType = apiNodeTypeToUi(node.node_type);
                const accent = nodeAccent(uiType);
                const status = displayStatuses[node.node_key] ?? 'idle';
                const isSelected = selectedNodeKey === node.node_key;
                const isLinkSource = connectFrom === node.node_key;
                const borderColor =
                  status === 'running'
                    ? accent
                    : status === 'completed'
                      ? '#10b981'
                      : status === 'failed'
                        ? '#ef4444'
                        : isSelected || isLinkSource
                          ? 'var(--solar-cyan)'
                          : 'var(--dashboard-border)';

                return (
                  <div
                    key={node.node_key}
                    role="button"
                    tabIndex={0}
                    onMouseDown={(e) => onNodeDown(e, node.node_key)}
                    onDoubleClick={() => {
                      if (connectFrom && connectFrom !== node.node_key) return;
                      onConnectFrom(connectFrom ? null : node.node_key);
                    }}
                    className="absolute flex items-center gap-2 px-3 rounded-lg border bg-[var(--dashboard-panel)] select-none cursor-grab active:cursor-grabbing shadow-sm transition-shadow"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: NW,
                      height: NH,
                      borderColor,
                      boxShadow: isSelected ? `0 0 0 2px color-mix(in srgb, ${accent} 35%, transparent)` : undefined,
                    }}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                      style={{
                        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                        borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
                      }}
                    >
                      <WorkflowNodeIcon type={uiType} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold truncate">{node.title}</div>
                      <div
                        className="flex items-center gap-1 text-[9px] mt-0.5 uppercase tracking-wide"
                        style={{
                          color:
                            status === 'idle'
                              ? 'var(--dashboard-muted)'
                              : status === 'completed'
                                ? '#10b981'
                                : status === 'failed'
                                  ? '#ef4444'
                                  : accent,
                        }}
                      >
                        <StatusGlyph status={status} />
                        {statusLabel(status)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkflowCanvas;
export type { NodeStatus };
