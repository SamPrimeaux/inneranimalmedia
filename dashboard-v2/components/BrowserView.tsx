/**
 * BrowserView.tsx — Agent Sam IDE Browser Panel v2
 *
 * Layout per pane:
 *   Toolbar
 *   iframe (always visible, shrinks when drawers open)
 *   BottomDrawer (Console / Network / Elements / Performance) — resizable
 *
 * Right drawer (Components: Design / CSS / Appearance) — resizable
 *
 * Features:
 *  - MCP consent popup detection + styled approval modal
 *  - Element picker — real-time blue outline, click → chat + Components drawer
 *  - DevTools bottom drawer (never covers iframe)
 *  - Components right drawer (mini CMS editor: Design/CSS/Appearance)
 *  - Screenshot → instant chat attachment dispatch
 *  - Dual fully-isolated panes (separate session, drawers, state)
 *  - Agent active glow + banner
 *  - Permission gate for untrusted origins
 *  - Area screenshot drag-select
 *  - WebSocket bridge to IAM_COLLAB
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  RotateCcw, Copy, Columns2, X, Loader2, CheckCircle,
  AlertTriangle, Camera, MoreHorizontal, MousePointer2,
  Layers, ZoomIn, ZoomOut, Trash2, Cookie,
  HardDrive, Shield, ShieldCheck, ShieldX, Globe,
  Terminal, Network, Bug, ChevronDown, ChevronUp,
  Code2, Zap, GripHorizontal,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const IAM_LOGO = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar';
const DEFAULT_URL = typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com';
const DEFAULT_BOTTOM_H = 260;
const DEFAULT_RIGHT_W  = 320;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(raw: string): string {
  const s = raw.trim();
  if (!s) return DEFAULT_URL;
  if (/^(blob:|data:|about:)/i.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
}
function isVirtual(url: string) { return /^(r2:|github:|local:|preview:)/i.test(url); }
function originOf(url: string) { try { return new URL(url).origin; } catch { return url; } }
function isMcpConsent(url: string) {
  return /consent|oauth|authorize|auth\/request/i.test(url);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type PaneMode = 'browse' | 'picker' | 'area' | 'screenshot';
type BottomTab = 'console' | 'network' | 'elements' | 'performance';
type RightTab  = 'design' | 'css' | 'appearance';
type TrustScope = 'session' | 'persistent';

interface TrustRequest { url: string; resolve: (s: TrustScope | null) => void; }
interface McpConsentRequest { url: string; resolve: (approved: boolean) => void; }

interface ConsoleMsg { type: 'log'|'error'|'warn'|'info'; text: string; time: string; }
interface NetworkReq { url: string; method: string; type: string; status?: number; id?: string; }
interface InspectedElement {
  tag: string; id: string|null; className: string|null;
  html: string; path: string; styles: Record<string,string>;
  boundingBox?: { top:number; left:number; width:number; height:number };
}
interface AreaSelection { startX:number; startY:number; endX:number; endY:number; active:boolean; }

// ─── Trust API ───────────────────────────────────────────────────────────────

async function checkTrust(origin: string) {
  try {
    const r = await fetch(`/api/agentsam/browser/trust?origin=${encodeURIComponent(origin)}`, { credentials: 'same-origin' });
    if (!r.ok) return true;
    return !!(await r.json().catch(() => ({}))).trusted;
  } catch { return true; }
}
async function writeTrust(origin: string, scope: TrustScope) {
  try {
    await fetch('/api/agentsam/browser/trust', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ origin, scope }),
    });
  } catch {}
}

// ─── CDT invoke ──────────────────────────────────────────────────────────────

async function invokeCdt(tool_name: string, args: Record<string,unknown>) {
  const r = await fetch('/api/mcp/invoke', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    body: JSON.stringify({ tool_name, args }),
  });
  return r.json().catch(() => ({ ok: false }));
}

// ─── Shared ToolBtn ───────────────────────────────────────────────────────────

const ToolBtn: React.FC<{
  icon: React.ReactNode; title: string;
  active?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void;
}> = ({ icon, title, active, danger, disabled, onClick }) => (
  <button type="button" title={title} disabled={disabled} onClick={onClick}
    className={`p-1.5 rounded transition-all shrink-0 ${
      active   ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_8px_rgba(58,159,232,0.3)]'
      : danger ? 'text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10'
               : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
    } disabled:opacity-30 disabled:cursor-default`}>
    {icon}
  </button>
);

// ─── Permission Gate ──────────────────────────────────────────────────────────

const PermissionGate: React.FC<{
  request: TrustRequest;
  onDeny: () => void; onAllowOnce: () => void; onAlwaysAllow: () => void;
}> = ({ request, onDeny, onAllowOnce, onAlwaysAllow }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-[340px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden">
      <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
        <div className="p-3 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
          <Globe size={22} className="text-[var(--color-primary)]" />
        </div>
        <div className="text-center">
          <p className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest mb-1">Navigation Request</p>
          <p className="text-[11px] text-[var(--text-muted)] font-mono break-all">{originOf(request.url)}</p>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] text-center leading-relaxed">
          Agent Sam wants to open this page.
        </p>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <button type="button" onClick={onAlwaysAllow}
          className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-[12px] font-bold hover:opacity-90">
          <ShieldCheck size={14} /> Always Allow
          <span className="ml-auto text-[10px] font-normal opacity-70">saved to trust list</span>
        </button>
        <button type="button" onClick={onAllowOnce}
          className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] text-[12px] font-semibold">
          <Shield size={14} className="text-[var(--text-muted)]" /> Allow Once
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">this session only</span>
        </button>
        <button type="button" onClick={onDeny}
          className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-[12px] font-semibold">
          <ShieldX size={14} /> Deny
        </button>
      </div>
    </div>
  </div>
);

// ─── MCP Consent Modal ────────────────────────────────────────────────────────

const McpConsentModal: React.FC<{
  request: McpConsentRequest; onApprove: () => void; onDeny: () => void;
}> = ({ request, onApprove, onDeny }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-[380px] rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--bg-panel)] shadow-2xl overflow-hidden">
      <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
        <div className="p-3 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
          <Zap size={22} className="text-[var(--color-primary)]" />
        </div>
        <p className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest">MCP Connection Request</p>
        <p className="text-[11px] text-[var(--text-muted)] font-mono break-all text-center">{request.url}</p>
        <p className="text-[11px] text-[var(--text-muted)] text-center leading-relaxed">
          An MCP server is requesting access to your account. Review the permissions before approving.
        </p>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <button type="button" onClick={onApprove}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-[12px] font-bold hover:opacity-90">
          <ShieldCheck size={14} /> Approve Connection
        </button>
        <button type="button" onClick={onDeny}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-[12px] font-semibold">
          <ShieldX size={14} /> Deny
        </button>
      </div>
    </div>
  </div>
);

// ─── Blocked Page ─────────────────────────────────────────────────────────────

const BlockedPage: React.FC<{ url: string; onScreenshot: () => void }> = ({ url, onScreenshot }) => (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--bg-app)]">
    <img src={IAM_LOGO} alt="IAM" className="w-14 h-14 rounded-xl opacity-60"
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
    <div className="text-center">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Page cannot be embedded</p>
      <p className="text-[10px] font-mono text-[var(--text-muted)]/60 max-w-[200px] break-all">{url}</p>
    </div>
    <button type="button" onClick={onScreenshot}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-[11px] font-semibold hover:bg-[var(--color-primary)]/20">
      <Camera size={12} /> View via Playwright
    </button>
  </div>
);

// ─── Bottom Drawer ────────────────────────────────────────────────────────────

const BottomDrawer: React.FC<{
  url: string; height: number;
  onClose: () => void; onHeightChange: (h: number) => void;
  inspectedEl: InspectedElement | null;
}> = ({ url, height, onClose, onHeightChange, inspectedEl }) => {
  const [tab, setTab]             = useState<BottomTab>('console');
  const [loading, setLoading]     = useState(false);
  const [console_, setConsole_]   = useState<ConsoleMsg[]>([]);
  const [network, setNetwork]     = useState<NetworkReq[]>([]);
  const [elements, setElements]   = useState<string>('');
  const [perfState, setPerfState] = useState<'idle'|'recording'|'done'>('idle');
  const [perfData, setPerfData]   = useState<string>('');
  const [expandedNet, setExpandedNet] = useState<string|null>(null);
  const [netDetail, setNetDetail] = useState<Record<string,unknown>>({});
  const [ran, setRan]             = useState(false);
  const dragRef = useRef(false);
  const startYRef = useRef(0);
  const startHRef = useRef(0);

  const load = useCallback(async () => {
    if (!url || ran) return;
    setLoading(true); setRan(true);
    try {
      const [cons, net] = await Promise.all([
        invokeCdt('cdt_list_console_messages', { url }),
        invokeCdt('cdt_list_network_requests', { url }),
      ]);
      setConsole_(Array.isArray(cons?.messages) ? cons.messages : []);
      setNetwork(Array.isArray(net?.requests) ? net.requests : []);
    } catch {} finally { setLoading(false); }
  }, [url, ran]);

  useEffect(() => { load(); }, [load]);

  const loadElements = useCallback(async () => {
    if (elements) return;
    setLoading(true);
    try {
      const r = await invokeCdt('cdt_take_snapshot', { url });
      setElements(r?.snapshot ? JSON.stringify(r.snapshot, null, 2) : 'No snapshot available');
    } catch {} finally { setLoading(false); }
  }, [url, elements]);

  useEffect(() => { if (tab === 'elements') loadElements(); }, [tab, loadElements]);

  const startPerf = async () => {
    setPerfState('recording');
    await invokeCdt('cdt_performance_start_trace', { url });
  };
  const stopPerf = async () => {
    const r = await invokeCdt('cdt_performance_stop_trace', { url });
    setPerfData(JSON.stringify(r, null, 2));
    setPerfState('done');
  };

  const expandNetwork = async (req: NetworkReq) => {
    if (expandedNet === req.url) { setExpandedNet(null); return; }
    setExpandedNet(req.url);
    if (!netDetail[req.url] && req.id) {
      const r = await invokeCdt('cdt_get_network_request', { url, request_id: req.id });
      setNetDetail(p => ({ ...p, [req.url]: r }));
    }
  };

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = true;
    startYRef.current = e.clientY;
    startHRef.current = height;
    e.preventDefault();
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = startYRef.current - e.clientY;
      onHeightChange(Math.max(120, Math.min(600, startHRef.current + delta)));
    };
    const up = () => { dragRef.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [onHeightChange]);

  const snapHeight = () => {
    if (height < 200) onHeightChange(DEFAULT_BOTTOM_H);
    else if (height < 400) onHeightChange(400);
    else onHeightChange(DEFAULT_BOTTOM_H);
  };

  const typeColor = (t: string) => t === 'error' ? 'text-red-400' : t === 'warn' ? 'text-yellow-400' : 'text-[var(--text-main)]';
  const statusColor = (s?: number) => !s ? 'text-[var(--text-muted)]' : s < 300 ? 'text-green-400' : s < 400 ? 'text-yellow-400' : 'text-red-400';

  const tabs: { key: BottomTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'console',     label: 'Console',     icon: <Terminal size={11} />,  badge: console_.filter(m => m.type === 'error').length || undefined },
    { key: 'network',     label: 'Network',     icon: <Network size={11} /> },
    { key: 'elements',    label: 'Elements',    icon: <Code2 size={11} /> },
    { key: 'performance', label: 'Performance', icon: <Zap size={11} /> },
  ];

  return (
    <div style={{ height }} className="flex flex-col border-t border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0 overflow-hidden">
      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        onDoubleClick={snapHeight}
        className="h-1.5 shrink-0 cursor-row-resize bg-[var(--border-subtle)] hover:bg-[var(--color-primary)] transition-colors flex items-center justify-center group"
      >
        <GripHorizontal size={12} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-panel)]">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
              tab === t.key
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}>
            {t.icon}{t.label}
            {t.badge ? <span className="ml-1 px-1 rounded text-[9px] bg-red-500/20 text-red-400 font-bold">{t.badge}</span> : null}
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" onClick={() => setRan(false)} title="Refresh"
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] rounded transition-colors">
          <RotateCcw size={11} />
        </button>
        <button type="button" onClick={onClose}
          className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors mr-1">
          <X size={11} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto font-mono text-[10px] min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" /><span>Loading...</span>
          </div>
        ) : tab === 'console' ? (
          console_.length === 0
            ? <div className="flex items-center justify-center h-full text-[var(--text-muted)]">No console messages</div>
            : <div className="divide-y divide-[var(--border-subtle)]/30">
                {console_.map((m, i) => (
                  <div key={i} className={`flex gap-2 px-3 py-1.5 ${typeColor(m.type)}`}>
                    <span className="text-[var(--text-muted)] shrink-0 opacity-60">{m.time}</span>
                    <span className={`shrink-0 uppercase text-[9px] px-1 rounded font-bold ${
                      m.type === 'error' ? 'bg-red-500/20 text-red-400'
                      : m.type === 'warn' ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
                    }`}>{m.type.slice(0,4)}</span>
                    <span className="break-all">{m.text}</span>
                  </div>
                ))}
              </div>
        ) : tab === 'network' ? (
          network.length === 0
            ? <div className="flex items-center justify-center h-full text-[var(--text-muted)]">No requests captured</div>
            : <div className="divide-y divide-[var(--border-subtle)]/30">
                {network.map((r, i) => (
                  <div key={i}>
                    <div onClick={() => expandNetwork(r)}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer">
                      <span className={`shrink-0 font-bold w-8 ${statusColor(r.status)}`}>{r.status ?? '—'}</span>
                      <span className="shrink-0 text-[var(--text-muted)] w-10 uppercase opacity-70">{r.method}</span>
                      <span className="shrink-0 text-[var(--text-muted)] w-16 opacity-70">{r.type}</span>
                      <span className="truncate text-[var(--text-main)] flex-1">{r.url}</span>
                      {expandedNet === r.url ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </div>
                    {expandedNet === r.url && netDetail[r.url] && (
                      <div className="px-4 py-2 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)]/30">
                        <pre className="text-[9px] text-[var(--text-muted)] whitespace-pre-wrap break-all">
                          {JSON.stringify(netDetail[r.url], null, 2).slice(0, 4000)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
        ) : tab === 'elements' ? (
          <pre className="p-3 text-[9px] text-[var(--text-muted)] whitespace-pre-wrap break-all">
            {elements || 'Loading DOM snapshot...'}
          </pre>
        ) : (
          <div className="p-3 space-y-3">
            {perfState === 'idle' && (
              <button type="button" onClick={startPerf}
                className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-[11px] font-semibold hover:bg-[var(--color-primary)]/20">
                <Zap size={12} /> Start Performance Trace
              </button>
            )}
            {perfState === 'recording' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[var(--color-primary)] text-[11px]">
                  <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                  Recording trace...
                </div>
                <button type="button" onClick={stopPerf}
                  className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-semibold">
                  Stop & Analyze
                </button>
              </div>
            )}
            {perfState === 'done' && (
              <div className="space-y-2">
                <p className="text-[10px] text-green-400">Trace complete</p>
                <pre className="text-[9px] text-[var(--text-muted)] whitespace-pre-wrap break-all max-h-40 overflow-auto">
                  {perfData.slice(0, 3000)}
                </pre>
                <button type="button" onClick={() => setPerfState('idle')}
                  className="text-[10px] text-[var(--text-muted)] underline">New trace</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Right Drawer (Components / CMS editor) ───────────────────────────────────

const RightDrawer: React.FC<{
  element: InspectedElement | null;
  width: number; onClose: () => void; onWidthChange: (w: number) => void;
}> = ({ element, width, onClose, onWidthChange }) => {
  const [tab, setTab] = useState<RightTab>('design');
  const dragRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    e.preventDefault();
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = startXRef.current - e.clientX;
      onWidthChange(Math.max(240, Math.min(560, startWRef.current + delta)));
    };
    const up = () => { dragRef.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [onWidthChange]);

  const tabs: { key: RightTab; label: string }[] = [
    { key: 'design',     label: 'Design' },
    { key: 'css',        label: 'CSS' },
    { key: 'appearance', label: 'Appearance' },
  ];

  return (
    <div style={{ width }} className="flex shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
      {/* Resize handle on left edge */}
      <div
        onMouseDown={onDragStart}
        className="w-1.5 shrink-0 cursor-col-resize bg-[var(--border-subtle)] hover:bg-[var(--color-primary)] transition-colors"
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
          <Layers size={12} className="text-[var(--color-primary)]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-main)]">Components</span>
          {element && (
            <span className="text-[9px] font-mono text-[var(--text-muted)] truncate flex-1">
              {element.tag}{element.id ? `#${element.id}` : ''}{element.className ? `.${element.className.split(' ')[0]}` : ''}
            </span>
          )}
          <button type="button" onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded shrink-0">
            <X size={11} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-subtle)] shrink-0">
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-4 text-[11px]">
          {!element ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]">
              <Layers size={20} className="opacity-30" />
              <p className="text-[11px] text-center">Use the picker to select an element</p>
            </div>
          ) : tab === 'design' ? (
            <>
              {/* Element path */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Element</p>
                <code className="text-[10px] text-[var(--color-primary)] break-all block">
                  {`<${element.tag}${element.id ? ` id="${element.id}"` : ''}${element.className ? ` class="${element.className}"` : ''}>`}
                </code>
                <p className="text-[9px] text-[var(--text-muted)] mt-1 opacity-60 break-all">{element.path}</p>
              </div>

              {/* Bounding box */}
              {element.boundingBox && (
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Position & Size</p>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(element.boundingBox).map(([k, v]) => (
                      <div key={k} className="flex gap-1 items-center">
                        <span className="text-[var(--text-muted)] w-10 shrink-0">{k}</span>
                        <input readOnly value={`${Math.round(v as number)}px`}
                          className="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[10px] text-[var(--text-main)] font-mono" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Layout styles */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Layout</p>
                <div className="space-y-1">
                  {['display','flex-direction','align-items','justify-content','gap','overflow'].map(prop => {
                    const val = element.styles[prop];
                    if (!val || val === 'normal' || val === 'none' || val === 'auto') return null;
                    return (
                      <div key={prop} className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] w-28 shrink-0 truncate">{prop}</span>
                        <span className="text-[var(--text-main)] font-mono truncate">{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : tab === 'css' ? (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Computed Styles</p>
              <div className="space-y-1">
                {Object.entries(element.styles)
                  .filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto')
                  .slice(0, 60)
                  .map(([prop, val]) => (
                    <div key={prop} className="flex items-center gap-2 group">
                      <span className="text-[var(--text-muted)] w-32 shrink-0 truncate text-[10px]">{prop}</span>
                      <input
                        defaultValue={val}
                        className="flex-1 bg-transparent border-0 border-b border-transparent group-hover:border-[var(--border-subtle)] focus:border-[var(--color-primary)] text-[10px] text-[var(--text-main)] font-mono outline-none py-0.5"
                        onFocus={e => e.target.select()}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Opacity */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Opacity</p>
                <div className="flex items-center gap-2">
                  <input type="range" min="0" max="100"
                    defaultValue={parseFloat(element.styles['opacity'] || '1') * 100}
                    className="flex-1" />
                  <span className="text-[10px] font-mono text-[var(--text-main)] w-8 text-right">
                    {Math.round(parseFloat(element.styles['opacity'] || '1') * 100)}%
                  </span>
                </div>
              </div>

              {/* Border radius */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Corner Radius</p>
                <input defaultValue={element.styles['border-radius'] || '0'}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[10px] text-[var(--text-main)] font-mono outline-none focus:border-[var(--color-primary)]" />
              </div>

              {/* Colors */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Colors</p>
                <div className="space-y-2">
                  {[['color','Text'], ['background-color','Background']].map(([prop, label]) => (
                    <div key={prop} className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)] w-20 text-[10px]">{label}</span>
                      <div className="w-5 h-5 rounded border border-[var(--border-subtle)]"
                        style={{ background: element.styles[prop] || 'transparent' }} />
                      <input defaultValue={element.styles[prop] || ''}
                        className="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-main)] outline-none focus:border-[var(--color-primary)]" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Typography</p>
                <div className="space-y-1">
                  {[['font-size','Size'], ['font-weight','Weight'], ['font-family','Family']].map(([prop, label]) => (
                    element.styles[prop] ? (
                      <div key={prop} className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)] w-14 text-[10px]">{label}</span>
                        <input defaultValue={element.styles[prop]}
                          className="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-main)] outline-none focus:border-[var(--color-primary)]" />
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Picker script ────────────────────────────────────────────────────────────

const PICKER_SCRIPT = `
(function() {
  if (window.__iamPickerActive) return;
  window.__iamPickerActive = true;
  let lastEl = null;
  const ov = document.createElement('div');
  ov.style.cssText='position:fixed;pointer-events:none;border:2px solid #3a9fe8;background:rgba(58,159,232,0.08);z-index:2147483647;transition:all 0.08s;border-radius:2px;box-shadow:0 0 0 1px rgba(58,159,232,0.3);';
  document.body.appendChild(ov);
  function getPath(el) {
    const p=[];
    while(el&&el!==document.body){let s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;else if(el.className)s+='.'+el.className.trim().split(/\s+/)[0];p.unshift(s);el=el.parentElement;}
    return p.join(' > ');
  }
  document.addEventListener('mouseover',e=>{
    const el=e.target;if(el===ov)return;lastEl=el;
    const r=el.getBoundingClientRect();
    ov.style.top=r.top+'px';ov.style.left=r.left+'px';ov.style.width=r.width+'px';ov.style.height=r.height+'px';
  },true);
  document.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    const el=lastEl;if(!el)return;
    const r=el.getBoundingClientRect();
    const cs=window.getComputedStyle(el);
    const styles={};
    ['color','background-color','font-size','font-family','font-weight','display','position',
     'width','height','margin','padding','border','flex','flex-direction','gap','border-radius',
     'box-shadow','opacity','z-index','overflow','cursor','text-align','line-height','align-items',
     'justify-content'].forEach(p=>{const v=cs.getPropertyValue(p);if(v)styles[p]=v;});
    window.parent.postMessage({
      type:'iam-element-selected',
      element:{tag:el.tagName.toLowerCase(),id:el.id||null,className:el.className||null,
        html:el.outerHTML?.slice(0,3000),path:getPath(el),styles,
        boundingBox:{top:r.top,left:r.left,width:r.width,height:r.height}}
    },'*');
  },true);
})();
`;

// ─── Single Pane ──────────────────────────────────────────────────────────────

interface PaneProps {
  initialUrl?: string; addressDisplay?: string|null;
  label?: 'A'|'B'; onClose?: () => void; onSplit?: (url: string) => void;
  isSplit?: boolean; autoFocus?: boolean; agentActive?: boolean;
}

const BrowserPane: React.FC<PaneProps> = ({
  initialUrl, addressDisplay, label, onClose, onSplit, isSplit, autoFocus, agentActive = false,
}) => {
  const [iframeUrl,       setIframeUrl]       = useState(() => normalize(initialUrl || DEFAULT_URL));
  const [inputVal,        setInputVal]        = useState(() => normalize(initialUrl || DEFAULT_URL));
  const [loading,         setLoading]         = useState(false);
  const [iframeBlocked,   setIframeBlocked]   = useState(false);
  const [mode,            setMode]            = useState<PaneMode>('browse');
  const [menuOpen,        setMenuOpen]        = useState(false);
  const [copied,          setCopied]          = useState(false);
  const [zoom,            setZoom]            = useState(100);
  const [screenshotLoad,  setScreenshotLoad]  = useState(false);
  const [screenshotErr,   setScreenshotErr]   = useState<string|null>(null);
  const [inspectedEl,     setInspectedEl]     = useState<InspectedElement|null>(null);
  const [trustRequest,    setTrustRequest]    = useState<TrustRequest|null>(null);
  const [mcpRequest,      setMcpRequest]      = useState<McpConsentRequest|null>(null);
  const [sessionTrusted,  setSessionTrusted]  = useState<Set<string>>(new Set());
  const [area,            setArea]            = useState<AreaSelection|null>(null);
  const [bottomOpen,      setBottomOpen]      = useState(false);
  const [bottomH,         setBottomH]         = useState(DEFAULT_BOTTOM_H);
  const [rightOpen,       setRightOpen]       = useState(false);
  const [rightW,          setRightW]          = useState(DEFAULT_RIGHT_W);

  const inputRef  = useRef<HTMLInputElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const areaRef   = useRef<HTMLDivElement>(null);

  // Sync parent URL
  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const n = normalize(initialUrl);
    setIframeUrl(n);
    setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(n) ? addressDisplay : n);
    setMode('browse'); setInspectedEl(null); setIframeBlocked(false);
  }, [initialUrl, addressDisplay]);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  // Element picker postMessage
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type !== 'iam-element-selected') return;
      setInspectedEl(e.data.element);
      setRightOpen(true);
      window.dispatchEvent(new CustomEvent('iam-agent-external-send', {
        detail: {
          message: `Inspected: \`${e.data.element.tag}${e.data.element.id ? `#${e.data.element.id}` : ''}${e.data.element.className ? `.${e.data.element.className.split(' ')[0]}` : ''}\`\n\nPath: \`${e.data.element.path}\`\n\nStyles:\n${Object.entries(e.data.element.styles || {}).slice(0, 8).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
        },
      }));
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  // Detect MCP consent pages
  useEffect(() => {
    if (isMcpConsent(iframeUrl)) {
      setMcpRequest({
        url: iframeUrl,
        resolve: (approved) => {
          setMcpRequest(null);
          if (!approved) setIframeUrl(DEFAULT_URL);
        },
      });
    }
  }, [iframeUrl]);

  // Inject picker script
  useEffect(() => {
    if (mode !== 'picker') return;
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const s = doc.createElement('script');
      s.textContent = PICKER_SCRIPT;
      doc.head?.appendChild(s);
    } catch {}
  }, [mode, iframeUrl]);

  const requestTrust = useCallback((url: string): Promise<TrustScope|null> =>
    new Promise(resolve => setTrustRequest({ url, resolve })), []);

  const navigate = useCallback(async (raw: string) => {
    const s = raw.trim();
    if (!s || isVirtual(s)) return;
    const n = normalize(s);
    const origin = originOf(n);
    if (!sessionTrusted.has(origin)) {
      const trusted = await checkTrust(origin);
      if (!trusted) {
        const scope = await requestTrust(n);
        if (!scope) return;
        if (scope === 'persistent') await writeTrust(origin, 'persistent');
        setSessionTrusted(prev => new Set([...prev, origin]));
      } else {
        setSessionTrusted(prev => new Set([...prev, origin]));
      }
    }
    setIframeUrl(n); setInputVal(n); setLoading(true);
    setMode('browse'); setInspectedEl(null); setIframeBlocked(false);
  }, [sessionTrusted, requestTrust]);

  const runScreenshot = useCallback(async (clip?: { x:number; y:number; width:number; height:number }) => {
    setScreenshotLoad(true); setScreenshotErr(null);
    try {
      const endpoint = clip ? '/api/mcp/invoke' : '/api/playwright/screenshot';
      const body = clip
        ? { tool_name: 'cdt_capture_area_screenshot', args: { url: iframeUrl, ...clip } }
        : { url: iframeUrl };
      const res  = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const url  = data.result_url || data.screenshot_url || data.screenshotUrl || data.result?.screenshot_url || data.result?.result_url;
      if (!res.ok || !url) throw new Error(data.error || 'No screenshot URL');
      // Dispatch to chat as attachment
      window.dispatchEvent(new CustomEvent('iam-browser-screenshot-attach', { detail: { url, source: iframeUrl } }));
      setMode('browse');
    } catch (e) {
      setScreenshotErr(String(e));
    } finally {
      setScreenshotLoad(false);
    }
  }, [iframeUrl]);

  const hardReload = useCallback(() => {
    const cur = iframeUrl;
    setIframeUrl('about:blank'); setIframeBlocked(false);
    requestAnimationFrame(() => setTimeout(() => setIframeUrl(cur), 50));
    setMenuOpen(false);
  }, [iframeUrl]);

  const clearBrowserData = useCallback(async (what: 'history'|'cookies'|'cache') => {
    setMenuOpen(false);
    const toolMap = { cookies: 'cdt_clear_cookies', cache: 'cdt_clear_cache', history: 'cdt_clear_cache' };
    await invokeCdt(toolMap[what], { url: iframeUrl }).catch(() => {});
    hardReload();
  }, [iframeUrl, hardReload]);

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(iframeUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch {}
    setMenuOpen(false);
  };

  // Area drag
  const startArea = (e: React.MouseEvent) => {
    if (mode !== 'area') return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setArea({ startX: e.clientX-r.left, startY: e.clientY-r.top, endX: e.clientX-r.left, endY: e.clientY-r.top, active: true });
  };
  const moveArea = (e: React.MouseEvent) => {
    if (!area?.active) return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setArea(a => a ? { ...a, endX: e.clientX-r.left, endY: e.clientY-r.top } : null);
  };
  const endArea = async () => {
    if (!area?.active) return;
    const x=Math.min(area.startX,area.endX), y=Math.min(area.startY,area.endY);
    const w=Math.abs(area.endX-area.startX), h=Math.abs(area.endY-area.startY);
    setArea(null);
    if (w>10&&h>10) await runScreenshot({ x:Math.round(x), y:Math.round(y), width:Math.round(w), height:Math.round(h) });
    else setMode('browse');
  };

  const areaRect = area ? {
    left:Math.min(area.startX,area.endX), top:Math.min(area.startY,area.endY),
    width:Math.abs(area.endX-area.startX), height:Math.abs(area.endY-area.startY),
  } : null;

  const toggleMode = (m: PaneMode) => { setMode(prev => prev===m ? 'browse' : m); if (m==='area') setArea(null); };

  return (
    <div
      className="flex flex-col w-full h-full min-w-0 overflow-hidden transition-all duration-300"
      style={agentActive ? { boxShadow:'0 0 0 2px var(--color-primary), 0 0 24px 6px rgba(58,159,232,0.2)' } : undefined}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] shrink-0 min-w-0">
        {label && (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
            {label}
          </span>
        )}
        <ToolBtn icon={<RotateCcw size={12} strokeWidth={1.75} />} title="Reload" onClick={hardReload} />
        <input
          ref={inputRef} id="iam-browser-url" name="url" type="text"
          value={inputVal} onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key==='Enter' && navigate(inputVal)}
          placeholder="https://" spellCheck={false} aria-label="URL"
          className="flex-1 min-w-0 h-6 px-2 text-[11px] rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] focus:outline-none focus:border-[var(--color-primary)] font-mono text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
        />
        {onSplit && !isSplit && (
          <ToolBtn icon={<Columns2 size={12} strokeWidth={1.75} />} title="Split pane" onClick={() => onSplit(iframeUrl)} />
        )}
        {/* Picker */}
        <ToolBtn icon={<MousePointer2 size={12} strokeWidth={1.75} />} title="Element picker"
          active={mode==='picker'} onClick={() => toggleMode('picker')} />
        {/* DevTools */}
        <ToolBtn icon={<Bug size={12} strokeWidth={1.75} />} title="DevTools — console & network"
          active={bottomOpen} onClick={() => setBottomOpen(p => !p)} />
        {/* Components */}
        <ToolBtn icon={<Layers size={12} strokeWidth={1.75} />} title="Components — CSS inspector"
          active={rightOpen} onClick={() => setRightOpen(p => !p)} />

        {/* Menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <ToolBtn icon={<MoreHorizontal size={12} strokeWidth={1.75} />} title="More options"
            active={menuOpen} onClick={() => setMenuOpen(v => !v)} />
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,var(--bg-panel))] shadow-2xl py-1.5 z-[9999] overflow-hidden">
              <button type="button" onClick={() => { setMenuOpen(false); runScreenshot(); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] text-left">
                <Camera size={12} className="text-[var(--text-muted)] shrink-0" /> Take Screenshot
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); toggleMode('area'); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] text-left">
                <Camera size={12} className="text-[var(--text-muted)] shrink-0" /> Capture Area
              </button>
              <div className="h-px bg-[var(--border-subtle)] my-1" />
              <button type="button" onClick={hardReload}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] text-left">
                <RotateCcw size={12} className="text-[var(--text-muted)] shrink-0" /> Hard Reload
              </button>
              <button type="button" onClick={copyUrl}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] text-left">
                {copied ? <CheckCircle size={12} className="text-green-400 shrink-0" /> : <Copy size={12} className="text-[var(--text-muted)] shrink-0" />}
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
              <div className="h-px bg-[var(--border-subtle)] my-1" />
              <div className="flex items-center gap-2 px-3 py-1.5">
                <button type="button" onClick={() => setZoom(z => Math.max(25,z-25))}
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]">
                  <ZoomOut size={12} />
                </button>
                <span className="flex-1 text-center text-[11px] font-mono text-[var(--text-main)]">{zoom}%</span>
                <button type="button" onClick={() => setZoom(z => Math.min(200,z+25))}
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]">
                  <ZoomIn size={12} />
                </button>
              </div>
              <div className="h-px bg-[var(--border-subtle)] my-1" />
              {(['history','cookies','cache'] as const).map(w => (
                <button key={w} type="button" onClick={() => clearBrowserData(w)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 text-left capitalize">
                  {w === 'history' ? <Trash2 size={12} className="shrink-0" /> : w === 'cookies' ? <Cookie size={12} className="shrink-0" /> : <HardDrive size={12} className="shrink-0" />}
                  Clear {w.charAt(0).toUpperCase()+w.slice(1)}
                </button>
              ))}
              {onClose && (
                <>
                  <div className="h-px bg-[var(--border-subtle)] my-1" />
                  <button type="button" onClick={() => { onClose(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 text-left">
                    <X size={12} className="shrink-0" /> Close Pane
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {onClose && <ToolBtn icon={<X size={12} strokeWidth={1.75} />} title="Close pane" danger onClick={onClose} />}
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="h-[2px] w-full bg-[var(--border-subtle)] shrink-0 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-[var(--color-primary)] animate-[progress_1.5s_ease-in-out_infinite]" style={{ width:'40%' }} />
        </div>
      )}

      {/* Agent active banner */}
      {agentActive && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--color-primary)]/10 border-b border-[var(--color-primary)]/20 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--color-primary)]">
            Agent Sam is controlling this browser
          </span>
        </div>
      )}

      {/* Screenshot loading overlay */}
      {screenshotLoad && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
            <p className="text-[12px] text-white font-mono">Capturing...</p>
          </div>
        </div>
      )}
      {screenshotErr && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[11px] font-mono max-w-xs text-center">
          {screenshotErr}
          <button onClick={() => setScreenshotErr(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Main body: iframe + right drawer */}
      <div className="flex-1 flex flex-row min-h-0 overflow-hidden">

        {/* Left: iframe stack + bottom drawer */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">

          {/* Iframe area */}
          <div
            className={`flex-1 relative min-h-0 overflow-hidden ${mode==='area' ? 'cursor-crosshair' : ''}`}
            ref={areaRef}
            onMouseDown={mode==='area' ? startArea : undefined}
            onMouseMove={mode==='area' ? moveArea : undefined}
            onMouseUp={mode==='area' ? endArea : undefined}
          >
            <iframe
              ref={iframeRef} key={iframeUrl} src={iframeUrl} title="Embedded browser"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-modals"
              style={{ zoom: zoom!==100 ? zoom/100 : undefined }}
              className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${
                mode==='browse' && !iframeBlocked ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setIframeBlocked(true); }}
            />

            {iframeBlocked && mode==='browse' && <BlockedPage url={iframeUrl} onScreenshot={runScreenshot} />}

            {mode==='area' && (
              <div className="absolute inset-0 z-20 bg-black/20">
                <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-white bg-black/60 px-2 py-1 rounded-md">
                  Drag to select area
                </p>
                {areaRect && areaRect.width>0 && (
                  <div className="absolute border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    style={{ left:areaRect.left, top:areaRect.top, width:areaRect.width, height:areaRect.height }} />
                )}
              </div>
            )}

            {mode==='picker' && !inspectedEl && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-primary)] text-white text-[10px] font-semibold shadow-lg">
                  <MousePointer2 size={10} /> Hover to highlight — click to inspect
                </div>
              </div>
            )}
          </div>

          {/* Bottom DevTools drawer */}
          {bottomOpen && (
            <BottomDrawer
              url={iframeUrl} height={bottomH}
              onClose={() => setBottomOpen(false)}
              onHeightChange={setBottomH}
              inspectedEl={inspectedEl}
            />
          )}
        </div>

        {/* Right Components drawer */}
        {rightOpen && (
          <RightDrawer
            element={inspectedEl} width={rightW}
            onClose={() => setRightOpen(false)}
            onWidthChange={setRightW}
          />
        )}
      </div>

      {/* Modals */}
      {trustRequest && (
        <PermissionGate
          request={trustRequest}
          onDeny={() => { trustRequest.resolve(null); setTrustRequest(null); }}
          onAllowOnce={() => { trustRequest.resolve('session'); setTrustRequest(null); }}
          onAlwaysAllow={() => { trustRequest.resolve('persistent'); setTrustRequest(null); }}
        />
      )}
      {mcpRequest && (
        <McpConsentModal
          request={mcpRequest}
          onApprove={() => { mcpRequest.resolve(true); setMcpRequest(null); }}
          onDeny={() => { mcpRequest.resolve(false); setMcpRequest(null); }}
        />
      )}
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────

interface BrowserViewProps {
  url?: string; addressDisplay?: string|null;
}

export const BrowserView: React.FC<BrowserViewProps> = ({ url: urlFromParent, addressDisplay }) => {
  const [primaryUrl,   setPrimaryUrl]   = useState(urlFromParent || DEFAULT_URL);
  const [secondaryUrl, setSecondaryUrl] = useState<string|null>(null);
  const [agentActive,  setAgentActive]  = useState(false);

  useEffect(() => { if (urlFromParent?.trim()) setPrimaryUrl(urlFromParent); }, [urlFromParent]);

  useEffect(() => {
    const onPrimary   = (e: Event) => { const u=(e as CustomEvent<{url?:string}>).detail?.url; if(u) setPrimaryUrl(u); };
    const onSecondary = (e: Event) => { const u=(e as CustomEvent<{url?:string}>).detail?.url; if(u) setSecondaryUrl(u); };
    window.addEventListener('iam-browser-navigate', onPrimary);
    window.addEventListener('iam-browser-navigate-secondary', onSecondary);
    return () => {
      window.removeEventListener('iam-browser-navigate', onPrimary);
      window.removeEventListener('iam-browser-navigate-secondary', onSecondary);
    };
  }, []);

  useEffect(() => {
    const proto = window.location.protocol==='https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/collab/room/browser`;
    let ws: WebSocket|null = null;
    let timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type==='navigate'&&msg.url) setPrimaryUrl(msg.url);
          if (msg.type==='agent_active') setAgentActive(!!msg.active);
          if (msg.type==='job_update') setAgentActive(msg.status==='running');
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => { timer = setTimeout(connect, 5000); };
    };
    connect();
    return () => { clearTimeout(timer); try { ws?.close(); } catch {} };
  }, []);

  return (
    <div className="flex w-full h-full overflow-hidden bg-[var(--bg-app)]">
      <div className={`flex flex-col min-h-0 min-w-0 overflow-hidden transition-all duration-200 ${
        secondaryUrl ? 'w-1/2 border-r border-[var(--border-subtle)]' : 'w-full'
      }`}>
        <BrowserPane
          initialUrl={primaryUrl} addressDisplay={addressDisplay}
          label={secondaryUrl ? 'A' : undefined}
          isSplit={!!secondaryUrl} onSplit={url => setSecondaryUrl(url)}
          agentActive={agentActive}
        />
      </div>
      {secondaryUrl && (
        <div className="flex flex-col w-1/2 min-h-0 min-w-0 overflow-hidden">
          <BrowserPane
            initialUrl={secondaryUrl} label="B" isSplit
            onClose={() => setSecondaryUrl(null)} autoFocus agentActive={agentActive}
          />
        </div>
      )}
    </div>
  );
};

export default BrowserView;
