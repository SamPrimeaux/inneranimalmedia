#!/usr/bin/env python3
"""
install_workflow_canvas.py
Writes WorkflowCanvas.tsx and patches App.tsx to wire it to /dashboard/workflows.
Run from repo root: python3 scripts/install_workflow_canvas.py
"""
import os, re, shutil, sys
from pathlib import Path

REPO = Path(os.getcwd())
CANVAS_PATH = REPO / "dashboard/pages/workflows/WorkflowCanvas.tsx"
APP_PATH    = REPO / "dashboard/App.tsx"

# ─────────────────────────────────────────────────────────────────────────────
# 1. WorkflowCanvas.tsx content
# ─────────────────────────────────────────────────────────────────────────────
CANVAS_TSX = r'''import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────
type NodeType = 'trigger' | 'ai' | 'process' | 'gate' | 'output' | 'd1' | 'pty' | 'supabase';
type NodeStatus = 'idle' | 'running' | 'completed' | 'failed';

interface WFNode  { id: string; label: string; type: NodeType; x: number; y: number; }
interface WFEdge  { id: string; from: string; to: string; }
interface WFDef   {
  id: string; key?: string; label: string;
  description?: string; meta?: string;
  nodes: WFNode[]; edges: WFEdge[];
  execution_order?: string[];
}
interface NodePos { x: number; y: number; }
type Drag =
  | { kind: 'node'; id: string; ox: number; oy: number }
  | { kind: 'pan';  sx: number; sy: number };

// ─── Constants ────────────────────────────────────────────────────────────────
const NW = 172;
const NH = 64;
const STEP_MS = 850;

/**
 * CSS variable map — override any of these from cms_themes to theme the canvas.
 * Pattern: --wf-<slot> falls back to common dashboard var, then a safe default.
 *
 * In your theme CSS (loaded by cms_themes / loadThemes()):
 *   --wf-bg-primary:   var(--theme-surface-primary);
 *   --wf-bg-canvas:    var(--theme-surface-canvas);
 *   --wf-accent:       var(--theme-accent-primary);
 *   etc.
 */
const C = {
  bgPrimary:   'var(--wf-bg-primary,   var(--bg-primary,   #0f0f0f))',
  bgCanvas:    'var(--wf-bg-canvas,    var(--bg-canvas,    #080808))',
  bgSecondary: 'var(--wf-bg-secondary, var(--bg-secondary, #1a1a1a))',
  border:      'var(--wf-border,       var(--border-color, #252525))',
  borderFocus: 'var(--wf-border-focus, var(--border-hover, #404040))',
  textPrimary: 'var(--wf-text,         var(--text-primary, #e2e2e2))',
  textMuted:   'var(--wf-text-muted,   var(--text-muted,   #666666))',
  textDim:     'var(--wf-text-dim,     var(--text-dim,     #404040))',
  accent:      'var(--wf-accent,       var(--accent-color, #f59e0b))',
  accentFg:    'var(--wf-accent-fg,    var(--accent-fg,    #000000))',
  dotColor:    'var(--wf-dot,          var(--dot-color,    #1e1e1e))',
};

const NODE_META: Record<NodeType, { sym: string; accent: string }> = {
  trigger:  { sym: '⚡', accent: '#f59e0b' },
  ai:       { sym: '◈',  accent: '#8b5cf6' },
  process:  { sym: '⚙',  accent: '#3b82f6' },
  gate:     { sym: '⬦',  accent: '#ec4899' },
  output:   { sym: '◉',  accent: '#10b981' },
  d1:       { sym: '▦',  accent: '#6366f1' },
  pty:      { sym: '$',  accent: '#f97316' },
  supabase: { sym: '⟠',  accent: '#22c55e' },
};

// ─── Static fallback workflows ────────────────────────────────────────────────
const STATIC_WFS: WFDef[] = [
  {
    id:'1', key:'chat_exec', label:'Agent Chat Plan Execution', meta:'7 nodes · 7 edges',
    nodes:[
      {id:'n1',label:'Chat Trigger',     type:'trigger', x:60,   y:230},
      {id:'n2',label:'Classify Intent',  type:'ai',      x:290,  y:230},
      {id:'n3',label:'Generate Plan',    type:'ai',      x:520,  y:130},
      {id:'n4',label:'Create Steps',     type:'process', x:750,  y:80},
      {id:'n5',label:'Execute Tasks',    type:'process', x:750,  y:280},
      {id:'n6',label:'Request Approval', type:'gate',    x:980,  y:280},
      {id:'n7',label:'Rollup Run',       type:'output',  x:1210, y:230},
    ],
    edges:[
      {id:'e1',from:'n1',to:'n2'},{id:'e2',from:'n2',to:'n3'},{id:'e3',from:'n3',to:'n4'},
      {id:'e4',from:'n3',to:'n5'},{id:'e5',from:'n4',to:'n5'},{id:'e6',from:'n5',to:'n6'},
      {id:'e7',from:'n6',to:'n7'},
    ],
    execution_order:['n1','n2','n3','n4','n5','n6','n7'],
  },
  {
    id:'2', key:'chat_req', label:'Agent Chat Plan From Request', meta:'0 nodes · 0 edges',
    nodes:[], edges:[],
  },
  {
    id:'3', key:'hello', label:'Agent Hello World — Generate + Write HTML', meta:'4 nodes · 3 edges',
    nodes:[
      {id:'n1',label:'Trigger',       type:'trigger', x:60,  y:240},
      {id:'n2',label:'Generate HTML', type:'ai',      x:300, y:240},
      {id:'n3',label:'Write via PTY', type:'pty',     x:540, y:240},
      {id:'n4',label:'Verify File',   type:'output',  x:780, y:240},
    ],
    edges:[{id:'e1',from:'n1',to:'n2'},{id:'e2',from:'n2',to:'n3'},{id:'e3',from:'n3',to:'n4'}],
    execution_order:['n1','n2','n3','n4'],
  },
  {
    id:'4', key:'meaux', label:'Agent Meauxbility Direct OpenAI Sandbox', meta:'0 nodes · 0 edges',
    nodes:[], edges:[],
  },
  {
    id:'5', key:'debug', label:'Agent Sam Debug Mirror E2E', meta:'6 nodes · 6 edges',
    nodes:[
      {id:'n1',label:'Run Trigger',    type:'trigger',  x:60,  y:210},
      {id:'n2',label:'Capture Context',type:'process',  x:290, y:210},
      {id:'n3',label:'Tool Execution', type:'process',  x:520, y:210},
      {id:'n4',label:'Quality Gate',   type:'gate',     x:750, y:210},
      {id:'n5',label:'Supabase Mirror',type:'supabase', x:980, y:110},
      {id:'n6',label:'Final Run State',type:'output',   x:980, y:310},
    ],
    edges:[
      {id:'e1',from:'n1',to:'n2'},{id:'e2',from:'n2',to:'n3'},{id:'e3',from:'n3',to:'n4'},
      {id:'e4',from:'n4',to:'n5'},{id:'e5',from:'n4',to:'n6'},{id:'e6',from:'n5',to:'n6'},
    ],
    execution_order:['n1','n2','n3','n4','n5','n6'],
  },
  {
    id:'6', key:'smoke', label:'Agent Sam Model-Backed Workflow Smoke', meta:'10 nodes · 9 edges',
    nodes:[
      {id:'n1', label:'Smoke Trigger',  type:'trigger',  x:60,   y:310},
      {id:'n2', label:'Load Env',       type:'process',  x:290,  y:310},
      {id:'n3', label:'OpenAI Call',    type:'ai',       x:520,  y:160},
      {id:'n4', label:'Anthropic Call', type:'ai',       x:520,  y:310},
      {id:'n5', label:'Google Call',    type:'ai',       x:520,  y:460},
      {id:'n6', label:'Assert JSON',    type:'gate',     x:750,  y:310},
      {id:'n7', label:'Write D1',       type:'d1',       x:980,  y:210},
      {id:'n8', label:'Write Supabase', type:'supabase', x:980,  y:410},
      {id:'n9', label:'Verify Rows',    type:'process',  x:1210, y:310},
      {id:'n10',label:'Report',         type:'output',   x:1440, y:310},
    ],
    edges:[
      {id:'e1',from:'n1',to:'n2'},{id:'e2',from:'n2',to:'n3'},{id:'e3',from:'n2',to:'n4'},
      {id:'e4',from:'n2',to:'n5'},{id:'e5',from:'n3',to:'n6'},{id:'e6',from:'n4',to:'n6'},
      {id:'e7',from:'n5',to:'n6'},{id:'e8',from:'n6',to:'n7'},{id:'e9',from:'n6',to:'n8'},
    ],
    execution_order:['n1','n2','n3','n4','n5','n6','n7','n8','n9','n10'],
  },
  {
    id:'7', key:'universal', label:'Agent Sam Universal Autonomous Run', meta:'8 nodes · 7 edges',
    nodes:[
      {id:'n1',label:'NL Request',       type:'trigger', x:60,   y:260},
      {id:'n2',label:'Understand Intent', type:'ai',     x:290,  y:260},
      {id:'n3',label:'Discover Caps',    type:'process', x:520,  y:150},
      {id:'n4',label:'Dynamic Plan',     type:'ai',      x:750,  y:260},
      {id:'n5',label:'Select Tools',     type:'process', x:980,  y:150},
      {id:'n6',label:'Execute Steps',    type:'process', x:980,  y:370},
      {id:'n7',label:'Gate Risky',       type:'gate',    x:1210, y:260},
      {id:'n8',label:'Persist Ledger',   type:'output',  x:1440, y:260},
    ],
    edges:[
      {id:'e1',from:'n1',to:'n2'},{id:'e2',from:'n2',to:'n3'},{id:'e3',from:'n2',to:'n4'},
      {id:'e4',from:'n3',to:'n4'},{id:'e5',from:'n4',to:'n5'},{id:'e6',from:'n4',to:'n6'},
      {id:'e7',from:'n7',to:'n8'},
    ],
    execution_order:['n1','n2','n3','n4','n5','n6','n7','n8'],
  },
  {
    id:'8', key:'viz', label:'Agent Sam Visualizer + Observability Buildout', meta:'0 nodes · 0 edges',
    nodes:[], edges:[],
  },
];

// ─── Edge path helper ─────────────────────────────────────────────────────────
function ePath(src: NodePos, tgt: NodePos): string {
  const sx = src.x + NW, sy = src.y + NH / 2;
  const tx = tgt.x,      ty = tgt.y + NH / 2;
  const cx = (sx + tx) / 2;
  return `M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`;
}

// ─── API hook ─────────────────────────────────────────────────────────────────
function useWorkflows() {
  const [workflows, setWorkflows] = useState<WFDef[]>(STATIC_WFS);
  useEffect(() => {
    fetch('/api/agentsam/workflows')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.workflows?.length) setWorkflows(d.workflows); })
      .catch(() => {});
  }, []);
  return workflows;
}

// ─── WorkflowCanvas (main export) ────────────────────────────────────────────
export default function WorkflowCanvas() {
  const workflows = useWorkflows();
  const [curId,     setCurId]     = useState<string | null>(null);
  const [nodePos,   setNodePos]   = useState<Record<string, NodePos>>({});
  const [statuses,  setStatuses]  = useState<Record<string, NodeStatus>>({});
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [pan,  setPan]  = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const simGen    = useRef(0);

  // Auto-select first workflow
  useEffect(() => {
    if (workflows.length && !curId) selectWf(workflows[0].id);
  }, [workflows]);

  const curWf = useMemo(() => workflows.find(w => w.id === curId) ?? null, [workflows, curId]);

  function selectWf(id: string) {
    const wf = workflows.find(w => w.id === id);
    if (!wf) return;
    simGen.current++;
    setCurId(id);
    setIsRunning(false);
    setStatuses({});
    setActiveEdges(new Set());
    setPan({ x: 50, y: 50 });
    setZoom(1);
    const pos: Record<string, NodePos> = {};
    wf.nodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y }; });
    setNodePos(pos);
  }

  // Non-passive wheel (zoom)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => Math.max(0.25, Math.min(2.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Simulation
  const simulate = useCallback(async () => {
    if (!curWf || isRunning || !curWf.nodes.length) return;
    const order = curWf.execution_order ?? curWf.nodes.map(n => n.id);
    const gen = ++simGen.current;
    setIsRunning(true);
    setStatuses({});
    setActiveEdges(new Set());

    for (const nid of order) {
      if (simGen.current !== gen) return;
      setStatuses(p => ({ ...p, [nid]: 'running' }));
      const inc = curWf.edges.filter(e => e.to === nid).map(e => e.id);
      setActiveEdges(p => { const s = new Set(p); inc.forEach(id => s.add(id)); return s; });
      await new Promise<void>(r => setTimeout(r, STEP_MS));
      if (simGen.current !== gen) return;
      setStatuses(p => ({ ...p, [nid]: 'completed' }));
    }
    setIsRunning(false);
  }, [curWf, isRunning]);

  // Coordinate helpers
  const toWorld = useCallback((cx: number, cy: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (cx - r.left) / zoom - pan.x, y: (cy - r.top) / zoom - pan.y };
  }, [zoom, pan]);

  const onNodeDown = useCallback((e: React.MouseEvent, nid: string) => {
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    const p = nodePos[nid] ?? { x: 0, y: 0 };
    setDrag({ kind: 'node', id: nid, ox: w.x - p.x, oy: w.y - p.y });
  }, [toWorld, nodePos]);

  const onCanvasDown = useCallback((e: React.MouseEvent) => {
    setDrag({ kind: 'pan', sx: e.clientX - pan.x, sy: e.clientY - pan.y });
  }, [pan]);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return;
    if (drag.kind === 'node') {
      const w = toWorld(e.clientX, e.clientY);
      setNodePos(p => ({ ...p, [drag.id]: { x: w.x - drag.ox, y: w.y - drag.oy } }));
    } else {
      setPan({ x: e.clientX - drag.sx, y: e.clientY - drag.sy });
    }
  }, [drag, toWorld]);

  const onUp = useCallback(() => setDrag(null), []);

  // Derived styles
  const gs = 24 * zoom;
  const gridBg: React.CSSProperties = {
    backgroundImage: `radial-gradient(circle at 1px 1px, ${C.dotColor} 1.5px, transparent 0)`,
    backgroundSize:  `${gs}px ${gs}px`,
    backgroundPosition: `${pan.x % gs}px ${pan.y % gs}px`,
  };
  const worldStyle: React.CSSProperties = {
    position: 'absolute', transformOrigin: '0 0',
    transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
    width: 3000, height: 2000,
  };

  return (
    <div style={{ display:'flex', height:'100%', background: C.bgPrimary, color: C.textPrimary,
                  fontFamily: 'var(--font-mono, "JetBrains Mono", ui-monospace, monospace)', fontSize:13 }}>
      <style>{`
        @keyframes wf-flow  { to { stroke-dashoffset: -20; } }
        @keyframes wf-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .wf-node { transition: border-color .2s, box-shadow .2s; }
        .wf-node:hover { border-color: ${C.borderFocus} !important; }
        .wf-item:hover { background: ${C.bgSecondary}; }
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{ width:260, borderRight:`1px solid ${C.border}`, display:'flex',
                    flexDirection:'column', background: C.bgPrimary, flexShrink:0 }}>
        <div style={{ padding:'13px 16px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:10, color: C.textDim, letterSpacing:'.1em', marginBottom:4 }}>WORKFLOWS</div>
          <div style={{ fontSize:13, fontWeight:500, color: C.textPrimary }}>agentsam_workflows</div>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {workflows.map(wf => (
            <div key={wf.id} className="wf-item" onClick={() => selectWf(wf.id)}
              style={{ padding:'11px 16px', borderBottom:`1px solid ${C.border}`, cursor:'pointer',
                       background: curId === wf.id ? C.bgSecondary : 'transparent',
                       borderLeft:`2px solid ${curId === wf.id ? C.accent : 'transparent'}`,
                       transition:'background .1s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                <span style={{ color: C.accent, fontSize:11 }}>⚡</span>
                <span style={{ fontSize:11, fontWeight:500, color: C.textPrimary,
                               overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {wf.label}
                </span>
              </div>
              <div style={{ fontSize:10, color: C.textMuted, paddingLeft:18 }}>
                {wf.meta ?? `${wf.nodes.length} nodes · ${wf.edges.length} edges`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

        {/* Toolbar */}
        <div style={{ height:44, display:'flex', alignItems:'center', gap:12, padding:'0 16px',
                      borderBottom:`1px solid ${C.border}`, background: C.bgPrimary, flexShrink:0 }}>
          <span style={{ flex:1, fontSize:12, color: C.textMuted,
                         overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {curWf?.label ?? ''}
          </span>
          <span style={{ fontSize:11, color: C.textDim }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => { setPan({ x:50, y:50 }); setZoom(1); }}
            style={{ fontSize:11, padding:'4px 10px', background: C.bgSecondary,
                     border:`1px solid ${C.border}`, color: C.textMuted,
                     cursor:'pointer', borderRadius:4, fontFamily:'inherit' }}>
            Reset
          </button>
          <button onClick={simulate}
            disabled={isRunning || !curWf?.nodes.length}
            style={{ fontSize:11, padding:'4px 14px', fontWeight:600, fontFamily:'inherit',
                     background: isRunning ? C.bgSecondary : C.accent,
                     border:'none', color: isRunning ? C.textDim : C.accentFg,
                     cursor: isRunning ? 'not-allowed' : 'pointer', borderRadius:4,
                     animation: isRunning ? 'wf-pulse 1s ease-in-out infinite' : 'none' }}>
            {isRunning ? '● Running…' : '▶ Simulate'}
          </button>
        </div>

        {/* Canvas */}
        <div ref={canvasRef}
          onMouseDown={onCanvasDown} onMouseMove={onMove}
          onMouseUp={onUp} onMouseLeave={onUp}
          style={{ flex:1, position:'relative', overflow:'hidden',
                   cursor: drag?.kind === 'pan' ? 'grabbing' : 'grab',
                   background: C.bgCanvas, ...gridBg }}>

          {!curWf?.nodes.length ? (
            <div style={{ position:'absolute', inset:0, display:'flex',
                          alignItems:'center', justifyContent:'center', color: C.textDim }}>
              No nodes defined in this workflow
            </div>
          ) : (
            <div style={worldStyle}>
              {/* SVG edges */}
              <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%',
                            overflow:'visible', pointerEvents:'none' }}>
                <defs>
                  <marker id="wf-arr" markerWidth="7" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 Z" fill="#252525"/>
                  </marker>
                  <marker id="wf-arr-a" markerWidth="7" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L7,3 Z" fill="#f59e0b"/>
                  </marker>
                </defs>
                {curWf.edges.map(edge => {
                  const src = nodePos[edge.from];
                  const tgt = nodePos[edge.to];
                  if (!src || !tgt) return null;
                  const d = ePath(src, tgt);
                  const on = activeEdges.has(edge.id);
                  return (
                    <g key={edge.id}>
                      <path d={d} fill="none"
                        stroke={on ? '#f59e0b' : C.border}
                        strokeWidth={on ? 2 : 1.5}
                        markerEnd={on ? 'url(#wf-arr-a)' : 'url(#wf-arr)'}
                        style={{ transition:'stroke .3s' }}/>
                      {on && <path d={d} fill="none" stroke="#f59e0b" strokeWidth={2}
                        strokeDasharray="8 6"
                        style={{ animation:'wf-flow .5s linear infinite' }}/>}
                    </g>
                  );
                })}
              </svg>

              {/* Nodes */}
              {curWf.nodes.map(node => {
                const pos    = nodePos[node.id] ?? { x: node.x, y: node.y };
                const meta   = NODE_META[node.type] ?? NODE_META.process;
                const status = statuses[node.id] ?? 'idle';
                const bColor = status === 'running'   ? meta.accent
                             : status === 'completed' ? '#10b981'
                             : status === 'failed'    ? '#ef4444'
                             : C.border;
                const shadow = status === 'running'   ? `0 0 0 2.5px ${meta.accent}28`
                             : status === 'completed' ? '0 0 0 2px #10b98120'
                             : 'none';
                const stText = status === 'running'   ? '● running'
                             : status === 'completed' ? '✓ done'
                             : status === 'failed'    ? '✗ failed'
                             : node.type.toUpperCase();
                const stColor = status === 'running'   ? meta.accent
                              : status === 'completed' ? '#10b981'
                              : status === 'failed'    ? '#ef4444'
                              : C.textDim;
                return (
                  <div key={node.id} className="wf-node"
                    onMouseDown={e => onNodeDown(e, node.id)}
                    style={{ position:'absolute', left: pos.x, top: pos.y,
                             width: NW, height: NH, background: C.bgPrimary,
                             border:`1px solid ${bColor}`, boxShadow: shadow,
                             borderRadius:8, cursor:'grab', userSelect:'none',
                             display:'flex', alignItems:'center', gap:9,
                             padding:'0 12px', boxSizing:'border-box' }}>
                    <div style={{ position:'absolute', left:-5, top:'50%',
                                  transform:'translateY(-50%)', width:9, height:9,
                                  borderRadius:'50%', background: C.bgSecondary,
                                  border:`1.5px solid ${C.border}` }}/>
                    <div style={{ width:28, height:28, borderRadius:6, flexShrink:0,
                                  background:`${meta.accent}18`, border:`1px solid ${meta.accent}44`,
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  animation: status === 'running' ? 'wf-pulse .8s ease-in-out infinite' : 'none' }}>
                      <span style={{ fontSize:14, color: meta.accent }}>{meta.sym}</span>
                    </div>
                    <div style={{ flex:1, overflow:'hidden' }}>
                      <div style={{ fontSize:11, fontWeight:500, color: C.textPrimary,
                                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {node.label}
                      </div>
                      <div style={{ fontSize:9, color: stColor, marginTop:2, letterSpacing:'.05em' }}>
                        {stText}
                      </div>
                    </div>
                    <div style={{ position:'absolute', right:-5, top:'50%',
                                  transform:'translateY(-50%)', width:9, height:9,
                                  borderRadius:'50%', background: C.bgSecondary,
                                  border:`1.5px solid ${C.border}` }}/>
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
'''

