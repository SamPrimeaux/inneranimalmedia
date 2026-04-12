/**
 * BrowserView — Embedded browser with single and dual pane support.
 *
 * Default: single pane.
 * Split: side-by-side dual panes, each with independent URL bar + iframe.
 * Agent Sam can navigate either pane via window events:
 *   iam-browser-navigate         → navigates primary pane
 *   iam-browser-navigate-secondary → navigates secondary pane
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  RotateCcw, Columns2, Square, ExternalLink, X,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://inneranimalmedia.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeNavigate(raw: string): string {
  const next = raw.trim();
  if (!next) return DEFAULT_URL;
  if (/^(blob:|data:|about:)/i.test(next)) return next;
  if (!/^https?:\/\//i.test(next)) {
    if (next.includes('.') || next.includes('localhost')) return `https://${next}`;
    return DEFAULT_URL;
  }
  return next;
}

function isVirtualProtocol(url: string): boolean {
  return /^(r2:|github:|local:|preview:)/i.test(url);
}

// ─── Single pane ──────────────────────────────────────────────────────────────

interface PaneProps {
  initialUrl:     string;
  addressDisplay?: string | null;
  label?:         string;
  onClose?:       () => void;
  autoFocusInput?: boolean;
}

const BrowserPane: React.FC<PaneProps> = ({
  initialUrl,
  addressDisplay,
  label,
  onClose,
  autoFocusInput,
}) => {
  const [iframeUrl, setIframeUrl] = useState(() => normalizeNavigate(initialUrl));
  const [inputVal, setInputVal]   = useState(() => normalizeNavigate(initialUrl));
  const [loading, setLoading]     = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);

  // Parent-driven navigation (e.g. Agent Sam r2_write → browser_navigate)
  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const n     = normalizeNavigate(initialUrl);
    const label = addressDisplay?.trim() || '';
    const showLabel = label && /^(blob:|data:)/i.test(n);
    setIframeUrl(n);
    setInputVal(showLabel ? label : n);
  }, [initialUrl, addressDisplay]);

  useEffect(() => {
    if (autoFocusInput) inputRef.current?.focus();
  }, [autoFocusInput]);

  const navigate = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || isVirtualProtocol(trimmed)) return;
    const n = normalizeNavigate(trimmed);
    setIframeUrl(n);
    setInputVal(n);
    setLoading(true);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); navigate(inputVal); }
  };

  const reload = () => {
    // Force iframe reload by briefly blanking then restoring
    setIframeUrl('about:blank');
    requestAnimationFrame(() => setIframeUrl(iframeUrl));
  };

  const openExternal = () => {
    if (iframeUrl && !isVirtualProtocol(iframeUrl)) {
      window.open(iframeUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex flex-col w-full h-full min-w-0 min-h-0 overflow-hidden">
      {/* URL bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] shrink-0">
        {label && (
          <span className="shrink-0 text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)]">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={reload}
          title="Reload"
          className="shrink-0 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <RotateCcw size={13} />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="https://"
          aria-label="URL"
          spellCheck={false}
          className="flex-1 min-w-0 h-7 px-2.5 text-[12px] rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] focus:outline-none focus:border-[var(--solar-cyan)]/60 font-mono text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
        />
        <button
          type="button"
          onClick={() => navigate(inputVal)}
          className="shrink-0 h-7 px-3 text-[11px] font-semibold rounded border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--bg-panel)] transition-colors"
        >
          Go
        </button>
        <button
          type="button"
          onClick={openExternal}
          title="Open in new tab"
          className="shrink-0 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ExternalLink size={13} />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close pane"
            className="shrink-0 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--solar-red)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Loading bar */}
      {loading && (
        <div className="h-0.5 w-full bg-[var(--border-subtle)] shrink-0 relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1/3 bg-[var(--solar-cyan)] animate-[slide_1s_ease-in-out_infinite]" />
        </div>
      )}

      {/* iframe */}
      <div className="flex-1 relative min-h-0 bg-white">
        <iframe
          key={iframeUrl}
          src={iframeUrl}
          className="absolute inset-0 w-full h-full border-0"
          title={label ? `Browser — ${label}` : 'Embedded browser'}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          onLoad={() => setLoading(false)}
        />
      </div>
    </div>
  );
};

// ─── Root component ───────────────────────────────────────────────────────────

interface BrowserViewProps {
  url?:            string;
  addressDisplay?: string | null;
}

export const BrowserView: React.FC<BrowserViewProps> = ({
  url:            urlFromParent,
  addressDisplay,
}) => {
  const [splitMode, setSplitMode]       = useState(false);
  const [primaryUrl, setPrimaryUrl]     = useState(urlFromParent || DEFAULT_URL);
  const [secondaryUrl, setSecondaryUrl] = useState(DEFAULT_URL);

  // Sync primary pane when parent navigates
  useEffect(() => {
    if (urlFromParent?.trim()) setPrimaryUrl(urlFromParent);
  }, [urlFromParent]);

  // Agent Sam can navigate panes via window events
  useEffect(() => {
    const onPrimary = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url;
      if (url) setPrimaryUrl(url);
    };
    const onSecondary = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url;
      if (url) { setSecondaryUrl(url); setSplitMode(true); }
    };
    window.addEventListener('iam-browser-navigate',           onPrimary);
    window.addEventListener('iam-browser-navigate-secondary', onSecondary);
    return () => {
      window.removeEventListener('iam-browser-navigate',           onPrimary);
      window.removeEventListener('iam-browser-navigate-secondary', onSecondary);
    };
  }, []);

  return (
    <div className="flex flex-col w-full h-full bg-[var(--bg-app)] overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 px-2 py-1 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] shrink-0">
        <span className="flex-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold px-1">
          Browser
        </span>
        <button
          type="button"
          onClick={() => setSplitMode(false)}
          title="Single pane"
          className={`p-1.5 rounded transition-colors ${!splitMode ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'}`}
        >
          <Square size={13} />
        </button>
        <button
          type="button"
          onClick={() => setSplitMode(true)}
          title="Split panes"
          className={`p-1.5 rounded transition-colors ${splitMode ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'}`}
        >
          <Columns2 size={13} />
        </button>
      </div>

      {/* Panes */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Primary */}
        <div className={`flex flex-col min-h-0 min-w-0 overflow-hidden ${splitMode ? 'w-1/2 border-r border-[var(--border-subtle)]' : 'w-full'}`}>
          <BrowserPane
            initialUrl={primaryUrl}
            addressDisplay={addressDisplay}
            label={splitMode ? 'A' : undefined}
          />
        </div>

        {/* Secondary — only mounted in split mode */}
        {splitMode && (
          <div className="flex flex-col w-1/2 min-h-0 min-w-0 overflow-hidden">
            <BrowserPane
              initialUrl={secondaryUrl}
              label="B"
              onClose={() => setSplitMode(false)}
              autoFocusInput
            />
          </div>
        )}
      </div>
    </div>
  );
};
