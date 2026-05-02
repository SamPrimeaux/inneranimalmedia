/**
 * BrowserView.tsx — Agent Sam IDE Browser Panel
 *
 * Toolbar (left → right):
 *   Reload | URL bar | [Split] | Picker | DevTools | Components | ...menu
 *
 * Features:
 *  - Permission gate (Deny / Allow Once / Always Allow) via agentsam_browser_trusted_origin
 *  - Agent active glow when CDT tools are running
 *  - IAM logo fallback for blocked/unreachable pages
 *  - CSS Inspector (Components panel) — same-origin iframe injection
 *  - DevTools panel — console + network via cdt_* tools
 *  - Element picker — hover/highlight/select, populates chat
 *  - Area screenshot drag-select
 *  - WebSocket bridge to IAM_COLLAB for live Agent Sam events
 *  - Split pane A/B
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  RotateCcw, Copy, Columns2, X, Loader2, CheckCircle,
  AlertTriangle, Camera, MoreHorizontal, MousePointer2,
  Code2, Layers, ZoomIn, ZoomOut, Trash2, Cookie,
  HardDrive, Shield, ShieldCheck, ShieldX, Globe,
  Terminal, Network, Bug,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const IAM_LOGO = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar';

const DEFAULT_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://inneranimalmedia.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(raw: string): string {
  const s = raw.trim();
  if (!s) return DEFAULT_URL;
  if (/^(blob:|data:|about:)/i.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) {
    if (s.includes('.') || s.startsWith('localhost')) return `https://${s}`;
    return `https://${s}`;
  }
  return s;
}

/** URL bar submit: google search for non-URLs, https for bare domains. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function isVirtual(url: string): boolean {
  return /^(r2:|github:|local:|preview:)/i.test(url);
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaneMode = 'browse' | 'picker' | 'screenshot' | 'area';
type TrustScope = 'session' | 'persistent';

interface TrustRequest {
  url:     string;
  resolve: (scope: TrustScope | null) => void;
}

interface ConsoleMsg {
  type:    'log' | 'error' | 'warn' | 'info';
  text:    string;
  time:    string;
}

interface NetworkReq {
  url:    string;
  method: string;
  type:   string;
  status?: number;
}

interface InspectedElement {
  tag:        string;
  id:         string | null;
  className:  string | null;
  html:       string;
  path:       string;
  styles:     Record<string, string>;
  boundingBox?: { top: number; left: number; width: number; height: number };
}

interface AreaSelection {
  startX: number;
  startY: number;
  endX:   number;
  endY:   number;
  active: boolean;
}

// ─── Trust API ────────────────────────────────────────────────────────────────

async function checkTrust(origin: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/agentsam/browser/trust?origin=${encodeURIComponent(origin)}`, {
      credentials: 'same-origin',
    });
    if (!r.ok) return true; // endpoint not yet wired → allow by default
    const d = await r.json().catch(() => ({}));
    return !!d.trusted;
  } catch { return true; }
}

async function writeTrust(origin: string, scope: TrustScope): Promise<void> {
  try {
    await fetch('/api/agentsam/browser/trust', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body:        JSON.stringify({ origin, trust_scope: scope }),
    });
  } catch { /* non-blocking */ }
}

// ─── MCP tool invoke ─────────────────────────────────────────────────────────

async function invokeCdt(tool_name: string, params: Record<string, unknown>) {
  const r = await fetch('/api/mcp/invoke', {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body:        JSON.stringify({ tool_name, params }),
  });
  const data = await r.json().catch(() => ({}));
  if (data && typeof data === 'object' && 'result' in data && (data as { result: unknown }).result != null) {
    return (data as { result: Record<string, unknown> }).result;
  }
  return data;
}

// ─── Shared button ────────────────────────────────────────────────────────────

const ToolBtn: React.FC<{
  icon:      React.ReactNode;
  title:     string;
  active?:   boolean;
  danger?:   boolean;
  disabled?: boolean;
  onClick:   () => void;
}> = ({ icon, title, active, danger, disabled, onClick }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`p-1.5 rounded transition-all shrink-0 ${
      active
        ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_8px_rgba(58,159,232,0.3)]'
        : danger
          ? 'text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10'
          : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
    } disabled:opacity-30 disabled:cursor-default`}
  >
    {icon}
  </button>
);

// ─── Permission Gate Modal ────────────────────────────────────────────────────

const PermissionGate: React.FC<{
  request: TrustRequest;
  onDeny:        () => void;
  onAllowOnce:   () => void;
  onAlwaysAllow: () => void;
}> = ({ request, onDeny, onAllowOnce, onAlwaysAllow }) => {
  const origin = originOf(request.url);
  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[340px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
          <div className="p-3 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20">
            <Globe size={22} className="text-[var(--color-primary)]" />
          </div>
          <div className="text-center">
            <p className="text-[12px] font-bold text-[var(--text-main)] uppercase tracking-widest mb-1">
              Navigation Request
            </p>
            <p className="text-[11px] text-[var(--text-muted)] font-mono break-all">
              {origin}
            </p>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] text-center leading-relaxed">
            Agent Sam wants to open this page. Choose how to allow access.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 p-4">
          <button
            type="button"
            onClick={onAlwaysAllow}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-[12px] font-bold hover:opacity-90 transition-opacity"
          >
            <ShieldCheck size={14} />
            Always Allow
            <span className="ml-auto text-[10px] font-normal opacity-70">saved to trust list</span>
          </button>
          <button
            type="button"
            onClick={onAllowOnce}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] text-[12px] font-semibold hover:bg-[var(--bg-panel)] transition-colors"
          >
            <Shield size={14} className="text-[var(--text-muted)]" />
            Allow Once
            <span className="ml-auto text-[10px] text-[var(--text-muted)]">this session only</span>
          </button>
          <button
            type="button"
            onClick={onDeny}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-[12px] font-semibold hover:bg-red-500/10 transition-colors"
          >
            <ShieldX size={14} />
            Deny
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Blocked Page Fallback ────────────────────────────────────────────────────