# ─────────────────────────────────────────────────────────────────────────────
# 2. Patch App.tsx
# ─────────────────────────────────────────────────────────────────────────────
def patch_app(content: str) -> tuple[str, list[str]]:
    changes = []

    # Guard: already patched?
    if 'WorkflowCanvas' in content:
        changes.append('SKIP: WorkflowCanvas already present in App.tsx')
        return content, changes

    # 2a. Add lazy import for WorkflowCanvas after WorkflowsPage import
    # Handles both: lazy(() => import('./pages/workflows/WorkflowsPage'))
    # and:          lazy(() => import('../pages/workflows/WorkflowsPage'))
    wf_lazy_re = re.compile(
        r"(const WorkflowsPage\s*=\s*lazy\([^\)]+\)\s*;?)"
    )
    m = wf_lazy_re.search(content)
    if m:
        orig = m.group(1)
        # Derive the path used for WorkflowsPage and swap the filename
        new_import_path = re.sub(r'WorkflowsPage', 'WorkflowCanvas', orig)
        new_import_path = re.sub(r'const WorkflowsPage', 'const WorkflowCanvas', new_import_path)
        content = content.replace(orig, orig + '\n' + new_import_path)
        changes.append('ADDED: WorkflowCanvas lazy import after WorkflowsPage')
    else:
        # Fallback: try a direct static import pattern
        static_re = re.compile(r"(import\s+WorkflowsPage\s+from\s+['\"]([^'\"]+)['\"])")
        m2 = static_re.search(content)
        if m2:
            orig2 = m2.group(1)
            path2 = m2.group(2).replace('WorkflowsPage', 'WorkflowCanvas')
            content = content.replace(orig2, orig2 + f"\nimport WorkflowCanvas from '{path2}';")
            changes.append('ADDED: WorkflowCanvas static import after WorkflowsPage')
        else:
            changes.append('WARN: Could not find WorkflowsPage import — add manually (see below)')

    # 2b. Swap route element
    route_re = re.compile(
        r'(path=["\']\/dashboard\/workflows["\"][^/]*?element=\{)<WorkflowsPage\s*/>'
    )
    m3 = route_re.search(content)
    if m3:
        content = route_re.sub(r'\1<WorkflowCanvas />', content)
        changes.append('PATCHED: /dashboard/workflows route now uses WorkflowCanvas')
    else:
        # Broader fallback
        old = '<WorkflowsPage />'
        if 'workflows' in content and old in content:
            # only replace the one near "workflows"
            idx = content.find('/dashboard/workflows')
            if idx != -1:
                chunk = content[max(0, idx-20):idx+300]
                if old in chunk:
                    content = content[:max(0,idx-20)] + chunk.replace(old, '<WorkflowCanvas />', 1) + content[max(0,idx-20)+300:]
                    changes.append('PATCHED: /dashboard/workflows element (fallback method)')
        else:
            changes.append('WARN: Could not auto-patch route element — add manually (see below)')

    return content, changes


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    print('\n=== install_workflow_canvas.py ===\n')

    # 1. Write WorkflowCanvas.tsx
    CANVAS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CANVAS_PATH.write_text(CANVAS_TSX, encoding='utf-8')
    print(f'WROTE: {CANVAS_PATH.relative_to(REPO)}')

    # 2. Patch App.tsx
    if not APP_PATH.exists():
        print(f'ERROR: {APP_PATH} not found — run from repo root')
        sys.exit(1)

    backup = APP_PATH.with_suffix('.tsx.bak')
    shutil.copy2(APP_PATH, backup)
    print(f'BACKUP: {backup.relative_to(REPO)}')

    original = APP_PATH.read_text(encoding='utf-8')
    patched, changes = patch_app(original)

    for c in changes:
        print(f'  {c}')

    if patched != original:
        APP_PATH.write_text(patched, encoding='utf-8')
        print(f'SAVED: {APP_PATH.relative_to(REPO)}')
    else:
        print('INFO: App.tsx unchanged')

    print('\n─── Manual fallback (if any WARN above) ───────────────────────')
    print('Add this import in dashboard/App.tsx near WorkflowsPage imports:')
    print("  const WorkflowCanvas = lazy(() => import('./pages/workflows/WorkflowCanvas'));")
    print('\nChange the route element:')
    print('  path="/dashboard/workflows" element={<WorkflowCanvas />}')
    print('\n─── cms_themes wiring ──────────────────────────────────────────')
    print('To theme the canvas, add to your active theme CSS (or loadThemes() output):')
    print('  --wf-bg-primary:   var(--theme-surface-primary, #0f0f0f);')
    print('  --wf-bg-canvas:    var(--theme-surface-canvas,  #080808);')
    print('  --wf-bg-secondary: var(--theme-surface-secondary, #1a1a1a);')
    print('  --wf-border:       var(--theme-border, #252525);')
    print('  --wf-text:         var(--theme-text-primary, #e2e2e2);')
    print('  --wf-text-muted:   var(--theme-text-muted, #666);')
    print('  --wf-accent:       var(--theme-accent-primary, #f59e0b);')
    print('  --wf-dot:          var(--theme-dot-color, #1e1e1e);')
    print('\n─── Build + deploy ─────────────────────────────────────────────')
    print('  npm run build:vite-only && npm run deploy:full')
    print('\nDone.\n')

if __name__ == '__main__':
    main()
