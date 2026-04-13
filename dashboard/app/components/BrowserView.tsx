/**
 * BrowserView.tsx
 *
 * Embedded browser panel with Cursor-style toolbar.
 *
 * Toolbar icons (right side of URL bar):
 *   Split pane  — opens dual pane A/B
 *   Arrow/cursor — element inspector via Playwright
 *   </> — page console / source viewer
 *   Camera — Playwright screenshot
 *   ... — menu: Open in new tab, Copy URL, Hard reload
 *
 * Agent Sam drives navigation via window events:
 *   iam-browser-navigate           → primary pane
 *   iam-browser-navigate-secondary → secondary pane (auto-opens split)
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from 'react';
import {
  RotateCcw, ExternalLink, Copy, Columns2, X,
  Loader2, CheckCircle, AlertTriangle, Camera,
  MoreHorizontal, MousePointer2, Code2, Globe,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

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
    return DEFAULT_URL;
  }
  return s;
}

function isVirtual(url: string): boolean {
  return /^(r2:|github:|local:|preview:)/i.test(url);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaneMode = 'browse' | 'playwright' | 'console' | 'inspect';

interface PlaywrightResult {
  ok:             boolean;
  screenshotUrl?: string;
  error?:         string;
}

interface ConsoleEntry {
  type:    'log' | 'error' | 'warn' | 'info';
  message: string;
  time:    string;
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

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
    className={`p-1.5 rounded transition-colors shrink-0 ${
      active
        ? 'text-[var(--color-primary)] bg-[var(--color-primary-muted)]'
        : danger
          ? 'text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
    } disabled:opacity-30 disabled:cursor-default`}
  >
    {icon}
  </button>
);

// ─── Menu item ────────────────────────────────────────────────────────────────

const MenuItem: React.FC<{
  icon:    React.ReactNode;
  label:   string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon, label, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] transition-colors text-left ${
      danger
        ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]'
        : 'text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
    }`}
  >
    <span className="shrink-0 text-[var(--text-muted)]">{icon}</span>
    {label}
  </button>
);

// ─── Single pane ──────────────────────────────────────────────────────────────

interface PaneProps {
  initialUrl?:     string;
  addressDisplay?: string | null;
  label?:          'A' | 'B';
  onClose?:        () => void;
  onSplit?:        (url: string) => void;
  isSplit?:        boolean;
  autoFocus?:      boolean;
}

const BrowserPane: React.FC<PaneProps> = ({
  initialUrl,
  addressDisplay,
  label,
  onClose,
  onSplit,
  isSplit,
  autoFocus,
}) => {
  const [iframeUrl,  setIframeUrl]  = useState(() => normalize(initialUrl || DEFAULT_URL));
  const [inputVal,   setInputVal]   = useState(() => normalize(initialUrl || DEFAULT_URL));
  const [loading,    setLoading]    = useState(false);
  const [mode,       setMode]       = useState<PaneMode>('browse');
  const [pwResult,   setPwResult]   = useState<PlaywrightResult | null>(null);
  const [pwLoading,  setPwLoading]  = useState(false);
  const [console_,   setConsole_]   = useState<ConsoleEntry[]>([]);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [inspectEl,  setInspectEl]  = useState<string | null>(null);
  const [pageSource, setPageSource] = useState<string | null>(null);

  const inputRef  = useRef<HTMLInputElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const n       = normalize(initialUrl);
    const display = addressDisplay?.trim();
    setIframeUrl(n);
    setInputVal(display && /^(blob:|data:)/i.test(n) ? display : n);
    setMode('browse');
    setPwResult(null);
  }, [initialUrl, addressDisplay]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.data?.type === 'iam-console') {
        setConsole_(prev => [...prev.slice(-99), {
          type:    e.data.level || 'log',
          message: String(e.data.message || ''),
          time:    new Date().toLocaleTimeString(),
        }]);
      }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  const navigate = useCallback((raw: string) => {
    const s = raw.trim();
    if (!s || isVirtual(s)) return;
    const n = normalize(s);
    setIframeUrl(n);
    setInputVal(n);
    setLoading(true);
    setMode('browse');
    setPwResult(null);
    setPageSource(null);
  }, []);

  const runPlaywright = async () => {
    setPwLoading(true);
    setMode('playwright');
    setPwResult(null);
    try {
      const res  = await fetch('/api/playwright/screenshot', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify({ url: iframeUrl }),
      });
      const data = await res.json();
      setPwResult({ ok: res.ok, screenshotUrl: data.screenshotUrl || data.url, error: data.error });
    } catch (e) {
      setPwResult({ ok: false, error: String(e) });
    } finally {
      setPwLoading(false);
    }
  };

  const runInspect = async (selector = 'body') => {
    setMode('inspect');
    setInspectEl(null);
    try {
      const res  = await fetch('/api/playwright/inspect', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify({ url: iframeUrl, selector }),
      });
      const data = await res.json();
      setInspectEl(data.html || data.result || JSON.stringify(data, null, 2));
    } catch (e) {
      setInspectEl(`Error: ${String(e)}`);
    }
  };

  const fetchSource = async () => {
    setMode('console');
    if (pageSource) return;
    try {
      const res = await fetch(iframeUrl);
      const txt = await res.text();
      setPageSource(txt);
    } catch {
      setPageSource('Could not fetch page source (CORS or network error)');
    }
  };

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(iframeUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* ignore */ }
    setMenuOpen(false);
  };

  const openExternal = () => {
    if (!isVirtual(iframeUrl)) window.open(iframeUrl, '_blank', 'noopener,noreferrer');
    setMenuOpen(false);
  };

  const hardReload = () => {
    setIframeUrl('about:blank');
    requestAnimationFrame(() => setIframeUrl(iframeUrl));
    setMenuOpen(false);
  };

  return (
    <div className="flex flex-col w-full h-full min-w-0 overflow-hidden">

      {/* ── URL bar ── */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] shrink-0 min-w-0">

        {label && (
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
            {label}
          </span>
        )}

        <ToolBtn icon={<RotateCcw size={12} strokeWidth={1.75} />} title="Reload" onClick={hardReload} />

        <ToolBtn
          icon={<Globe size={12} strokeWidth={1.75} />}
          title="Browse"
          active={mode === 'browse'}
          onClick={() => { setMode('browse'); setPwResult(null); }}
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

        {/* Split pane — only show when not already split */}
        {onSplit && !isSplit && (
          <ToolBtn
            icon={<Columns2 size={12} strokeWidth={1.75} />}
            title="Split pane"
            onClick={() => onSplit(iframeUrl)}
          />
        )}

        {/* Element inspector */}
        <ToolBtn
          icon={<MousePointer2 size={12} strokeWidth={1.75} />}
          title="Inspect element"
          active={mode === 'inspect'}
          onClick={() => mode === 'inspect' ? setMode('browse') : runInspect()}
        />

        {/* Console / source */}
        <ToolBtn
          icon={<Code2 size={12} strokeWidth={1.75} />}
          title="Console / source"
          active={mode === 'console'}
          onClick={() => mode === 'console' ? setMode('browse') : fetchSource()}
        />

        {/* Screenshot */}
        <ToolBtn
          icon={pwLoading
            ? <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
            : <Camera  size={12} strokeWidth={1.75} />
          }
          title="Playwright screenshot"
          active={mode === 'playwright'}
          disabled={pwLoading}
          onClick={runPlaywright}
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
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl py-1" style={{ zIndex: 9999 }}>
              <MenuItem icon={<ExternalLink size={12} />} label="Open in new tab" onClick={openExternal} />
              <MenuItem
                icon={copied ? <CheckCircle size={12} /> : <Copy size={12} />}
                label={copied ? 'Copied!' : 'Copy URL'}
                onClick={copyUrl}
              />
              <MenuItem icon={<RotateCcw size={12} />} label="Hard reload" onClick={hardReload} />
              {onClose && (
                <>
                  <div className="h-px bg-[var(--border-subtle)] my-1" />
                  <MenuItem icon={<X size={12} />} label="Close pane" onClick={() => { onClose(); setMenuOpen(false); }} danger />
                </>
              )}
            </div>
          )}
        </div>

        {onClose && (
          <ToolBtn
            icon={<X size={12} strokeWidth={1.75} />}
            title="Close pane"
            danger
            onClick={onClose}
          />
        )}
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="h-[2px] w-full bg-[var(--border-subtle)] shrink-0 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1/3 bg-[var(--color-primary)] animate-progress" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 relative min-h-0 overflow-hidden">

        <iframe
          ref={iframeRef}
          key={iframeUrl}
          src={iframeUrl}
          className={`absolute inset-0 w-full h-full border-0 bg-white transition-opacity duration-150 ${
            mode === 'browse' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          title="Embedded browser"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          onLoad={() => setLoading(false)}
        />

        {/* Playwright screenshot */}
        {mode === 'playwright' && (
          <div className="absolute inset-0 bg-[var(--bg-app)] overflow-auto z-10">
            {pwLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
                <p className="text-[11px] text-[var(--text-muted)]">Capturing screenshot...</p>
              </div>
            ) : pwResult && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  {pwResult.ok
                    ? <CheckCircle  size={13} className="text-[var(--color-success)]" />
                    : <AlertTriangle size={13} className="text-[var(--color-danger)]" />
                  }
                  <span className="text-[11px] font-semibold text-[var(--text-main)]">
                    {pwResult.ok ? 'Screenshot captured' : 'Capture failed'}
                  </span>
                  <button onClick={() => setMode('browse')} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] underline">
                    Back to browser
                  </button>
                </div>
                {pwResult.screenshotUrl && (
                  <img src={pwResult.screenshotUrl} alt="screenshot" className="w-full rounded-lg border border-[var(--border-subtle)]" />
                )}
                {pwResult.error && (
                  <pre className="text-[10px] text-[var(--color-danger)] font-mono bg-[var(--bg-panel)] rounded p-3 overflow-auto whitespace-pre-wrap">
                    {pwResult.error}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* Element inspector */}
        {mode === 'inspect' && (
          <div className="absolute inset-0 bg-[var(--bg-app)] z-10 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
              <MousePointer2 size={12} className="text-[var(--color-primary)]" />
              <span className="text-[11px] font-semibold text-[var(--text-main)]">Element Inspector</span>
              <button onClick={() => setMode('browse')} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] underline">Close</button>
            </div>
            <div className="flex gap-2 px-3 py-2 shrink-0">
              <input
                type="text"
                placeholder="CSS selector — h1, .nav, #root"
                defaultValue="body"
                className="flex-1 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-[var(--color-primary)] text-[var(--text-main)]"
                onKeyDown={e => e.key === 'Enter' && runInspect((e.target as HTMLInputElement).value)}
              />
              <button
                onClick={e => runInspect(((e.currentTarget as HTMLElement).previousSibling as HTMLInputElement)?.value)}
                className="px-3 py-1 bg-[var(--color-primary)] text-black rounded text-[11px] font-semibold hover:opacity-90"
              >
                Inspect
              </button>
            </div>
            <div className="flex-1 overflow-auto px-3 pb-3">
              {inspectEl === null
                ? <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-[var(--text-muted)]" /></div>
                : <pre className="text-[10px] font-mono text-[var(--text-main)] bg-[var(--bg-panel)] rounded p-3 overflow-auto whitespace-pre-wrap border border-[var(--border-subtle)]">{inspectEl}</pre>
              }
            </div>
          </div>
        )}

        {/* Console / source */}
        {mode === 'console' && (
          <div className="absolute inset-0 bg-[var(--bg-app)] z-10 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
              <Code2 size={12} className="text-[var(--color-primary)]" />
              <span className="text-[11px] font-semibold text-[var(--text-main)]">Page Source</span>
              <button onClick={() => setConsole_([])} className="ml-2 text-[10px] text-[var(--text-muted)] hover:text-[var(--color-danger)] underline">Clear console</button>
              <button onClick={() => setMode('browse')} className="ml-auto text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] underline">Close</button>
            </div>
            {console_.length > 0 && (
              <div className="px-3 py-2 border-b border-[var(--border-subtle)] space-y-0.5 max-h-32 overflow-y-auto shrink-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">Console</p>
                {console_.map((entry, i) => (
                  <div key={i} className={`flex items-start gap-2 text-[10px] font-mono ${
                    entry.type === 'error' ? 'text-[var(--color-danger)]' :
                    entry.type === 'warn'  ? 'text-[var(--color-warning)]' :
                    'text-[var(--text-main)]'
                  }`}>
                    <span className="text-[var(--text-muted)] shrink-0">{entry.time}</span>
                    <span className="break-all">{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-auto px-3 py-2">
              {pageSource === null
                ? <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-[var(--text-muted)]" /></div>
                : <pre className="text-[10px] font-mono text-[var(--text-main)] whitespace-pre-wrap break-all">{pageSource}</pre>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Root ─────────────────────────────────────────────────────────────────────

interface BrowserViewProps {
  url?:            string;
  addressDisplay?: string | null;
}

export const BrowserView: React.FC<BrowserViewProps> = ({
  url:            urlFromParent,
  addressDisplay,
}) => {
  const [primaryUrl,   setPrimaryUrl]   = useState(urlFromParent || DEFAULT_URL);
  const [secondaryUrl, setSecondaryUrl] = useState<string | null>(null);

  useEffect(() => {
    if (urlFromParent?.trim()) setPrimaryUrl(urlFromParent);
  }, [urlFromParent]);

  useEffect(() => {
    const onPrimary   = (e: Event) => { const url = (e as CustomEvent<{ url?: string }>).detail?.url; if (url) setPrimaryUrl(url); };
    const onSecondary = (e: Event) => { const url = (e as CustomEvent<{ url?: string }>).detail?.url; if (url) setSecondaryUrl(url); };
    window.addEventListener('iam-browser-navigate',           onPrimary);
    window.addEventListener('iam-browser-navigate-secondary', onSecondary);
    return () => {
      window.removeEventListener('iam-browser-navigate',           onPrimary);
      window.removeEventListener('iam-browser-navigate-secondary', onSecondary);
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
          />
        </div>
      )}
    </div>
  );
};

export default BrowserView;