const BlockedPage: React.FC<{ url: string; onScreenshot: () => void }> = ({ url, onScreenshot }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[var(--bg-app)] z-10 min-h-0 w-full">
    <img
      src={IAM_LOGO}
      alt="Inner Animal Media"
      className="w-14 h-14 rounded-xl opacity-60"
      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
    <div className="text-center">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
        Page cannot be embedded
      </p>
      <p className="text-[10px] font-mono text-[var(--text-muted)]/60 max-w-[200px] break-all">{url}</p>
    </div>
    <button
      type="button"
      onClick={onScreenshot}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-[11px] font-semibold hover:bg-[var(--color-primary)]/20 transition-colors"
    >
      <Camera size={12} />
      View via Playwright
    </button>
  </div>
);

type DevToolsTab = 'elements' | 'console' | 'network';

// ─── Accessibility snapshot tree (CDT) ─────────────────────────────────────

const SnapshotTreeRow: React.FC<{ node: Record<string, unknown>; depth: number }> = ({ node, depth }) => {
  const role = String(node.role ?? 'node');
  const name = node.name != null ? String(node.name) : '';
  const rawChildren = node.children;
  const children = Array.isArray(rawChildren) ? (rawChildren as Record<string, unknown>[]) : [];
  return (
    <div className="select-text">
      <div className="text-[10px] font-mono py-0.5" style={{ paddingLeft: depth * 10 }}>
        <span className="text-[var(--text-muted)]">{role}</span>
        {name ? <span className="text-[var(--text-main)] ml-1">{name}</span> : null}
      </div>
      {children.map((c, i) => (
        <SnapshotTreeRow key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  );
};

// ─── Components Panel (CSS Inspector) ────────────────────────────────────────

const ComponentsPanel: React.FC<{
  element: InspectedElement | null;
  onClose: () => void;
  embedded?: boolean;
}> = ({ element, onClose, embedded }) => (
  <div className={
    embedded
      ? 'flex flex-col flex-1 min-h-0 min-w-0 bg-[var(--bg-panel)] overflow-hidden'
      : 'fixed top-0 right-0 bottom-0 z-10 flex flex-col w-72 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] overflow-hidden shadow-2xl'
  }>
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
      <Layers size={12} className="text-[var(--color-primary)]" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-main)]">
        Inspector
      </span>
      {element && (
        <span className="ml-1 text-[10px] text-[var(--text-muted)] truncate max-w-[100px]">
          {element.tag}{element.id ? `#${element.id}` : ''}{element.className ? `.${element.className.split(' ')[0]}` : ''}
        </span>
      )}
      <div className="flex-1" />
      <button type="button" onClick={onClose} className="p-1 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded">
        <X size={11} />
      </button>
    </div>

    {!element ? (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]">
        <Layers size={20} className="opacity-30" />
        <p className="text-[11px]">Click an element in the browser to inspect it</p>
      </div>
    ) : (
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
          <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Element</p>
          <code className="text-[10px] text-[var(--color-primary)] break-all">
            {`<${element.tag}${element.id ? ` id="${element.id}"` : ''}${element.className ? ` class="${element.className}"` : ''}>`}
          </code>
          <p className="text-[9px] text-[var(--text-muted)] mt-1 opacity-60">{element.path}</p>
        </div>

        <div className="px-3 py-2">
          <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Computed Styles</p>
          <div className="space-y-1">
            {Object.entries(element.styles)
              .filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto')
              .slice(0, 40)
              .map(([prop, val]) => (
                <div key={prop} className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--text-muted)] shrink-0 w-32 truncate">{prop}</span>
                  <span className="text-[var(--text-main)] truncate">{val}</span>
                </div>
              ))}
          </div>
        </div>

        {element.boundingBox && (
          <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
            <p className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Position & Size</p>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {Object.entries(element.boundingBox).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-[var(--text-muted)]">{k}:</span>
                  <span className="text-[var(--text-main)]">{Math.round(v as number)}px</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
);

// ─── DevTools Panel (right dock: Elements | Console | Network) ────────────────

const DevToolsPanel: React.FC<{
  url:               string;
  onClose:           () => void;
  tab:               DevToolsTab;
  onTabChange:       (t: DevToolsTab) => void;
  inspectedElement:  InspectedElement | null;
  inspectSameOrigin: boolean;
}> = ({ url, onClose, tab, onTabChange, inspectedElement, inspectSameOrigin }) => {
  const [loading, setLoading]       = useState(false);
  const [consoleRows, setConsoleRows] = useState<ConsoleMsg[]>([]);
  const [networkRows, setNetworkRows] = useState<Array<NetworkReq & {
    response?: { status?: number; statusText?: string; headers?: Record<string, string> };
    resourceType?: string;
  }>>([]);
  const [snapshot, setSnapshot]     = useState<Record<string, unknown> | null>(null);
  const [netFilter, setNetFilter]   = useState<'all' | 'xhr' | 'js' | 'css' | 'img'>('all');
  const [expandedNetKey, setExpandedNetKey] = useState<string | null>(null);

  const fetchedRef = useRef({ elements: false, console: false, network: false });
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchedRef.current = { elements: false, console: false, network: false };
    setConsoleRows([]);
    setNetworkRows([]);
    setSnapshot(null);
    setExpandedNetKey(null);
  }, [url]);

  const mapConsoleType = (t: string): ConsoleMsg['type'] => {
    const u = t.toLowerCase();
    if (u === 'error') return 'error';
    if (u === 'warning' || u === 'warn') return 'warn';
    if (u === 'info') return 'info';
    return 'log';
  };

  const loadTab = useCallback(async (t: DevToolsTab, force: boolean) => {
    if (!url?.trim()) return;
    if (!force && fetchedRef.current[t]) return;
    setLoading(true);
    try {
      if (t === 'console') {
        const cons = await invokeCdt('cdt_list_console_messages', { url, limit: 100 });
        const raw = Array.isArray((cons as { messages?: unknown[] })?.messages)
          ? (cons as { messages: Array<{ type?: string; text?: string }> }).messages
          : [];
        const mapped: ConsoleMsg[] = raw.map((m, i) => ({
          type: mapConsoleType(String(m.type || 'log')),
          text: String(m.text ?? ''),
          time: new Date().toISOString().split('T')[1]?.slice(0, 12) ?? String(i),
        }));
        setConsoleRows(mapped);
        fetchedRef.current.console = true;
      } else if (t === 'network') {
        const net = await invokeCdt('cdt_list_network_requests', { url, limit: 100 });
        const raw = Array.isArray((net as { requests?: unknown[] })?.requests)
          ? (net as { requests: Array<NetworkReq & { resourceType?: string; response?: unknown }> }).requests
          : [];
        setNetworkRows(raw.map(r => ({
          url:    String(r.url ?? ''),
          method: String(r.method ?? ''),
          type:   String(r.resourceType ?? r.type ?? ''),
          status: r.response && typeof r.response === 'object' && 'status' in (r.response as object)
            ? Number((r.response as { status?: number }).status)
            : r.status,
          resourceType: r.resourceType != null ? String(r.resourceType) : undefined,
          response: r.response as { status?: number; statusText?: string; headers?: Record<string, string> } | undefined,
        })));
        fetchedRef.current.network = true;
      } else if (t === 'elements' && !inspectSameOrigin) {
        const snap = await invokeCdt('cdt_take_snapshot', { url, interestingOnly: true });
        const root = (snap as { snapshot?: unknown })?.snapshot;
        setSnapshot(
          root && typeof root === 'object' && !Array.isArray(root)
            ? (root as Record<string, unknown>)
            : { error: 'No snapshot', raw: root },
        );
        fetchedRef.current.elements = true;
      } else if (t === 'elements' && inspectSameOrigin) {
        fetchedRef.current.elements = true;
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [url, inspectSameOrigin]);

  useEffect(() => {
    void loadTab(tab, false);
  }, [tab, loadTab]);

  useEffect(() => {
    if (tab === 'console' && consoleRows.length) {
      consoleEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [tab, consoleRows]);

  const refresh = () => {
    (fetchedRef.current as Record<string, boolean>)[tab] = false;
    void loadTab(tab, true);
  };

  const badgeCls = (ty: ConsoleMsg['type']) => {
    if (ty === 'error') return 'bg-red-500/15 text-red-400';
    if (ty === 'warn') return 'bg-yellow-500/15 text-yellow-400';
    if (ty === 'info') return 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]';
    return 'bg-[var(--bg-hover)] text-[var(--text-muted)]';
  };

  const statusColor = (s?: number) => {
    if (s == null || Number.isNaN(s)) return 'text-[var(--text-muted)]';
    if (s < 300) return 'text-green-400';
    if (s < 400) return 'text-yellow-400';
    return 'text-red-400';
  };

  const filteredNet = networkRows.filter((r) => {
    const rt = (r.resourceType || r.type || '').toLowerCase();
    if (netFilter === 'all') return true;
    if (netFilter === 'xhr') return rt === 'xhr' || rt === 'fetch';
    if (netFilter === 'js') return rt === 'script';
    if (netFilter === 'css') return rt === 'stylesheet';
    if (netFilter === 'img') return rt === 'image';
    return true;
  });

  const tabs: { id: DevToolsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'elements', label: 'Elements', icon: <Code2 size={11} /> },
    { id: 'console', label: 'Console', icon: <Terminal size={11} /> },
    { id: 'network', label: 'Network', icon: <Network size={11} /> },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-[var(--bg-app)] overflow-hidden">
      <div className="flex items-center border-b border-[var(--border-subtle)] shrink-0">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
              tab === id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
            {id === 'console' && consoleRows.filter(m => m.type === 'error').length > 0 && (
              <span className="ml-0.5 px-1 rounded text-[9px] bg-red-500/20 text-red-400 font-bold">
                {consoleRows.filter(m => m.type === 'error').length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1 min-w-0" />
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] rounded transition-colors shrink-0"
        >
          <RotateCcw size={11} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors mr-1 shrink-0"
        >
          <X size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-[10px] min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" />
            <span>Loading…</span>
          </div>
        ) : tab === 'elements' ? (
          <div className="flex flex-col min-h-0 h-full">
            {inspectSameOrigin ? (
              <ComponentsPanel element={inspectedElement} onClose={onClose} embedded />
            ) : snapshot && 'error' in snapshot && snapshot.error ? (
              <div className="p-3 text-[var(--text-muted)]">{String(snapshot.error)}</div>
            ) : snapshot ? (
              <div className="p-2 overflow-y-auto min-h-0">
                <SnapshotTreeRow node={snapshot} depth={0} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)] p-3 text-center">
                No accessibility snapshot
              </div>
            )}
          </div>
        ) : tab === 'console' ? (
          <div className="flex flex-col min-h-0 h-full">
            <div className="flex justify-end px-2 py-1 border-b border-[var(--border-subtle)] shrink-0">
              <button
                type="button"
                onClick={() => setConsoleRows([])}
                className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {consoleRows.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)]">No console messages</div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]/30">
                  {consoleRows.map((m, i) => (
                    <div key={i} className="flex gap-2 px-3 py-1.5 items-start">
                      <span className="text-[var(--text-muted)] shrink-0 opacity-60 tabular-nums">{m.time}</span>
                      <span className={`shrink-0 px-1 py-0.5 rounded text-[9px] font-bold uppercase ${badgeCls(m.type)}`}>
                        {m.type}
                      </span>
                      <span className={`break-all flex-1 ${
                        m.type === 'error' ? 'text-red-400' : m.type === 'warn' ? 'text-yellow-400' : m.type === 'info' ? 'text-[var(--color-primary)]' : 'text-[var(--text-main)]'
                      }`}>{m.text}</span>
                    </div>
                  ))}
                  <div ref={consoleEndRef} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col min-h-0 h-full">
            <div className="flex flex-wrap gap-1 px-2 py-1 border-b border-[var(--border-subtle)] shrink-0">
              {(['all', 'xhr', 'js', 'css', 'img'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setNetFilter(f)}
                  className={`px-2 py-0.5 rounded text-[9px] uppercase ${
                    netFilter === f ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredNet.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[var(--text-muted)]">No requests</div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]/30">
                  {filteredNet.map((r, i) => {
                    const st = r.response?.status ?? r.status;
                    const rowKey = `${r.method}|${i}|${r.url}`;
                    const open = expandedNetKey === rowKey;
                    return (
                      <div key={rowKey} className="hover:bg-[var(--bg-hover)]">
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
                          onClick={() => setExpandedNetKey(open ? null : rowKey)}
                        >
                          <span className={`shrink-0 font-bold w-9 tabular-nums ${statusColor(st)}`}>{st ?? '—'}</span>
                          <span className="shrink-0 text-[var(--text-muted)] w-11 uppercase text-[9px] opacity-80">{r.method}</span>
                          <span className="truncate text-[var(--text-main)] flex-1">{r.url}</span>
                          <span className="shrink-0 text-[var(--text-muted)] text-[9px] max-w-[80px] truncate">
                            {r.response?.headers?.['content-type'] ?? r.type ?? ''}
                          </span>
                        </button>
                        {open && (
                          <div className="px-3 pb-2 space-y-1 text-[9px] text-[var(--text-muted)] border-t border-[var(--border-subtle)]/40 bg-[var(--bg-elevated,var(--bg-panel))]/30">
                            <p className="break-all text-[var(--text-main)]">{r.url}</p>
                            <p>
                              <span className="opacity-70">Timing ms:</span>{' '}
                              <span className="text-[var(--text-main)]">—</span>
                            </p>
                            <pre className="whitespace-pre-wrap break-all max-h-24 overflow-y-auto bg-[var(--bg-app)] rounded p-1 border border-[var(--border-subtle)]">
                              {JSON.stringify({ request: { method: r.method, url: r.url }, responseHeaders: r.response?.headers ?? {} }, null, 0)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Iframe injection scripts ─────────────────────────────────────────────────

const PICKER_SCRIPT = `
(function() {
  if (window.__iamPickerActive) return;
  window.__iamPickerActive = true;
  let lastEl = null;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3a9fe8;background:rgba(58,159,232,0.08);z-index:2147483647;transition:all 0.1s;border-radius:2px;';
  document.body.appendChild(overlay);

  function getPath(el) {
    const parts = [];
    while (el && el !== document.body) {
      let sel = el.tagName.toLowerCase();
      if (el.id) sel += '#' + el.id;
      else if (el.className) sel += '.' + el.className.trim().split(/\\s+/)[0];
      parts.unshift(sel);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  document.addEventListener('mouseover', e => {
    const el = e.target;
    if (el === overlay) return;
    lastEl = el;
    const r = el.getBoundingClientRect();
    overlay.style.top    = r.top    + 'px';
    overlay.style.left   = r.left   + 'px';
    overlay.style.width  = r.width  + 'px';
    overlay.style.height = r.height + 'px';
  }, true);

  document.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const el = lastEl;
    if (!el) return;
    const r  = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const styles = {};
    ['color','background-color','font-size','font-family','font-weight',
     'display','position','width','height','margin','padding','border',
     'flex','flex-direction','gap','border-radius','box-shadow','opacity',
     'z-index','overflow','cursor','text-align','line-height'].forEach(p => {
      const v = cs.getPropertyValue(p);
      if (v) styles[p] = v;
    });
    window.parent.postMessage({
      type:    'iam-element-selected',
      element: {
        tag:        el.tagName.toLowerCase(),
        id:         el.id || null,
        className:  el.className || null,
        html:       el.outerHTML?.slice(0, 3000),
        path:       getPath(el),
        styles,
        boundingBox: { top: r.top, left: r.left, width: r.width, height: r.height },
      }
    }, '*');
  }, true);
})();
`;

// ─── Single Pane ──────────────────────────────────────────────────────────────

interface PaneProps {
  initialUrl?:     string;
  addressDisplay?: string | null;
  label?:          'A' | 'B';
  onClose?:        () => void;
  onSplit?:        (url: string) => void;
  isSplit?:        boolean;
  autoFocus?:      boolean;
  agentActive?:    boolean;
}

const BrowserPane: React.FC<PaneProps> = ({
  initialUrl,
  addressDisplay,
  label,
  onClose,
  onSplit,
  isSplit,
  autoFocus,
  agentActive = false,
}) => {
  const [iframeUrl,      setIframeUrl]      = useState(() => normalize(initialUrl || DEFAULT_URL));
  const [currentUrl,     setCurrentUrl]     = useState(() => normalize(initialUrl || DEFAULT_URL));
  const [inputVal,       setInputVal]       = useState(() => normalize(initialUrl || DEFAULT_URL));
  const [loading,        setLoading]        = useState(false);
  const [iframeBlocked,  setIframeBlocked]  = useState(false);
  const [mode,           setMode]           = useState<PaneMode>('browse');
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [zoom,           setZoom]           = useState(100);
  const [screenshotUrl,  setScreenshotUrl]  = useState<string | null>(null);
  const [screenshotErr,  setScreenshotErr]  = useState<string | null>(null);
  const [screenshotLoad, setScreenshotLoad] = useState(false);
  const [inspectedEl,    setInspectedEl]    = useState<InspectedElement | null>(null);
  const [trustRequest,   setTrustRequest]   = useState<TrustRequest | null>(null);
  const [sessionTrusted, setSessionTrusted] = useState<Set<string>>(new Set());
  const [area,           setArea]           = useState<AreaSelection | null>(null);
  const [devToolsOpen,   setDevToolsOpen]   = useState(false);
  const [devToolsWidth,  setDevToolsWidth]  = useState(40);
  const [devToolsTab,    setDevToolsTab]    = useState<DevToolsTab>('elements');
  const [toastMsg,       setToastMsg]       = useState<string | null>(null);

  const inputRef     = useRef<HTMLInputElement>(null);
  const menuRef      = useRef<HTMLDivElement>(null);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const areaOverRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const inspectSameOrigin = useMemo(() => {
    try {
      return new URL(currentUrl).origin === window.location.origin;
    } catch {
      return false;
    }
  }, [currentUrl]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = devToolsWidth;
    const containerWidth = containerRef.current?.offsetWidth ?? window.innerWidth;

    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      const newWidthPx = (startWidth / 100) * containerWidth + delta;
      const newWidthPct = Math.max(20, Math.min(70, (newWidthPx / containerWidth) * 100));
      setDevToolsWidth(newWidthPct);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Sync parent URL prop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const n = normalize(initialUrl);
    setIframeUrl(n);
    setCurrentUrl(n);
    setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(n) ? addressDisplay : n);
    setMode('browse');
    setScreenshotUrl(null);
    setScreenshotErr(null);
    setInspectedEl(null);
    setIframeBlocked(false);
  }, [initialUrl, addressDisplay]);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // ── Close menu on outside click ─────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  // ── Navigation sync + element picker (iframe postMessage) ───────────────────
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'iam-navigation' && typeof e.data?.url === 'string') {
        setCurrentUrl(e.data.url);
        setInputVal(e.data.url);
      }
      if (e.data?.type === 'iam-element-selected') {
        setInspectedEl(e.data.element);
        setDevToolsOpen(true);
        setDevToolsTab('elements');
        window.dispatchEvent(new CustomEvent('iam-agent-external-send', {
          detail: {
            message: `Inspected element: \`${e.data.element.tag}${e.data.element.id ? `#${e.data.element.id}` : ''}${e.data.element.className ? `.${e.data.element.className.split(' ')[0]}` : ''}\`\n\nPath: \`${e.data.element.path}\`\n\nKey styles:\n${Object.entries(e.data.element.styles || {}).slice(0, 8).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
          },
        }));
      }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  // ── Inject picker script when mode = picker ─────────────────────────────────
  useEffect(() => {
    if (mode !== 'picker') return;
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const s = doc.createElement('script');
      s.textContent = PICKER_SCRIPT;
      doc.head?.appendChild(s);
    } catch { /* cross-origin — can't inject, CDT tools handle instead */ }
  }, [mode, iframeUrl]);

  // ── Trust gate ──────────────────────────────────────────────────────────────
  const requestTrust = useCallback((url: string): Promise<TrustScope | null> =>
    new Promise(resolve => setTrustRequest({ url, resolve })),
  []);

  const navigate = useCallback(async (raw: string) => {
    const s = raw.trim();
    if (!s || isVirtual(s)) return;
    const n      = normalize(s);
    const origin = originOf(n);

    // Check trust
    if (!sessionTrusted.has(origin)) {
      const trusted = await checkTrust(origin);
      if (!trusted) {
        const scope = await requestTrust(n);
        if (!scope) return; // denied
        if (scope === 'persistent') await writeTrust(origin, 'persistent');
        setSessionTrusted(prev => new Set([...prev, origin]));
      } else {
        setSessionTrusted(prev => new Set([...prev, origin]));
      }
    }

    setIframeUrl(n);
    setCurrentUrl(n);
    setInputVal(n);
    setLoading(true);
    setMode('browse');
    setScreenshotUrl(null);
    setScreenshotErr(null);
    setInspectedEl(null);
    setIframeBlocked(false);
  }, [sessionTrusted, requestTrust]);

  // ── Screenshot (Playwright) ─────────────────────────────────────────────────
  const runScreenshot = useCallback(async (clip?: { x: number; y: number; width: number; height: number }) => {
    setMode('screenshot');
    setScreenshotLoad(true);
    setScreenshotUrl(null);
    setScreenshotErr(null);
    try {
      const endpoint = clip ? '/api/mcp/invoke' : '/api/playwright/screenshot';
      const body     = clip
        ? { tool_name: 'cdt_take_screenshot', params: { url: currentUrl, clip } }
        : { url: currentUrl };
      const res  = await fetch(endpoint, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify(body),
      });
      const data = await res.json();
      const url  = data.screenshot_url || data.screenshotUrl || data.result?.screenshot_url;
      if (!res.ok || !url) throw new Error(data.error || 'No screenshot URL returned');
      setScreenshotUrl(url);
    } catch (e) {
      setScreenshotErr(String(e));
    } finally {
      setScreenshotLoad(false);
    }
  }, [currentUrl]);

  // ── Hard reload ─────────────────────────────────────────────────────────────
  const hardReload = useCallback(() => {
    const current = iframeUrl;
    setIframeUrl('about:blank');
    setIframeBlocked(false);
    requestAnimationFrame(() => setTimeout(() => setIframeUrl(current), 50));
    setMenuOpen(false);
  }, [iframeUrl]);

  // ── Clear helpers ───────────────────────────────────────────────────────────
  const clearBrowserData = useCallback((what: 'history' | 'cookies' | 'cache') => {
    setMenuOpen(false);
    if (what === 'history') {
      hardReload();
      return;
    }
    if (what === 'cookies') {
      const script =
        'document.cookie.split(";").forEach(c=>{document.cookie=c.replace(/^ +/,"").replace(/=.*/,"=;expires="+new Date(0).toUTCString()+";path=/");});';
      try {
        const doc = iframeRef.current?.contentDocument;
        if (doc) {
          const s = doc.createElement('script');
          s.textContent = script;
          doc.documentElement.appendChild(s);
        } else {
          iframeRef.current?.contentWindow?.postMessage({ type: 'iam-exec', script }, '*');
        }
      } catch { /* ignore */ }
      hardReload();
      return;
    }
    setToastMsg('Reloading to clear cached assets…');
    window.setTimeout(() => setToastMsg(null), 2800);
    try {
      iframeRef.current?.contentWindow?.postMessage({ type: 'iam-exec', script: 'location.reload(true);' }, '*');
    } catch { /* ignore */ }
    try {
      iframeRef.current?.contentWindow?.location.reload();
    } catch { /* ignore */ }
  }, [hardReload]);

  // ── Copy URL ────────────────────────────────────────────────────────────────
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(currentUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* ignore */ }
    setMenuOpen(false);
  };

  // ── Area screenshot drag ────────────────────────────────────────────────────
  const startArea = (e: React.MouseEvent) => {
    if (mode !== 'area') return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setArea({ startX: e.clientX - r.left, startY: e.clientY - r.top, endX: e.clientX - r.left, endY: e.clientY - r.top, active: true });
  };
  const moveArea = (e: React.MouseEvent) => {
    if (!area?.active) return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setArea(a => a ? { ...a, endX: e.clientX - r.left, endY: e.clientY - r.top } : null);
  };
  const endArea = async () => {
    if (!area?.active) return;
    const x = Math.min(area.startX, area.endX);
    const y = Math.min(area.startY, area.endY);
    const w = Math.abs(area.endX - area.startX);
    const h = Math.abs(area.endY - area.startY);
    setArea(null);
    if (w > 10 && h > 10) await runScreenshot({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
    else setMode('browse');
  };

  const areaRect = area ? {
    left:   Math.min(area.startX, area.endX),
    top:    Math.min(area.startY, area.endY),
    width:  Math.abs(area.endX - area.startX),
    height: Math.abs(area.endY - area.startY),
  } : null;

  // ── Toggle mode ─────────────────────────────────────────────────────────────
  const toggleMode = (m: PaneMode) => {
    setMode(prev => prev === m ? 'browse' : m);
    if (m === 'area') setArea(null);
  };

  return (
    <div
      className="flex flex-col w-full h-full min-w-0 overflow-hidden transition-all duration-300"
      style={agentActive ? {
        boxShadow: '0 0 0 2px var(--color-primary), 0 0 24px 6px rgba(58,159,232,0.2)',
      } : undefined}
    >

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] shrink-0 min-w-0">

        {label && (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
            {label}
          </span>
        )}

        <ToolBtn
          icon={<RotateCcw size={12} strokeWidth={1.75} />}
          title="Reload"
          onClick={hardReload}
        />

        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            const n = normalizeUrl(inputVal);
            if (n) void navigate(n);
          }}
          placeholder="https://"
          spellCheck={false}
          aria-label="URL"
          className="flex-1 min-w-0 h-6 px-2 text-[11px] rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] focus:outline-none focus:border-[var(--color-primary)] font-mono text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
        />

        {onSplit && !isSplit && (
          <ToolBtn
            icon={<Columns2 size={12} strokeWidth={1.75} />}
            title="Split pane"
            onClick={() => onSplit(currentUrl)}
          />
        )}

        {/* Element Picker */}
        <ToolBtn
          icon={<MousePointer2 size={12} strokeWidth={1.75} />}
          title="Element picker — hover to highlight, click to inspect"
          active={mode === 'picker'}
          onClick={() => toggleMode('picker')}
        />

        {/* DevTools */}
        <ToolBtn
          icon={<Bug size={12} strokeWidth={1.75} />}
          title="DevTools — Elements, Console, Network"
          active={devToolsOpen}
          onClick={() => setDevToolsOpen(v => !v)}
        />

        <ToolBtn
          icon={<Layers size={12} strokeWidth={1.75} />}
          title="Open Elements inspector"
          active={devToolsOpen && devToolsTab === 'elements'}
          onClick={() => { setDevToolsOpen(true); setDevToolsTab('elements'); }}
        />

        {/* ... menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <ToolBtn
            icon={<MoreHorizontal size={12} strokeWidth={1.75} />}
            title="More options"
            active={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          />
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated,var(--bg-panel))] shadow-2xl py-1.5 z-[9999] overflow-hidden">

              <button type="button" onClick={() => { setMenuOpen(false); runScreenshot(); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                <Camera size={12} className="text-[var(--text-muted)] shrink-0" /> Take Screenshot
              </button>

              <button type="button" onClick={() => { setMenuOpen(false); toggleMode('area'); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                <Camera size={12} className="text-[var(--text-muted)] shrink-0" /> Capture Area Screenshot
              </button>

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              <button type="button" onClick={hardReload}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                <RotateCcw size={12} className="text-[var(--text-muted)] shrink-0" /> Hard Reload
              </button>

              <button type="button" onClick={copyUrl}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors text-left">
                {copied ? <CheckCircle size={12} className="text-green-400 shrink-0" /> : <Copy size={12} className="text-[var(--text-muted)] shrink-0" />}
                {copied ? 'Copied!' : 'Copy Current URL'}
              </button>

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              {/* Zoom */}
              <div className="flex items-center gap-2 px-3 py-1.5">
                <button type="button" onClick={() => setZoom(z => Math.max(25, z - 25))}
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors">
                  <ZoomOut size={12} />
                </button>
                <span className="flex-1 text-center text-[11px] font-mono text-[var(--text-main)]">{zoom}%</span>
                <button type="button" onClick={() => setZoom(z => Math.min(200, z + 25))}
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors">
                  <ZoomIn size={12} />
                </button>
              </div>

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              <button type="button" onClick={() => clearBrowserData('history')}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors text-left">
                <Trash2 size={12} className="shrink-0" /> Clear Browsing History
              </button>
              <button type="button" onClick={() => clearBrowserData('cookies')}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors text-left">
                <Cookie size={12} className="shrink-0" /> Clear Cookies
              </button>
              <button type="button" onClick={() => clearBrowserData('cache')}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors text-left">
                <HardDrive size={12} className="shrink-0" /> Clear Cache
              </button>

              {onClose && (
                <>
                  <div className="h-px bg-[var(--border-subtle)] my-1" />
                  <button type="button" onClick={() => { onClose(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors text-left">
                    <X size={12} className="shrink-0" /> Close Pane
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {onClose && (
          <ToolBtn icon={<X size={12} strokeWidth={1.75} />} title="Close pane" danger onClick={onClose} />
        )}
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="h-[2px] w-full bg-[var(--border-subtle)] shrink-0 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-[var(--color-primary)] animate-[progress_1.5s_ease-in-out_infinite]" style={{ width: '40%' }} />
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

      {/* Browser + DevTools */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-1 flex overflow-hidden min-h-0" ref={containerRef}>
          <div
            className="flex flex-col overflow-hidden min-h-0 min-w-0"
            style={{ width: devToolsOpen ? `${100 - devToolsWidth}%` : '100%' }}
          >
            <div
              className={`flex flex-1 min-h-0 overflow-hidden relative flex-col ${mode === 'area' ? 'cursor-crosshair' : ''}`}
              ref={areaOverRef}
              onMouseDown={mode === 'area' ? startArea : undefined}
              onMouseMove={mode === 'area' ? moveArea : undefined}
              onMouseUp={mode === 'area' ? endArea : undefined}
            >
              <div className="flex flex-1 min-h-0 relative flex-col">
                <iframe
                  ref={iframeRef}
                  key={iframeUrl}
                  src={iframeUrl}
                  title="Embedded browser"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-modals"
                  style={{ zoom: zoom !== 100 ? zoom / 100 : undefined }}
                  className={`w-full flex-1 min-h-0 border-0 bg-white transition-opacity duration-150 ${
                    mode === 'browse' && !iframeBlocked ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                  onLoad={() => {
                    setLoading(false);
                    try {
                      const u = iframeRef.current?.contentWindow?.location?.href;
                      if (u && u !== 'about:blank') {
                        setCurrentUrl(u);
                        setInputVal(u);
                      }
                    } catch { /* cross-origin */ }
                  }}
                  onError={() => { setLoading(false); setIframeBlocked(true); }}
                />

                {iframeBlocked && mode === 'browse' && (
                  <div className="absolute top-0 left-0 right-0 bottom-0 z-10 flex flex-col min-h-0 bg-[var(--bg-app)]">
                    <BlockedPage url={currentUrl} onScreenshot={runScreenshot} />
                  </div>
                )}

                {mode === 'area' && (
                  <div className="absolute top-0 left-0 right-0 bottom-0 z-20 bg-black/20">
                    <p className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-white bg-black/60 px-2 py-1 rounded-md">
                      Drag to select area
                    </p>
                    {areaRect && areaRect.width > 0 && (
                      <div
                        className="absolute border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                        style={{ left: areaRect.left, top: areaRect.top, width: areaRect.width, height: areaRect.height }}
                      />
                    )}
                  </div>
                )}

                {mode === 'screenshot' && (
                  <div className="absolute top-0 left-0 right-0 bottom-0 z-10 flex flex-col bg-[var(--bg-app)] overflow-auto min-h-0">
                    {screenshotLoad ? (
                      <div className="flex flex-col items-center justify-center flex-1 gap-3">
                        <Loader2 size={18} className="animate-spin text-[var(--color-primary)]" />
                        <p className="text-[11px] text-[var(--text-muted)]">Capturing via Playwright...</p>
                      </div>
                    ) : screenshotErr ? (
                      <div className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={13} className="text-red-400" />
                          <span className="text-[11px] font-semibold text-red-400">Capture failed</span>
                          <button type="button" onClick={() => setMode('browse')} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] underline">Back</button>
                        </div>
                        <pre className="text-[10px] text-red-400 font-mono bg-[var(--bg-panel)] rounded p-3 whitespace-pre-wrap">{screenshotErr}</pre>
                      </div>
                    ) : screenshotUrl ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={13} className="text-green-400" />
                          <span className="text-[11px] font-semibold text-[var(--text-main)]">Screenshot captured</span>
                          <button type="button" onClick={() => setMode('browse')} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] underline">Back</button>
                        </div>
                        <img src={screenshotUrl} alt="screenshot" className="w-full rounded-lg border border-[var(--border-subtle)]" />
                      </div>
                    ) : null}
                  </div>
                )}

                {mode === 'picker' && !inspectedEl && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-primary)] text-white text-[10px] font-semibold shadow-lg">
                      <MousePointer2 size={10} />
                      Hover to highlight — click to inspect
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {devToolsOpen && (
            <>
              <div
                className="w-1 bg-[var(--border-subtle)] cursor-col-resize shrink-0 hover:bg-[var(--color-primary)] transition-colors"
                onMouseDown={startResize}
                role="separator"
                aria-orientation="vertical"
              />
              <div
                className="flex flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-elevated,var(--bg-panel))] overflow-hidden min-h-0 min-w-0"
                style={{ width: `${devToolsWidth}%`, minWidth: 280, maxWidth: '70%' }}
              >
                <DevToolsPanel
                  url={currentUrl}
                  onClose={() => setDevToolsOpen(false)}
                  tab={devToolsTab}
                  onTabChange={setDevToolsTab}
                  inspectedElement={inspectedEl}
                  inspectSameOrigin={inspectSameOrigin}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {toastMsg && (
        <div className="shrink-0 px-3 py-1.5 text-center text-[10px] bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] text-[var(--text-muted)]">
          {toastMsg}
        </div>
      )}

      {/* Permission Gate */}
      {trustRequest && (
        <PermissionGate
          request={trustRequest}
          onDeny={() => { trustRequest.resolve(null); setTrustRequest(null); }}
          onAllowOnce={() => { trustRequest.resolve('session'); setTrustRequest(null); }}
          onAlwaysAllow={() => { trustRequest.resolve('persistent'); setTrustRequest(null); }}
        />
      )}
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────

interface BrowserViewProps {
  url?:            string;
  addressDisplay?: string | null;
  /** When false, no collab HTTP probe or WebSocket (avoids IAM_COLLAB churn when panel is hidden). */
  isActive?:       boolean;
}

export const BrowserView: React.FC<BrowserViewProps> = ({
  url: urlFromParent,
  addressDisplay,
  isActive = false,
}) => {
  const [primaryUrl,    setPrimaryUrl]    = useState(urlFromParent || DEFAULT_URL);
  const [secondaryUrl,  setSecondaryUrl]  = useState<string | null>(null);
  const [agentActive,   setAgentActive]   = useState(false);

  useEffect(() => { if (urlFromParent?.trim()) setPrimaryUrl(urlFromParent); }, [urlFromParent]);

  // ── Window event listeners (Agent Sam navigation) ───────────────────────────
  useEffect(() => {
    const onPrimary   = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url;
      if (url) setPrimaryUrl(url);
    };
    const onSecondary = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url;
      if (url) setSecondaryUrl(url);
    };
    window.addEventListener('iam-browser-navigate',           onPrimary);
    window.addEventListener('iam-browser-navigate-secondary', onSecondary);
    return () => {
      window.removeEventListener('iam-browser-navigate',           onPrimary);
      window.removeEventListener('iam-browser-navigate-secondary', onSecondary);
    };
  }, []);

  // ── WebSocket bridge to IAM_COLLAB (exponential backoff; no retry storm on stub/503) ─
  const [collabBridge, setCollabBridge] = useState<'live' | 'offline' | 'unavailable'>('live');

  useEffect(() => {
    if (!isActive) {
      setCollabBridge('live');
      return;
    }

    const host = window.location.host;
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/api/collab/room/browser`;
    const httpProbeUrl = `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}/api/collab/room/browser`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempts = 0;
    const maxReconnects = 5;
    const delayMs = (n: number) =>
      n <= 0 ? 5000 : n === 1 ? 15000 : n === 2 ? 60000 : 300000;

    let cancelled = false;

    const stopReconnects = (reason: 'offline' | 'unavailable') => {
      setCollabBridge(reason);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectAttempts >= maxReconnects) {
        if (reconnectAttempts >= maxReconnects) stopReconnects('offline');
        return;
      }
      const wait = delayMs(reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => void connect(), wait);
    };

    const connect = async () => {
      if (cancelled) return;

      try {
        const probe = await fetch(httpProbeUrl, { credentials: 'same-origin', cache: 'no-store' });
        if (probe.status === 503) {
          stopReconnects('unavailable');
          return;
        }
        if (probe.status === 204) {
          stopReconnects('unavailable');
          return;
        }
      } catch {
        stopReconnects('unavailable');
        return;
      }

      if (cancelled) return;

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          switch (msg.type) {
            case 'navigate':
              if (msg.url) setPrimaryUrl(msg.url);
              break;
            case 'screenshot':
              if (msg.screenshot_url) {
                window.dispatchEvent(new CustomEvent('iam-browser-screenshot', {
                  detail: { screenshot_url: msg.screenshot_url },
                }));
              }
              break;
            case 'agent_active':
              setAgentActive(!!msg.active);
              break;
            case 'job_update':
              if (msg.status === 'running') setAgentActive(true);
              if (msg.status === 'completed' || msg.status === 'failed') setAgentActive(false);
              break;
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {};
      ws.onopen = () => {
        setCollabBridge('live');
        reconnectAttempts = 0;
      };
      ws.onclose = () => {
        ws = null;
        if (cancelled) return;
        scheduleReconnect();
      };
    };

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch { /* ignore */ }
    };
  }, [isActive]);

  return (
    <div className="flex w-full h-full overflow-hidden bg-[var(--bg-app)] flex-col">
      {collabBridge !== 'live' && (
        <div
          className="shrink-0 px-2 py-1 text-[11px] text-center border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
          role="status"
        >
          {collabBridge === 'unavailable'
            ? 'Collaboration bridge unavailable (live sync off).'
            : 'Collaboration offline — live browser sync paused.'}
        </div>
      )}
      <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      <div className={`flex flex-col min-h-0 min-w-0 overflow-hidden transition-all duration-200 ${
        secondaryUrl ? 'w-1/2 border-r border-[var(--border-subtle)]' : 'w-full'
      }`}>
        <BrowserPane
          initialUrl={primaryUrl}
          addressDisplay={addressDisplay}
          label={secondaryUrl ? 'A' : undefined}
          isSplit={!!secondaryUrl}
          onSplit={url => setSecondaryUrl(url)}
          agentActive={agentActive}
        />
      </div>
      {secondaryUrl && (
        <div className="flex flex-col w-1/2 min-h-0 min-w-0 overflow-hidden">
          <BrowserPane
            initialUrl={secondaryUrl}
            label="B"
            isSplit
            onClose={() => setSecondaryUrl(null)}
            autoFocus
            agentActive={agentActive}
          />
        </div>
      )}
      </div>
    </div>
  );
};

export default BrowserView;
