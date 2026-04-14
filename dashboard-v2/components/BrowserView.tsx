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
  useState, useEffect, useCallback, useRef,
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

function isVirtual(url: string): boolean {
  return /^(r2:|github:|local:|preview:)/i.test(url);
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaneMode = 'browse' | 'components' | 'devtools' | 'picker' | 'screenshot' | 'area';
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
      body:        JSON.stringify({ origin, scope }),
    });
  } catch { /* non-blocking */ }
}

// ─── MCP tool invoke ─────────────────────────────────────────────────────────

async function invokeCdt(tool_name: string, args: Record<string, unknown>) {
  const r = await fetch('/api/mcp/invoke', {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body:        JSON.stringify({ tool_name, args }),
  });
  return r.json().catch(() => ({ ok: false, error: 'parse error' }));
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
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
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--bg-app)]">
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

// ─── DevTools Panel ───────────────────────────────────────────────────────────

const DevToolsPanel: React.FC<{
  url:      string;
  onClose:  () => void;
}> = ({ url, onClose }) => {
  const [tab,      setTab]      = useState<'console' | 'network'>('console');
  const [loading,  setLoading]  = useState(false);
  const [console_, setConsole_] = useState<ConsoleMsg[]>([]);
  const [network,  setNetwork]  = useState<NetworkReq[]>([]);
  const [ran,      setRan]      = useState(false);

  const run = useCallback(async () => {
    if (!url || ran) return;
    setLoading(true);
    setRan(true);
    try {
      const [cons, net] = await Promise.all([
        invokeCdt('cdt_console_list_messages', { url }),
        invokeCdt('cdt_network_list_requests', { url }),
      ]);
      setConsole_(Array.isArray(cons?.messages) ? cons.messages : []);
      setNetwork(Array.isArray(net?.requests)   ? net.requests  : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [url, ran]);

  useEffect(() => { run(); }, [run]);

  const typeColor = (t: string) =>
    t === 'error' ? 'text-red-400' : t === 'warn' ? 'text-yellow-400' : 'text-[var(--text-main)]';

  const statusColor = (s?: number) => {
    if (!s) return 'text-[var(--text-muted)]';
    if (s < 300) return 'text-green-400';
    if (s < 400) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--bg-app)] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border-subtle)] shrink-0">
        {(['console', 'network'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-widest border-b-2 transition-colors ${
              tab === t
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {t === 'console' ? <Terminal size={11} /> : <Network size={11} />}
            {t}
            {t === 'console' && console_.filter(m => m.type === 'error').length > 0 && (
              <span className="ml-1 px-1 rounded text-[9px] bg-red-500/20 text-red-400 font-bold">
                {console_.filter(m => m.type === 'error').length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setRan(false)}
          title="Refresh"
          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] rounded transition-colors"
        >
          <RotateCcw size={11} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors mr-1"
        >
          <X size={11} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto font-mono text-[10px] min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" />
            <span>Running CDT tools...</span>
          </div>
        ) : tab === 'console' ? (
          console_.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">No console messages</div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]/30">
              {console_.map((m, i) => (
                <div key={i} className={`flex gap-2 px-3 py-1.5 ${typeColor(m.type)}`}>
                  <span className="text-[var(--text-muted)] shrink-0 opacity-60">{m.time}</span>
                  <span className="uppercase shrink-0 opacity-70 w-8">{m.type.slice(0, 4)}</span>
                  <span className="break-all">{m.text}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          network.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">No requests captured</div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]/30">
              {network.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)]">
                  <span className={`shrink-0 font-bold w-8 ${statusColor(r.status)}`}>{r.status ?? '—'}</span>
                  <span className="shrink-0 text-[var(--text-muted)] w-10 uppercase opacity-70">{r.method}</span>
                  <span className="shrink-0 text-[var(--text-muted)] w-16 opacity-70">{r.type}</span>
                  <span className="truncate text-[var(--text-main)]">{r.url}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

// ─── Components Panel (CSS Inspector) ────────────────────────────────────────

const ComponentsPanel: React.FC<{
  element: InspectedElement | null;
  onClose: () => void;
}> = ({ element, onClose }) => (
  <div className="absolute inset-0 z-10 flex flex-col bg-[var(--bg-app)] overflow-hidden">
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
      <Layers size={12} className="text-[var(--color-primary)]" />
      <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-main)]">
        Components
      </span>
      {element && (
        <span className="ml-1 text-[10px] font-mono text-[var(--text-muted)]">
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
        {/* Element info */}
        <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
          <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-1">Element</p>
          <code className="text-[10px] font-mono text-[var(--color-primary)] break-all">
            {`<${element.tag}${element.id ? ` id="${element.id}"` : ''}${element.className ? ` class="${element.className}"` : ''}>`}
          </code>
          <p className="text-[9px] font-mono text-[var(--text-muted)] mt-1 opacity-60">{element.path}</p>
        </div>

        {/* Computed styles */}
        <div className="px-3 py-2">
          <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2">Computed Styles</p>
          <div className="space-y-1">
            {Object.entries(element.styles)
              .filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto')
              .slice(0, 40)
              .map(([prop, val]) => (
                <div key={prop} className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-[var(--text-muted)] shrink-0 w-32 truncate">{prop}</span>
                  <span className="text-[var(--text-main)] truncate">{val}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Bounding box */}
        {element.boundingBox && (
          <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
            <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] mb-2">Position & Size</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-[10px]">
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

  const inputRef    = useRef<HTMLInputElement>(null);
  const menuRef     = useRef<HTMLDivElement>(null);
  const iframeRef   = useRef<HTMLIFrameElement>(null);
  const areaOverRef = useRef<HTMLDivElement>(null);

  // ── Sync parent URL prop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const n = normalize(initialUrl);
    setIframeUrl(n);
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

  // ── Element picker — listen for iframe postMessage ──────────────────────────
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'iam-element-selected') {
        setInspectedEl(e.data.element);
        setMode('components');
        // Dispatch to chat
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
        ? { tool_name: 'cdt_capture_area_screenshot', args: { url: iframeUrl, ...clip } }
        : { url: iframeUrl };
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
  }, [iframeUrl]);

  // ── Hard reload ─────────────────────────────────────────────────────────────
  const hardReload = useCallback(() => {
    const current = iframeUrl;
    setIframeUrl('about:blank');
    setIframeBlocked(false);
    requestAnimationFrame(() => setTimeout(() => setIframeUrl(current), 50));
    setMenuOpen(false);
  }, [iframeUrl]);

  // ── Clear helpers ───────────────────────────────────────────────────────────
  const clearBrowserData = useCallback(async (what: 'history' | 'cookies' | 'cache') => {
    setMenuOpen(false);
    const toolMap = { cookies: 'cdt_clear_cookies', cache: 'cdt_clear_cache', history: 'cdt_clear_cache' };
    await invokeCdt(toolMap[what], { url: iframeUrl }).catch(() => {});
    hardReload();
  }, [iframeUrl, hardReload]);

  // ── Copy URL ────────────────────────────────────────────────────────────────
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(iframeUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
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
          onKeyDown={e => e.key === 'Enter' && navigate(inputVal)}
          placeholder="https://"
          spellCheck={false}
          aria-label="URL"
          className="flex-1 min-w-0 h-6 px-2 text-[11px] rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] focus:outline-none focus:border-[var(--color-primary)] font-mono text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
        />

        {onSplit && !isSplit && (
          <ToolBtn
            icon={<Columns2 size={12} strokeWidth={1.75} />}
            title="Split pane"
            onClick={() => onSplit(iframeUrl)}
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
          title="DevTools — console & network"
          active={mode === 'devtools'}
          onClick={() => toggleMode('devtools')}
        />

        {/* Components / CSS Inspector */}
        <ToolBtn
          icon={<Layers size={12} strokeWidth={1.75} />}
          title="Components — CSS inspector"
          active={mode === 'components'}
          onClick={() => toggleMode('components')}
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

      {/* Content area */}
      <div
        className={`flex-1 relative min-h-0 overflow-hidden ${mode === 'area' ? 'cursor-crosshair' : ''}`}
        ref={areaOverRef}
        onMouseDown={mode === 'area' ? startArea : undefined}
        onMouseMove={mode === 'area' ? moveArea : undefined}
        onMouseUp={mode === 'area' ? endArea : undefined}
      >

        {/* Iframe */}
        <iframe
          ref={iframeRef}
          key={iframeUrl}
          src={iframeUrl}
          title="Embedded browser"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-modals"
          style={{ zoom: zoom !== 100 ? zoom / 100 : undefined }}
          className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${
            mode === 'browse' && !iframeBlocked ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setIframeBlocked(true); }}
        />

        {/* Blocked fallback */}
        {iframeBlocked && mode === 'browse' && (
          <BlockedPage url={iframeUrl} onScreenshot={runScreenshot} />
        )}

        {/* Area screenshot selection overlay */}
        {mode === 'area' && (
          <div className="absolute inset-0 z-20 bg-black/20">
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

        {/* Screenshot result */}
        {mode === 'screenshot' && (
          <div className="absolute inset-0 z-10 bg-[var(--bg-app)] overflow-auto">
            {screenshotLoad ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 size={18} className="animate-spin text-[var(--color-primary)]" />
                <p className="text-[11px] text-[var(--text-muted)]">Capturing via Playwright...</p>
              </div>
            ) : screenshotErr ? (
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={13} className="text-red-400" />
                  <span className="text-[11px] font-semibold text-red-400">Capture failed</span>
                  <button onClick={() => setMode('browse')} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] underline">Back</button>
                </div>
                <pre className="text-[10px] text-red-400 font-mono bg-[var(--bg-panel)] rounded p-3 whitespace-pre-wrap">{screenshotErr}</pre>
              </div>
            ) : screenshotUrl ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={13} className="text-green-400" />
                  <span className="text-[11px] font-semibold text-[var(--text-main)]">Screenshot captured</span>
                  <button onClick={() => setMode('browse')} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] underline">Back</button>
                </div>
                <img src={screenshotUrl} alt="screenshot" className="w-full rounded-lg border border-[var(--border-subtle)]" />
              </div>
            ) : null}
          </div>
        )}

        {/* DevTools panel */}
        {mode === 'devtools' && (
          <DevToolsPanel url={iframeUrl} onClose={() => setMode('browse')} />
        )}

        {/* Components / CSS inspector panel */}
        {mode === 'components' && (
          <ComponentsPanel element={inspectedEl} onClose={() => setMode('browse')} />
        )}

        {/* Picker overlay hint */}
        {mode === 'picker' && !inspectedEl && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-primary)] text-white text-[10px] font-semibold shadow-lg">
              <MousePointer2 size={10} />
              Hover to highlight — click to inspect
            </div>
          </div>
        )}
      </div>

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
}

export const BrowserView: React.FC<BrowserViewProps> = ({ url: urlFromParent, addressDisplay }) => {
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

  // ── WebSocket bridge to IAM_COLLAB ──────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/collab/room/browser`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          switch (msg.type) {
            case 'navigate':
              if (msg.url) setPrimaryUrl(msg.url);
              break;
            case 'screenshot':
              if (msg.screenshot_url) {
                // Surface to primary pane via event
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

      ws.onerror  = () => {};
      ws.onclose  = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
    };
  }, []);

  return (
    <div className="flex w-full h-full overflow-hidden bg-[var(--bg-app)]">
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
  );
};

export default BrowserView;
