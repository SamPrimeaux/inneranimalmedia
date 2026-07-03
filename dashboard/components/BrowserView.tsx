/**
 * BrowserView.tsx — Agent Sam IDE Browser Panel
 *
 * Toolbar (left → right):
 *   Reload | URL bar | [Split] | Picker | DevTools | Components | ...menu
 *
 * Features:
 *  - Permission gate (Deny / Allow Once / Always Allow) via agentsam_browser_trusted_origin
 *  - Agent active glow when CDT tools are running
 *  - Manual browsing: passive iframe (Embed Preview)
 *  - Agent automation: Agent Live Session via live.browser.run (shared Browser Run CDP)
 *  - Screenshots: explicit capture menu / cdt_take_screenshot only
 *  - CSS Inspector (Components panel) — snapshot / same-origin when available
 *  - DevTools panel — console + network via cdt_* tools
 *  - Element picker — hover/highlight/select, populates chat
 *  - Area screenshot drag-select
 *  - Window events for Agent Sam browser navigation
 *  - Split pane A/B
 */

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  RotateCcw, Copy, Columns2, X, Loader2, CheckCircle,
  AlertTriangle, Camera, MoreHorizontal, MousePointer2,
  Code2, Layers, ZoomIn, ZoomOut, Trash2, Cookie,
  HardDrive, Shield, ShieldCheck, Globe, ChevronRight,
  Terminal, Network, Bug,
} from 'lucide-react';
import type { AgentWorkspaceContextPacket } from '../src/ideWorkspace';
import { BrowserLiveTimeline } from './BrowserLiveTimeline';
import { useAgentLiveBrowserWs } from '../hooks/useAgentLiveBrowserWs';
import { applyBrowserRunLiveViewMode, resolveLiveViewMode } from '../lib/browserLiveViewUrl';
import { originRequiresBrowserRunEmbed, resolveEmbedModeRemote } from '../src/lib/browserEmbedPolicy';

// ─── Constants ────────────────────────────────────────────────────────────────

const IAM_LOGO = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar';

const DEFAULT_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://inneranimalmedia.com';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolved from GET /api/agent/browser/registry-tools (agentsam_tools). */
type BrowserRegistryPickers = {
  navigate: string | null;
  content: string | null;
  console: string | null;
  network: string | null;
  snapshot: string | null;
  screenshot: string | null;
  evaluate: string | null;
  hover: string | null;
};

const EMPTY_BROWSER_PICKERS: BrowserRegistryPickers = {
  navigate: null,
  content: null,
  console: null,
  network: null,
  snapshot: null,
  screenshot: null,
  evaluate: null,
  hover: null,
};

async function fetchBrowserRegistryPickers(workspaceId: string): Promise<BrowserRegistryPickers> {
  try {
    const qs = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : '';
    const r = await fetch(`/api/agent/browser/registry-tools${qs}`, { credentials: 'same-origin' });
    const data = await r.json().catch(() => ({})) as { pickers?: BrowserRegistryPickers };
    if (data.pickers && typeof data.pickers === 'object') {
      return { ...EMPTY_BROWSER_PICKERS, ...data.pickers };
    }
  } catch { /* non-blocking */ }
  return EMPTY_BROWSER_PICKERS;
}

function safeClassText(el: { className?: unknown } | null | undefined): string {
  if (!el || el.className == null) return '';
  const c = el.className;
  if (typeof c === 'string') return c;
  if (typeof c === 'object' && c !== null && 'baseVal' in c) {
    const base = (c as { baseVal?: string }).baseVal;
    if (typeof base === 'string') return base;
  }
  return String(c);
}

function normalize(raw: string): string {
  let s = raw.trim();
  if (!s) return DEFAULT_URL;
  if (/^\/https?:\/\//i.test(s)) s = s.replace(/^\/+/, '');
  const nestedAbs = s.match(/^https?:\/\/[^/]+\/(https?:\/\/.+)$/i);
  if (nestedAbs?.[1]) s = nestedAbs[1];
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

const SCREENSHOT_TIMEOUT_MSG = 'Screenshot timed out, retry';

type PlaywrightJobSnapshot = {
  id?: string;
  status?: string;
  result_url?: string;
  screenshot_url?: string;
  error?: string;
};

function pickScreenshotUrl(data: Record<string, unknown> | PlaywrightJobSnapshot | null | undefined): string | null {
  if (!data) return null;
  if (typeof data.screenshot_url === 'string' && data.screenshot_url) return data.screenshot_url;
  if (typeof data.result_url === 'string' && data.result_url) return data.result_url;
  if (typeof data.data_url === 'string' && data.data_url) return data.data_url;
  return null;
}

function pickInvokeScreenshotUrl(data: Record<string, unknown>): string | null {
  const direct = pickScreenshotUrl(data);
  if (direct) return direct;
  if (typeof data.screenshotUrl === 'string' && data.screenshotUrl) return data.screenshotUrl;
  const result = data.result;
  if (result && typeof result === 'object') return pickScreenshotUrl(result as Record<string, unknown>);
  return null;
}

function sleepMs(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort);
  });
}

/** Single job fetch — one retry after pending POST (no polling loop). */
async function fetchPlaywrightJobOnce(jobId: string, signal: AbortSignal): Promise<PlaywrightJobSnapshot | null> {
  const r = await fetch(`/api/playwright/${encodeURIComponent(jobId)}`, {
    credentials: 'same-origin',
    signal,
  });
  if (!r.ok) return null;
  return (await r.json().catch(() => null)) as PlaywrightJobSnapshot | null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PaneMode = 'browse' | 'picker' | 'screenshot' | 'area';
/** Passive iframe embed vs shared Agent Live Browser Run session. */
type ViewSurface = 'preview' | 'agentLive';
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

// ─── Trust API (IAM session + workspace header — same contract as MCP OAuth consent) ─

function browserTrustHeaders(workspaceId?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const ws = workspaceId != null ? String(workspaceId).trim() : '';
  if (ws) headers['x-iam-workspace-id'] = ws;
  return headers;
}

type TrustCheckResult = {
  trusted: boolean;
  trust_scope: string | null;
  skip_approval: boolean;
};

async function checkTrust(origin: string, workspaceId?: string | null): Promise<TrustCheckResult> {
  try {
    const r = await fetch(`/api/agentsam/browser/trust?origin=${encodeURIComponent(origin)}`, {
      credentials: 'same-origin',
      headers: browserTrustHeaders(workspaceId),
    });
    if (!r.ok) return { trusted: false, trust_scope: null, skip_approval: false };
    const d = await r.json().catch(() => ({})) as {
      trusted?: boolean;
      trust_scope?: string | null;
      skip_approval?: boolean;
    };
    const trusted = !!d.trusted;
    const trust_scope = d.trust_scope ?? null;
    const skip_approval =
      d.skip_approval === true ||
      (trusted && String(trust_scope || '').toLowerCase() === 'persistent');
    return { trusted, trust_scope, skip_approval };
  } catch {
    return { trusted: false, trust_scope: null, skip_approval: false };
  }
}

async function writeTrust(origin: string, scope: TrustScope, workspaceId?: string | null): Promise<void> {
  try {
    await fetch('/api/agentsam/browser/trust', {
      method: 'POST',
      headers: browserTrustHeaders(workspaceId),
      credentials: 'same-origin',
      body: JSON.stringify({ origin, trust_scope: scope }),
    });
  } catch {
    /* non-blocking */
  }
}

type BrowserRunSessionResponse = {
  ok?: boolean;
  error?: string;
  session_id?: string;
  devtools_frontend_url?: string;
  url?: string;
  title?: string | null;
};

async function createBrowserRunLiveSession(
  url: string,
  workspaceId?: string | null,
  sessionId?: string | null,
  agentRunId?: string | null,
): Promise<BrowserRunSessionResponse> {
  const r = await fetch('/api/browser/session', {
    method: 'POST',
    headers: browserTrustHeaders(workspaceId),
    credentials: 'same-origin',
    body: JSON.stringify({
      url,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(agentRunId?.trim() ? { agent_run_id: agentRunId.trim() } : {}),
      keep_alive_ms: 600_000,
    }),
  });
  const data = (await r.json().catch(() => ({}))) as BrowserRunSessionResponse;
  if (!r.ok) {
    return { error: data?.error || r.statusText };
  }
  return data;
}

async function refreshBrowserRunLiveUrl(
  sessionId: string,
  agentRunId?: string | null,
  workspaceId?: string | null,
): Promise<BrowserRunSessionResponse> {
  if (agentRunId?.trim()) {
    const r = await fetch(
      `/api/browser/live/${encodeURIComponent(agentRunId.trim())}/live-url`,
      {
        credentials: 'same-origin',
        headers: browserTrustHeaders(workspaceId),
      },
    );
    const data = (await r.json().catch(() => ({}))) as BrowserRunSessionResponse;
    if (!r.ok) return { error: data?.error || r.statusText };
    return data;
  }
  const qs = new URLSearchParams();
  if (agentRunId?.trim()) qs.set('agent_run_id', agentRunId.trim());
  const r = await fetch(
    `/api/browser/session/${encodeURIComponent(sessionId)}/live-url?${qs.toString()}`,
    {
      credentials: 'same-origin',
      headers: browserTrustHeaders(workspaceId),
    },
  );
  const data = (await r.json().catch(() => ({}))) as BrowserRunSessionResponse;
  if (!r.ok) return { error: data?.error || r.statusText };
  return data;
}

async function cancelBrowserHumanInput(
  agentRunId: string,
  workspaceId?: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch('/api/browser/session/human-cancel', {
    method: 'POST',
    headers: browserTrustHeaders(workspaceId),
    credentials: 'same-origin',
    body: JSON.stringify({ agent_run_id: agentRunId }),
  });
  return (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

async function fetchAgentLiveSessionSnapshot(
  agentRunId: string,
  workspaceId?: string | null,
): Promise<BrowserRunSessionResponse & { live_session?: Record<string, unknown> }> {
  const r = await fetch(`/api/browser/live/${encodeURIComponent(agentRunId)}`, {
    credentials: 'same-origin',
    headers: browserTrustHeaders(workspaceId),
  });
  const data = (await r.json().catch(() => ({}))) as BrowserRunSessionResponse & {
    live_session?: Record<string, unknown>;
  };
  if (!r.ok) return { error: data?.error || r.statusText };
  return data;
}

async function resumeBrowserHumanInput(
  agentRunId: string,
  workspaceId?: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const r = await fetch('/api/browser/session/human-resume', {
    method: 'POST',
    headers: browserTrustHeaders(workspaceId),
    credentials: 'same-origin',
    body: JSON.stringify({ agent_run_id: agentRunId }),
  });
  return (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

async function deleteBrowserRunLiveSession(
  sessionId: string,
  workspaceId?: string | null,
  agentRunId?: string | null,
): Promise<void> {
  try {
    await fetch('/api/browser/session', {
      method: 'DELETE',
      headers: browserTrustHeaders(workspaceId),
      credentials: 'same-origin',
      body: JSON.stringify({
        ...(agentRunId?.trim() ? { agent_run_id: agentRunId.trim() } : {}),
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
    });
  } catch {
    /* non-blocking */
  }
}

// ─── MYBROWSER tool invoke (session cookie → /api/browser/invoke) ───────────

type BrowserInvokeResult = Record<string, unknown> & {
  error?: string;
  ok?: boolean;
  url?: string;
  screenshot_url?: string;
  title?: string;
};

async function invokeCdt(tool_name: string, params: Record<string, unknown>): Promise<BrowserInvokeResult> {
  const r = await fetch('/api/browser/invoke', {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body:        JSON.stringify({ tool_name, params }),
  });
  const data = (await r.json().catch(() => ({}))) as BrowserInvokeResult;
  if (!r.ok) {
    const err = data?.error || r.statusText;
    return { error: err };
  }
  return data;
}

function pickNavigatePreview(data: BrowserInvokeResult) {
  const screenshot_url =
    pickScreenshotUrl(data) ||
    (typeof data.result_url === 'string' && data.result_url) ||
    '';
  return { screenshot_url: screenshot_url || null };
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
          ? 'text-muted hover:text-red-400 hover:bg-red-500/10'
          : 'text-muted hover:text-main hover:bg-[var(--bg-hover)]'
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
  const [step, setStep] = useState<1 | 2>(1);
  const [selection, setSelection] = useState<'session' | 'persistent' | null>(null);

  const applySelection = () => {
    if (selection === 'persistent') onAlwaysAllow();
    else if (selection === 'session') onAllowOnce();
  };

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] max-w-[calc(100vw-24px)] rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] px-6 pt-6 pb-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted">
              Inner Animal Media — Browser access
            </p>
            <p className="text-[10px] font-mono text-muted">
              Step {step} of 2
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
              <Globe size={20} className="text-[var(--color-primary)]" />
            </div>
            <div className="flex-1 border-t border-dashed border-[var(--border-subtle)] opacity-70" />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-hover)]">
              <ShieldCheck size={20} className="text-main" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-[16px] font-semibold text-main">
              Allow browser access to this origin?
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Same approval flow as MCP OAuth: review the destination, then grant session or persistent trust before Browser Run live view or automation tools run.
            </p>
          </div>
        </div>

        <div className="p-5">
          {step === 1 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                  Requested origin
                </div>
                <div className="mt-2 break-all text-[12px] font-mono text-main">
                  {origin}
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelection('session')}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    selection === 'session'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-subtle)]">
                    {selection === 'session' ? (
                      <CheckCircle size={12} className="text-[var(--color-primary)]" />
                    ) : (
                      <Shield size={12} className="text-muted" />
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[12px] font-semibold text-main">
                      Allow for this session
                    </span>
                    <span className="mt-1 block text-[11px] text-muted">
                      Browser navigation stays enabled until this dashboard session ends.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelection('persistent')}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    selection === 'persistent'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-subtle)]">
                    {selection === 'persistent' ? (
                      <CheckCircle size={12} className="text-[var(--color-primary)]" />
                    ) : (
                      <HardDrive size={12} className="text-muted" />
                    )}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[12px] font-semibold text-main">
                      Always allow this origin
                    </span>
                    <span className="mt-1 block text-[11px] text-muted">
                      Save this origin to the trusted list for future browser actions.
                    </span>
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={onDeny}
                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selection}
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Review access
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                  Origin
                </div>
                <div className="mt-2 break-all text-[12px] font-mono text-main">
                  {origin}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                  Grant scope
                </div>
                <div className="mt-2 text-[12px] font-semibold text-main">
                  {selection === 'persistent' ? 'Persistent trusted origin' : 'Session-only browser access'}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {selection === 'persistent'
                    ? 'This origin will be saved in your trusted browser origins list.'
                    : 'This origin will only be allowed for the current dashboard session.'}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-3 text-[11px] leading-relaxed text-muted">
                Browser trust only controls where the embedded browser can navigate. Risky actions inside the page still require their own tool approvals.
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-hover)] px-4 py-2 text-[12px] font-semibold text-main transition-colors hover:bg-[var(--bg-panel)]"
                >
                  Edit
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onDeny}
                    className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applySelection}
                    className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Authorize
                  </button>
                </div>
              </div>
            </div>
          )}
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
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-1">
        Page cannot be embedded
      </p>
      <p className="text-[10px] font-mono text-muted/60 max-w-[200px] break-all">{url}</p>
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
        <span className="text-muted">{role}</span>
        {name ? <span className="text-main ml-1">{name}</span> : null}
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
      <span className="text-[11px] font-bold uppercase tracking-widest text-main">
        Inspector
      </span>
      {element && (
        <span className="ml-1 text-[10px] text-muted truncate max-w-[100px]">
          {element.tag}{element.id ? `#${element.id}` : ''}{element.className ? `.${element.className.split(' ')[0]}` : ''}
        </span>
      )}
      <div className="flex-1" />
      <button type="button" onClick={onClose} className="p-1 text-muted hover:text-red-400 hover:bg-red-500/10 rounded">
        <X size={11} />
      </button>
    </div>

    {!element ? (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted">
        <Layers size={20} className="opacity-30" />
        <p className="text-[11px]">Click an element in the browser to inspect it</p>
      </div>
    ) : (
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
          <p className="text-[9px] uppercase tracking-widest text-muted mb-1">Element</p>
          <code className="text-[10px] text-[var(--color-primary)] break-all">
            {`<${element.tag}${element.id ? ` id="${element.id}"` : ''}${element.className ? ` class="${element.className}"` : ''}>`}
          </code>
          <p className="text-[9px] text-muted mt-1 opacity-60">{element.path}</p>
        </div>

        <div className="px-3 py-2">
          <p className="text-[9px] uppercase tracking-widest text-muted mb-2">Computed Styles</p>
          <div className="space-y-1">
            {Object.entries(element.styles)
              .filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto')
              .slice(0, 40)
              .map(([prop, val]) => (
                <div key={prop} className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted shrink-0 w-32 truncate">{prop}</span>
                  <span className="text-main truncate">{val}</span>
                </div>
              ))}
          </div>
        </div>

        {element.boundingBox && (
          <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
            <p className="text-[9px] uppercase tracking-widest text-muted mb-2">Position & Size</p>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {Object.entries(element.boundingBox).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-muted">{k}:</span>
                  <span className="text-main">{Math.round(v as number)}px</span>
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
  registryPickers:   BrowserRegistryPickers;
}> = ({ url, onClose, tab, onTabChange, inspectedElement, inspectSameOrigin, registryPickers }) => {
  const [loading, setLoading]       = useState(false);
  const [tabError, setTabError]     = useState<string | null>(null);
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

  const devtoolsWorkspaceId =
    typeof window !== 'undefined'
      ? String((window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ || '').trim()
      : '';

  const registryLaneKey = [
    registryPickers.console,
    registryPickers.network,
    registryPickers.snapshot,
  ].join('|');

  useEffect(() => {
    fetchedRef.current = { elements: false, console: false, network: false };
    setConsoleRows([]);
    setNetworkRows([]);
    setSnapshot(null);
    setExpandedNetKey(null);
    setTabError(null);
  }, [url, registryLaneKey]);

  const mapConsoleType = (t: string): ConsoleMsg['type'] => {
    const u = t.toLowerCase();
    if (u === 'error') return 'error';
    if (u === 'warning' || u === 'warn') return 'warn';
    if (u === 'info') return 'info';
    return 'log';
  };

  const cdtParams = useCallback(
    (extra: Record<string, unknown> = {}) => ({
      url,
      ...(devtoolsWorkspaceId && devtoolsWorkspaceId !== 'global'
        ? { workspace_id: devtoolsWorkspaceId }
        : {}),
      ...extra,
    }),
    [url, devtoolsWorkspaceId],
  );

  const loadTab = useCallback(async (t: DevToolsTab, force: boolean) => {
    if (!url?.trim()) return;
    if (!force && fetchedRef.current[t]) return;
    setLoading(true);
    setTabError(null);
    try {
      const consoleTool = registryPickers.console || 'cdt_list_console_messages';
      const networkTool = registryPickers.network || 'cdt_list_network_requests';
      const snapshotTool = registryPickers.snapshot || 'cdt_take_snapshot';

      if (t === 'console') {
        const cons = await invokeCdt(consoleTool, cdtParams({ limit: 100 }));
        if (cons.error) {
          setTabError(String(cons.error));
          return;
        }
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
        const net = await invokeCdt(networkTool, cdtParams({ limit: 100 }));
        if (net.error) {
          setTabError(String(net.error));
          return;
        }
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
      } else if (t === 'elements') {
        if (inspectSameOrigin && !inspectedElement) {
          fetchedRef.current.elements = true;
          return;
        }
        if (inspectedElement) {
          fetchedRef.current.elements = true;
          return;
        }
        const snap = await invokeCdt(snapshotTool, cdtParams({ interestingOnly: true }));
        if (snap.error) {
          setTabError(String(snap.error));
          return;
        }
        const root = (snap as { snapshot?: unknown })?.snapshot;
        setSnapshot(
          root && typeof root === 'object' && !Array.isArray(root)
            ? (root as Record<string, unknown>)
            : { error: 'No snapshot', raw: root },
        );
        fetchedRef.current.elements = true;
      }
    } catch (e) {
      setTabError(String(e));
    } finally { setLoading(false); }
  }, [url, inspectSameOrigin, registryPickers, inspectedElement, cdtParams]);

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
    return 'bg-[var(--bg-hover)] text-muted';
  };

  const statusColor = (s?: number) => {
    if (s == null || Number.isNaN(s)) return 'text-muted';
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
                : 'border-transparent text-muted hover:text-main'
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
          className="p-1.5 text-muted hover:text-main hover:bg-[var(--bg-hover)] rounded transition-colors shrink-0"
        >
          <RotateCcw size={11} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors mr-1 shrink-0"
        >
          <X size={11} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto font-mono text-[10px] min-h-0">
        {tabError ? (
          <div className="p-3 text-red-400/90 text-[10px] leading-relaxed">
            <p className="font-semibold mb-1">DevTools request failed</p>
            <p className="text-muted break-words">{tabError}</p>
            <p className="mt-2 text-muted">
              Allow this site under browser trust, then use Refresh. MYBROWSER may see a bot-check page that differs from the iframe.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted">
            <Loader2 size={14} className="animate-spin" />
            <span>Loading…</span>
          </div>
        ) : tab === 'elements' ? (
          <div className="flex flex-col min-h-0 h-full">
            {inspectedElement ? (
              <ComponentsPanel element={inspectedElement} onClose={onClose} embedded />
            ) : inspectSameOrigin ? (
              <ComponentsPanel element={null} onClose={onClose} embedded />
            ) : snapshot && 'error' in snapshot && snapshot.error ? (
              <div className="p-3 text-muted">{String(snapshot.error)}</div>
            ) : snapshot ? (
              <div className="p-2 overflow-y-auto min-h-0">
                <SnapshotTreeRow node={snapshot} depth={0} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted p-3 text-center gap-2">
                <p>No accessibility snapshot</p>
                <p className="text-[9px] opacity-80">Use the element picker on the page, or Refresh after the site finishes loading.</p>
              </div>
            )}
          </div>
        ) : tab === 'console' ? (
          <div className="flex flex-col min-h-0 h-full">
            <div className="flex justify-end px-2 py-1 border-b border-[var(--border-subtle)] shrink-0">
              <button
                type="button"
                onClick={() => setConsoleRows([])}
                className="text-[9px] uppercase tracking-wider text-muted hover:text-main"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {consoleRows.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted">No console messages</div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]/30">
                  {consoleRows.map((m, i) => (
                    <div key={i} className="flex gap-2 px-3 py-1.5 items-start">
                      <span className="text-muted shrink-0 opacity-60 tabular-nums">{m.time}</span>
                      <span className={`shrink-0 px-1 py-0.5 rounded text-[9px] font-bold uppercase ${badgeCls(m.type)}`}>
                        {m.type}
                      </span>
                      <span className={`break-all flex-1 ${
                        m.type === 'error' ? 'text-red-400' : m.type === 'warn' ? 'text-yellow-400' : m.type === 'info' ? 'text-[var(--color-primary)]' : 'text-main'
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
                    netFilter === f ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]' : 'text-muted hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredNet.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted">No requests</div>
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
                          <span className="shrink-0 text-muted w-11 uppercase text-[9px] opacity-80">{r.method}</span>
                          <span className="truncate text-main flex-1">{r.url}</span>
                          <span className="shrink-0 text-muted text-[9px] max-w-[80px] truncate">
                            {r.response?.headers?.['content-type'] ?? r.type ?? ''}
                          </span>
                        </button>
                        {open && (
                          <div className="px-3 pb-2 space-y-1 text-[9px] text-muted border-t border-[var(--border-subtle)]/40 bg-[var(--bg-elevated,var(--bg-panel))]/30">
                            <p className="break-all text-main">{r.url}</p>
                            <p>
                              <span className="opacity-70">Timing ms:</span>{' '}
                              <span className="text-main">—</span>
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

const PICKER_CLEANUP_SCRIPT = `
(function() {
  if (window.__iamPickerTeardown) { window.__iamPickerTeardown(); return; }
  window.__iamPickerActive = false;
  document.getElementById('__iam-picker-overlay')?.remove();
})();
`;

/** Same-origin iframe: report SPA + history navigations to parent URL bar. */
const NAVIGATION_SYNC_SCRIPT = `
(function() {
  if (window.__iamNavBridgeActive) return;
  window.__iamNavBridgeActive = true;
  function notify() {
    try {
      window.parent.postMessage({
        type: 'iam-navigation',
        url: location.href,
        title: document.title || ''
      }, '*');
    } catch (e) {}
  }
  notify();
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  var push = history.pushState;
  var replace = history.replaceState;
  history.pushState = function() {
    var r = push.apply(this, arguments);
    notify();
    return r;
  };
  history.replaceState = function() {
    var r = replace.apply(this, arguments);
    notify();
    return r;
  };
})();
`;

const PICKER_SCRIPT = `
(function() {
  if (window.__iamPickerTeardown) window.__iamPickerTeardown();
  window.__iamPickerActive = true;
  let lastEl = null;
  const overlay = document.createElement('div');
  overlay.id = '__iam-picker-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #3a9fe8;background:rgba(58,159,232,0.08);z-index:2147483647;transition:all 0.08s;border-radius:2px;';
  document.body.appendChild(overlay);

  function classText(el) {
    if (!el || el.className == null) return '';
    const c = el.className;
    if (typeof c === 'string') return c;
    if (typeof c === 'object' && c.baseVal) return c.baseVal;
    return String(c);
  }

  function getPath(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      let sel = (node.tagName || 'div').toLowerCase();
      if (node.id) sel += '#' + node.id;
      else {
        const cls = classText(node).trim().split(/\\s+/)[0];
        if (cls) sel += '.' + cls;
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function onOver(e) {
    const el = e.target;
    if (!el || el === overlay) return;
    lastEl = el;
    const r = el.getBoundingClientRect();
    overlay.style.top = r.top + 'px';
    overlay.style.left = r.left + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = lastEl;
    if (!el) return;
    const r = el.getBoundingClientRect();
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
      type: 'iam-element-selected',
      element: {
        tag: (el.tagName || '').toLowerCase(),
        id: el.id || null,
        className: classText(el) || null,
        html: (el.outerHTML || '').slice(0, 3000),
        path: getPath(el),
        styles,
        boundingBox: { top: r.top, left: r.left, width: r.width, height: r.height },
      }
    }, '*');
  }

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('click', onClick, true);

  window.__iamPickerTeardown = function() {
    window.__iamPickerActive = false;
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('click', onClick, true);
    overlay.remove();
  };
})();
`;

/** MYBROWSER: element at viewport coordinates (cross-origin iframe — no inject into iframe). */
function pickAtPointExpression(x: number, y: number): string {
  const xi = Math.max(0, Math.round(x));
  const yi = Math.max(0, Math.round(y));
  return `
(function(x, y) {
  function classText(el) {
    if (!el || el.className == null) return '';
    const c = el.className;
    if (typeof c === 'string') return c;
    if (typeof c === 'object' && c.baseVal) return c.baseVal;
    return String(c);
  }
  function getPath(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      let sel = (node.tagName || 'div').toLowerCase();
      if (node.id) sel += '#' + node.id;
      else {
        const cls = classText(node).trim().split(/\\s+/)[0];
        if (cls) sel += '.' + cls;
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  const el = document.elementFromPoint(x, y);
  if (!el || el === document.documentElement || el === document.body) return null;
  const r = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  const styles = {};
  ['color','background-color','font-size','font-family','font-weight',
   'display','position','width','height','margin','padding'].forEach(p => {
    const v = cs.getPropertyValue(p);
    if (v) styles[p] = v;
  });
  return {
    element: {
      tag: (el.tagName || '').toLowerCase(),
      id: el.id || null,
      className: classText(el) || null,
      html: (el.outerHTML || '').slice(0, 3000),
      path: getPath(el),
      styles,
      boundingBox: { top: r.top, left: r.left, width: r.width, height: r.height },
    },
    rect: { top: r.top, left: r.left, width: r.width, height: r.height },
  };
})(${xi}, ${yi})
`.trim();
}

type PickerHighlightRect = { top: number; left: number; width: number; height: number };

// ─── Single Pane ──────────────────────────────────────────────────────────────

type BrowserPreviewPayload = {
  screenshot_url: string;
  title?: string | null;
};

interface PaneProps {
  initialUrl?:         string;
  initialPreview?:     BrowserPreviewPayload | null;
  /** Agent SSE / tool_done — MYBROWSER automation; omit for passive iframe opens. */
  initialAutomation?:  boolean;
  /** Open Browser Run Live View (shared agent session) instead of screenshot overlay. */
  initialAgentLive?:   boolean;
  /** Passive editor preview — never MYBROWSER. */
  previewSource?:      'editor' | 'agent';
  addressDisplay?: string | null;
  label?:          'A' | 'B';
  onClose?:        () => void;
  onSplit?:        (url: string) => void;
  onUrlCommitted?: (url: string) => void;
  isSplit?:        boolean;
  autoFocus?:      boolean;
  agentActive?:    boolean;
  /** `agentsam_agent_run.id` from chat SSE — stamped into full-page playwright screenshot metadata. */
  agentRunId?:     string | null;
}

const BrowserPane: React.FC<PaneProps> = ({
  initialUrl,
  initialPreview,
  initialAutomation = false,
  initialAgentLive = false,
  previewSource = 'agent',
  addressDisplay,
  label,
  onClose,
  onSplit,
  onUrlCommitted,
  isSplit,
  autoFocus,
  agentActive = false,
  agentRunId = null,
}) => {
  const [iframeUrl,      setIframeUrl]      = useState('');
  const [currentUrl,     setCurrentUrl]     = useState(() => (initialUrl?.trim() ? normalize(initialUrl) : ''));
  const [inputVal,       setInputVal]       = useState(() => (initialUrl?.trim() ? normalize(initialUrl) : ''));
  const [loading,        setLoading]        = useState(false);
  const [iframeBlocked,  setIframeBlocked]  = useState(false);
  const [navigateError,  setNavigateError]  = useState<string | null>(null);
  const [mode,           setMode]           = useState<PaneMode>('browse');
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [zoom,           setZoom]           = useState(100);
  const [screenshotUrl,  setScreenshotUrl]  = useState<string | null>(initialPreview?.screenshot_url ?? null);
  const [screenshotErr,  setScreenshotErr]  = useState<string | null>(null);
  const [screenshotLoad, setScreenshotLoad] = useState(false);
  const [inspectedEl,    setInspectedEl]    = useState<InspectedElement | null>(null);
  const [inspectEpoch,   setInspectEpoch]   = useState(0);
  const [trustRequest,   setTrustRequest]   = useState<TrustRequest | null>(null);
  const [sessionTrusted, setSessionTrusted] = useState<Set<string>>(new Set());
  const [area,           setArea]           = useState<AreaSelection | null>(null);
  const [devToolsOpen,   setDevToolsOpen]   = useState(false);
  const [devToolsWidth,  setDevToolsWidth]  = useState(40);
  const [devToolsTab,    setDevToolsTab]    = useState<DevToolsTab>('elements');
  const [devToolsSession, setDevToolsSession] = useState(0);
  const devToolsWasOpenRef = useRef(false);
  const [toastMsg,       setToastMsg]       = useState<string | null>(null);
  const [registryPickers, setRegistryPickers] = useState<BrowserRegistryPickers>(EMPTY_BROWSER_PICKERS);
  /** Cross-origin sites: picker runs via MYBROWSER + dashboard overlay (iframe cannot be scripted). */
  const [pickerCrossOrigin, setPickerCrossOrigin] = useState(false);
  const [pickerHighlight, setPickerHighlight] = useState<PickerHighlightRect | null>(null);

  const inputRef     = useRef<HTMLInputElement>(null);
  const registryPickersRef = useRef(registryPickers);
  const registryPickersFetchedRef = useRef(false);
  const trustWorkspaceId = useMemo(() => {
    const wid =
      typeof window !== 'undefined'
        ? String((window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ || '').trim()
        : '';
    return wid && wid !== 'global' ? wid : null;
  }, []);
  useEffect(() => {
    registryPickersRef.current = registryPickers;
  }, [registryPickers]);
  const menuRef      = useRef<HTMLDivElement>(null);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const [viewSurface,    setViewSurface]    = useState<ViewSurface>(() => {
    if (previewSource === 'editor') return 'preview';
    if (initialAgentLive || Boolean(agentRunId?.trim())) return 'agentLive';
    return 'preview';
  });
  const [humanInputReq,  setHumanInputReq]  = useState<{
    reason: string;
    liveViewUrl?: string | null;
    resumeWhen?: string;
  } | null>(null);
  const [liveSessionTitle, setLiveSessionTitle] = useState<string | null>(null);
  const [liveUrlPending, setLiveUrlPending] = useState<string | null>(null);
  const [liveUrlCommitted, setLiveUrlCommitted] = useState<string | null>(null);
  const [liveSessionReady, setLiveSessionReady] = useState(false);
  const browserRunSessionRef = useRef<string | null>(null);
  /** Populated after openBrowserRunLiveView declaration — lets earlier callbacks (loadAutomationPreview) route XFO hosts to Browser Run without reordering. */
  const openBrowserRunLiveViewRef = useRef<((raw: string) => Promise<void>) | null>(null);
  const liveViewModeRef = useRef<'tab' | 'devtools'>('tab');
  const setAgentLiveIframeUrl = useCallback((url: string | null | undefined, mode?: 'tab' | 'devtools') => {
    const trimmed = String(url || '').trim();
    if (!trimmed) return;
    const m = mode ?? liveViewModeRef.current;
    liveViewModeRef.current = m;
    setIframeUrl(applyBrowserRunLiveViewMode(trimmed, m));
  }, []);
  const liveUrlRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const areaOverRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentUrlRef = useRef(currentUrl);
  const pickerHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerPickSeqRef = useRef(0);
  useEffect(() => {
    currentUrlRef.current = currentUrl;
  }, [currentUrl]);

  const hasLiveView = Boolean(iframeUrl?.trim());

  const {
    connected: liveWsConnected,
    timelineEvents,
    liveSession: wsLiveSession,
  } = useAgentLiveBrowserWs({
    agentRunId,
    enabled: viewSurface === 'agentLive' && Boolean(agentRunId?.trim()),
    onSnapshot: (snap) => {
      if (snap?.title) setLiveSessionTitle(String(snap.title));
      if (snap?.url) setCurrentUrl(String(snap.url));
      if (snap?.session_id) browserRunSessionRef.current = String(snap.session_id);
    },
    onLiveViewUrl: (url) => {
      if (url?.trim()) {
        setAgentLiveIframeUrl(url.trim());
        setLiveSessionReady(true);
      }
    },
    onHumanInputRequired: (detail) => {
      setHumanInputReq({
        reason: detail.reason?.trim() || 'Complete this step in the live browser.',
        liveViewUrl: detail.live_view_url ?? null,
      });
      if (detail.live_view_url?.trim()) setAgentLiveIframeUrl(detail.live_view_url.trim());
    },
    onHumanInputCleared: () => setHumanInputReq(null),
  });

  const loadRegistryPickersIfNeeded = useCallback(async (): Promise<BrowserRegistryPickers> => {
    const wid =
      typeof window !== 'undefined'
        ? String((window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ || '').trim()
        : '';
    if (!wid || wid === 'global') return registryPickersRef.current;
    if (!registryPickersFetchedRef.current) {
      registryPickersFetchedRef.current = true;
      const pickers = await fetchBrowserRegistryPickers(wid);
      setRegistryPickers(pickers);
      registryPickersRef.current = pickers;
      return pickers;
    }
    return registryPickersRef.current;
  }, []);

  /** Latest BrowserView URL/viewport for ChatAssistant `browserContext` (user visual context, not server automation). */
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUrl?.trim()) return;
    let routePath = '';
    try {
      routePath = new URL(currentUrl).pathname;
    } catch {
      routePath = '';
    }
    window.dispatchEvent(
      new CustomEvent('iam-browser-surface-context', {
        detail: {
          url: currentUrl,
          route_path: routePath,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          source: 'browser_pane',
        },
      }),
    );
  }, [currentUrl]);

  const inspectSameOrigin = useMemo(() => {
    try {
      return new URL(currentUrl).origin === window.location.origin;
    } catch {
      return false;
    }
  }, [currentUrl]);

  const applyElementSelection = useCallback((el: InspectedElement) => {
    setInspectedEl(el);
    setInspectEpoch((n) => n + 1);
    setMode('browse');
    setPickerCrossOrigin(false);
    setPickerHighlight(null);
    setDevToolsOpen(true);
    setDevToolsTab('elements');
    window.dispatchEvent(new CustomEvent('iam-browser-set-inspector', { detail: el }));
    const urlNow = currentUrlRef.current;
    const wid =
      typeof window !== 'undefined'
        ? String((window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__ || '').trim()
        : '';
    const wsId = wid && wid !== 'global' ? wid : null;
    let routePath = '';
    try {
      routePath = new URL(urlNow).pathname;
    } catch {
      routePath = '';
    }
    const classes = safeClassText(el).split(/\s+/).filter(Boolean);
    let sectionKey: string | null = null;
    let n: HTMLElement | null = el as unknown as HTMLElement;
    for (let i = 0; i < 8 && n; i++) {
      sectionKey =
        n.getAttribute?.('data-section-key') ||
        n.getAttribute?.('data-section') ||
        n.getAttribute?.('data-iam-section') ||
        sectionKey;
      n = n.parentElement;
    }
    const htmlText =
      typeof el.html === 'string' ? el.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : '';
    const st = el.styles || {};
    const payload = {
      type: 'browser_element_selected',
      workspace_id: wsId,
      url: urlNow,
      route_path: routePath,
      selector: el.path || '',
      tag: el.tag,
      classes,
      text: htmlText,
      computed_styles: {
        color: st.color,
        font_size: st['font-size'] ?? st.fontSize,
        font_family: st['font-family'] ?? st.fontFamily,
        font_weight: st['font-weight'] ?? st.fontWeight,
        background: st.background ?? st.backgroundColor,
        width: st.width,
        height: st.height,
      },
      section_key: sectionKey,
      cms_mapping: {
        page_id: null as string | null,
        section_id: null as string | null,
        section_key: sectionKey,
        component_id: null as string | null,
        asset_id: null as string | null,
      },
      source_mapping: {
        provider: 'unknown',
        path: '',
        r2_key: '',
        repo: '',
        branch: '',
      },
    };
    window.dispatchEvent(new CustomEvent('iam:browser-element-selected', { detail: payload }));
    window.dispatchEvent(
      new CustomEvent('iam:browser-selected-element', {
        detail: {
          url: urlNow,
          selector: el.path || '',
          path: el.path || '',
          tagName: el.tag,
          tag: el.tag,
          id: el.id ?? null,
          className: el.className ?? null,
          text_preview: htmlText.slice(0, 500),
          computed_styles: payload.computed_styles,
          bounding_box: el.boundingBox ?? null,
        },
      }),
    );
    window.dispatchEvent(new CustomEvent('iam:agent-context-attach', { detail: { browser_element: payload } }));
  }, []);

  const commitNavigationFromIframe = useCallback(
    (href: string, title?: string | null) => {
      const raw = href?.trim();
      if (!raw || /^about:/i.test(raw)) return;
      const n = normalize(raw);
      if (!n || n === currentUrlRef.current) return;
      currentUrlRef.current = n;
      setCurrentUrl(n);
      setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(n) ? addressDisplay : n);
      onUrlCommitted?.(n);
      let routePath = '';
      try {
        routePath = new URL(n).pathname;
      } catch {
        routePath = '';
      }
      window.dispatchEvent(
        new CustomEvent('iam-browser-surface-context', {
          detail: {
            url: n,
            title: title?.trim() || null,
            route_path: routePath,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            source: 'iframe_navigation',
          },
        }),
      );
    },
    [addressDisplay, onUrlCommitted],
  );

  const tryInjectScriptInIframe = useCallback((scriptBody: string): boolean => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.documentElement) return false;
      const script = doc.createElement('script');
      script.textContent = scriptBody;
      doc.documentElement.appendChild(script);
      script.remove();
      return true;
    } catch {
      return false;
    }
  }, []);

  const tryInjectPickerInIframe = useCallback((): boolean => {
    return tryInjectScriptInIframe(PICKER_SCRIPT);
  }, [tryInjectScriptInIframe]);

  const injectNavigationBridge = useCallback(() => {
    tryInjectScriptInIframe(NAVIGATION_SYNC_SCRIPT);
    try {
      const href = iframeRef.current?.contentWindow?.location?.href;
      if (href) commitNavigationFromIframe(href, iframeRef.current?.contentDocument?.title ?? null);
    } catch {
      /* cross-origin */
    }
  }, [tryInjectScriptInIframe, commitNavigationFromIframe]);

  const syncUrlFromIframe = useCallback(() => {
    try {
      const href = iframeRef.current?.contentWindow?.location?.href;
      if (!href) return;
      commitNavigationFromIframe(href, iframeRef.current?.contentDocument?.title ?? null);
    } catch {
      /* cross-origin — parent cannot read iframe location */
    }
  }, [commitNavigationFromIframe]);

  const tryTeardownPickerInIframe = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.documentElement) return;
      const script = doc.createElement('script');
      script.textContent = PICKER_CLEANUP_SCRIPT;
      doc.documentElement.appendChild(script);
      script.remove();
    } catch {
      /* cross-origin */
    }
  }, []);

  const syncPickerViewport = useCallback(async (urlNow: string) => {
    const iframe = iframeRef.current;
    const w = Math.max(320, Math.round(iframe?.clientWidth || 1280));
    const h = Math.max(240, Math.round(iframe?.clientHeight || 800));
    try {
      await invokeCdt('cdt_resize_page', {
        url: urlNow,
        width: w,
        height: h,
        workspace_id:
          typeof window !== 'undefined'
            ? (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__
            : undefined,
      });
    } catch {
      /* non-fatal */
    }
  }, []);

  const pickElementAtPoint = useCallback(
    async (clientX: number, clientY: number): Promise<InspectedElement | null> => {
      const urlNow = currentUrlRef.current?.trim();
      if (!urlNow) return null;
      const pickers = await loadRegistryPickersIfNeeded();
      const evalTool = pickers.evaluate || 'cdt_evaluate_script';
      const iframe = iframeRef.current;
      if (!iframe) return null;
      const rect = iframe.getBoundingClientRect();
      const z = zoom !== 100 ? zoom / 100 : 1;
      const x = (clientX - rect.left) / z;
      const y = (clientY - rect.top) / z;
      if (x < 0 || y < 0 || x > rect.width / z || y > rect.height / z) return null;

      const seq = ++pickerPickSeqRef.current;
      const data = await invokeCdt(evalTool, {
        url: urlNow,
        expression: pickAtPointExpression(x, y),
        workspace_id:
          typeof window !== 'undefined'
            ? (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__
            : undefined,
      });
      if (seq !== pickerPickSeqRef.current) return null;
      if (data.error) return null;

      let raw: unknown = data.result ?? data;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw) as unknown;
        } catch {
          return null;
        }
      }
      const parsed =
        raw && typeof raw === 'object'
          ? (raw as { element?: InspectedElement })
          : null;
      const el = parsed?.element;
      if (!el || typeof el.tag !== 'string') return null;
      return el;
    },
    [loadRegistryPickersIfNeeded, zoom],
  );

  const injectPickerScript = useCallback(async () => {
    setPickerHighlight(null);
    const urlNow = currentUrlRef.current?.trim();
    if (!urlNow) return;

    if (tryInjectPickerInIframe()) {
      setPickerCrossOrigin(false);
      return;
    }

    const pickers = await loadRegistryPickersIfNeeded();
    const evalTool = pickers.evaluate;
    if (!evalTool) {
      setToastMsg('Picker needs cdt_evaluate_script in agentsam_tools for this workspace.');
      return;
    }

    setPickerCrossOrigin(true);
    await syncPickerViewport(urlNow);
  }, [loadRegistryPickersIfNeeded, syncPickerViewport, tryInjectPickerInIframe]);

  const teardownPickerScript = useCallback(() => {
    if (pickerHoverTimerRef.current) {
      clearTimeout(pickerHoverTimerRef.current);
      pickerHoverTimerRef.current = null;
    }
    pickerPickSeqRef.current += 1;
    setPickerCrossOrigin(false);
    setPickerHighlight(null);
    tryTeardownPickerInIframe();
    const urlNow = currentUrlRef.current?.trim();
    const evalTool = registryPickersRef.current.evaluate;
    if (!evalTool || !urlNow) return;
    void invokeCdt(evalTool, {
      url: urlNow,
      expression: `(${PICKER_CLEANUP_SCRIPT})()`,
    }).catch(() => { /* non-fatal */ });
  }, [tryTeardownPickerInIframe]);

  const onPickerOverlayMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pickerCrossOrigin) return;
      if (pickerHoverTimerRef.current) clearTimeout(pickerHoverTimerRef.current);
      pickerHoverTimerRef.current = setTimeout(() => {
        pickerHoverTimerRef.current = null;
        void (async () => {
          const el = await pickElementAtPoint(e.clientX, e.clientY);
          if (!el?.boundingBox) {
            setPickerHighlight(null);
            return;
          }
          const bb = el.boundingBox;
          setPickerHighlight({
            top: bb.top,
            left: bb.left,
            width: bb.width,
            height: bb.height,
          });
        })();
      }, 48);
    },
    [pickerCrossOrigin, pickElementAtPoint],
  );

  const onPickerOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!pickerCrossOrigin) return;
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        const el = await pickElementAtPoint(e.clientX, e.clientY);
        if (!el) {
          setToastMsg('Could not inspect element — check origin trust and MYBROWSER.');
          return;
        }
        applyElementSelection(el);
      })();
    },
    [pickerCrossOrigin, pickElementAtPoint, applyElementSelection],
  );

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

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  useEffect(() => {
    if (devToolsOpen) void loadRegistryPickersIfNeeded();
  }, [devToolsOpen, loadRegistryPickersIfNeeded]);

  /** MYBROWSER DevTools: load tool registry + match iframe viewport before first tab fetch. */
  useEffect(() => {
    if (devToolsOpen && !devToolsWasOpenRef.current) {
      void (async () => {
        await loadRegistryPickersIfNeeded();
        const u = currentUrlRef.current?.trim();
        if (u) await syncPickerViewport(u);
        setDevToolsSession((n) => n + 1);
      })();
    }
    devToolsWasOpenRef.current = devToolsOpen;
  }, [devToolsOpen, loadRegistryPickersIfNeeded, syncPickerViewport]);

  const openDevTools = useCallback(() => {
    void (async () => {
      if (!devToolsOpen) {
        await loadRegistryPickersIfNeeded();
        const u = currentUrlRef.current?.trim();
        if (u) await syncPickerViewport(u);
        setDevToolsSession((n) => n + 1);
        setDevToolsOpen(true);
        return;
      }
      setDevToolsOpen(false);
    })();
  }, [devToolsOpen, loadRegistryPickersIfNeeded, syncPickerViewport]);

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
        const title = typeof e.data?.title === 'string' ? e.data.title : null;
        commitNavigationFromIframe(e.data.url, title);
      }
      if (e.data?.type === 'iam-element-selected' && e.data.element && typeof e.data.element === 'object') {
        applyElementSelection(e.data.element as InspectedElement);
      }
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, [applyElementSelection, commitNavigationFromIframe]);

  useEffect(() => {
    const onExternal = (ev: Event) => {
      const raw = (ev as CustomEvent<unknown>).detail;
      if (!raw || typeof raw !== 'object') return;
      const el = raw as InspectedElement;
      if (typeof el.tag !== 'string') return;
      setInspectedEl(el);
      setInspectEpoch((n) => n + 1);
      setDevToolsOpen(true);
      setDevToolsTab('elements');
    };
    window.addEventListener('iam-browser-set-inspector', onExternal as EventListener);
    return () => window.removeEventListener('iam-browser-set-inspector', onExternal as EventListener);
  }, []);

  /** Agent chat `tool_done` → same screenshot overlay as the Take Screenshot button. */
  useEffect(() => {
    const onAgentScreenshot = (e: Event) => {
      const url = (e as CustomEvent<{ screenshot_url?: string }>).detail?.screenshot_url;
      if (!url?.trim()) return;
      setMode('screenshot');
      setScreenshotLoad(false);
      setScreenshotErr(null);
      setScreenshotUrl(url.trim());
    };
    window.addEventListener('iam-browser-screenshot', onAgentScreenshot as EventListener);
    return () => window.removeEventListener('iam-browser-screenshot', onAgentScreenshot as EventListener);
  }, []);

  // ── Inject / tear down picker script when mode changes ──────────────────────
  useEffect(() => {
    if (mode === 'picker') {
      void injectPickerScript();
      return () => teardownPickerScript();
    }
    teardownPickerScript();
  }, [mode, currentUrl, injectPickerScript, teardownPickerScript]);

  useEffect(() => {
    if (mode === 'picker') void loadRegistryPickersIfNeeded();
  }, [mode, loadRegistryPickersIfNeeded]);

  // ── Trust gate ──────────────────────────────────────────────────────────────
  const requestTrust = useCallback((url: string): Promise<TrustScope | null> =>
    new Promise(resolve => setTrustRequest({ url, resolve })),
  []);

  useEffect(() => {
    const onTrustRequired = (e: Event) => {
      const d = (e as CustomEvent<{ origin?: string; url?: string }>).detail;
      const raw = d?.url || d?.origin;
      if (!raw || typeof raw !== 'string') return;
      const o = originOf(raw);
      void checkTrust(o, trustWorkspaceId).then((trust) => {
        if (trust.skip_approval || trust.trusted) {
          setSessionTrusted((prev) => new Set([...prev, o]));
          return;
        }
        void requestTrust(raw).then((scope) => {
          if (!scope) return;
          if (scope === 'persistent') void writeTrust(o, 'persistent', trustWorkspaceId);
          setSessionTrusted((prev) => new Set([...prev, o]));
        });
      });
    };
    window.addEventListener('iam-browser-trust-required', onTrustRequired);
    return () => window.removeEventListener('iam-browser-trust-required', onTrustRequired);
  }, [requestTrust, trustWorkspaceId]);

  /** Agent Live Session — Browser Run embed shared with agent CDP tools. */
  const openAgentLiveSession = useCallback(
    async (raw: string, liveViewUrl?: string | null, sessionId?: string | null) => {
      const s = raw.trim();
      if (!s || isVirtual(s)) return;
      const n = normalize(s);
      setViewSurface('agentLive');
      setNavigateError(null);
      setScreenshotUrl(null);
      setScreenshotErr(null);
      setMode('browse');
      setInspectedEl(null);
      setIframeBlocked(false);
      setLoading(true);

      try {
        let embedUrl = liveViewUrl?.trim() || '';
        let sid = sessionId?.trim() || browserRunSessionRef.current;
        const rid = agentRunId?.trim();
        if (rid && !embedUrl) {
          const snap = await fetchAgentLiveSessionSnapshot(rid, trustWorkspaceId);
          const live = snap.live_session as Record<string, unknown> | undefined;
          liveViewModeRef.current = resolveLiveViewMode(live?.live_view_mode);
          embedUrl =
            (typeof live?.devtools_frontend_url === 'string' && live.devtools_frontend_url) ||
            snap.devtools_frontend_url ||
            '';
          sid =
            (typeof live?.session_id === 'string' && live.session_id) ||
            snap.session_id ||
            sid ||
            null;
          if (typeof live?.title === 'string') setLiveSessionTitle(live.title);
        }
        if (!embedUrl) {
          const data = await createBrowserRunLiveSession(
            n,
            trustWorkspaceId,
            sid,
            agentRunId,
          );
          if (data.error || !data.devtools_frontend_url) {
            setNavigateError(data.error || 'Browser Run session did not return a live view URL');
            return;
          }
          embedUrl = data.devtools_frontend_url;
          sid = data.session_id || sid || null;
        }
        browserRunSessionRef.current = sid || browserRunSessionRef.current;
        setAgentLiveIframeUrl(embedUrl);
        if (embedUrl) setLiveSessionReady(true);
        if (!agentActive) {
          setCurrentUrl(n);
          setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(n) ? addressDisplay : n);
          onUrlCommitted?.(n);
        } else {
          setLiveUrlPending(n);
        }
      } catch (e) {
        setNavigateError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [addressDisplay, agentRunId, onUrlCommitted, trustWorkspaceId],
  );

  useEffect(() => {
    if (viewSurface !== 'agentLive') {
      if (liveUrlRefreshTimerRef.current) {
        clearInterval(liveUrlRefreshTimerRef.current);
        liveUrlRefreshTimerRef.current = null;
      }
      return;
    }
    const tick = () => {
      const sid = browserRunSessionRef.current;
      const rid = agentRunId?.trim();
      if (!rid && !sid) return;
      void refreshBrowserRunLiveUrl(sid || '', rid || null, trustWorkspaceId).then((data) => {
        if (data.devtools_frontend_url) setAgentLiveIframeUrl(data.devtools_frontend_url);
      });
    };
    liveUrlRefreshTimerRef.current = setInterval(tick, 4 * 60 * 1000);
    return () => {
      if (liveUrlRefreshTimerRef.current) {
        clearInterval(liveUrlRefreshTimerRef.current);
        liveUrlRefreshTimerRef.current = null;
      }
    };
  }, [viewSurface, agentRunId, trustWorkspaceId]);

  useEffect(() => {
    const onAgentLive = (e: Event) => {
      const d = (e as CustomEvent<{
        url?: string;
        live_view_url?: string;
        session_id?: string;
        agent_run_id?: string;
      }>).detail;
      const lv = d?.live_view_url?.trim();
      const rid = agentRunId?.trim() || d?.agent_run_id?.trim();
      if (!lv && !rid) return;
      void openAgentLiveSession(d?.url?.trim() || 'about:blank', lv || null, d?.session_id);
    };
    const onHumanInput = (e: Event) => {
      const d = (e as CustomEvent<{
        reason?: string;
        live_view_url?: string;
        resume_when?: string;
        url?: string;
      }>).detail;
      setHumanInputReq({
        reason: d?.reason?.trim() || 'Complete this step in the live browser.',
        liveViewUrl: d?.live_view_url ?? null,
        resumeWhen: d?.resume_when,
      });
      if (d?.url?.trim()) void openAgentLiveSession(d.url, d.live_view_url);
      else if (d?.live_view_url?.trim()) setAgentLiveIframeUrl(d.live_view_url.trim());
    };
    const onHumanResumed = () => setHumanInputReq(null);
    window.addEventListener('iam-browser-agent-live', onAgentLive as EventListener);
    window.addEventListener('iam-browser-human-input-required', onHumanInput as EventListener);
    window.addEventListener('iam-browser-human-input-resumed', onHumanResumed);
    return () => {
      window.removeEventListener('iam-browser-agent-live', onAgentLive as EventListener);
      window.removeEventListener('iam-browser-human-input-required', onHumanInput as EventListener);
      window.removeEventListener('iam-browser-human-input-resumed', onHumanResumed);
    };
  }, [openAgentLiveSession]);

  useEffect(() => {
    const onPending = (e: Event) => {
      const d = (e as CustomEvent<{ url?: string }>).detail;
      if (!d?.url?.trim()) return;
      setLiveUrlPending(normalize(d.url));
    };
    const onCommitted = (e: Event) => {
      const d = (e as CustomEvent<{
        url?: string;
        title?: string;
        verified?: boolean;
        live_view_url?: string;
        session_id?: string;
      }>).detail;
      if (!d?.url?.trim() || d.verified === false) return;
      const n = normalize(d.url);
      setLiveUrlPending(null);
      setLiveUrlCommitted(n);
      setLiveSessionReady(true);
      setCurrentUrl(n);
      setInputVal(n);
      if (d.title) setLiveSessionTitle(String(d.title));
      if (d.session_id) browserRunSessionRef.current = String(d.session_id);
      if (d.live_view_url?.trim()) setAgentLiveIframeUrl(d.live_view_url.trim());
      onUrlCommitted?.(n);
    };
    window.addEventListener('iam-browser-url-pending', onPending as EventListener);
    window.addEventListener('iam-browser-url-committed', onCommitted as EventListener);
    return () => {
      window.removeEventListener('iam-browser-url-pending', onPending as EventListener);
      window.removeEventListener('iam-browser-url-committed', onCommitted as EventListener);
    };
  }, [onUrlCommitted, setAgentLiveIframeUrl]);

  const releaseBrowserRunSession = useCallback(async () => {
    const sid = browserRunSessionRef.current;
    const rid = agentRunId?.trim();
    if (!sid && !rid) return;
    browserRunSessionRef.current = null;
    await deleteBrowserRunLiveSession(sid || '', trustWorkspaceId, rid || null);
  }, [trustWorkspaceId, agentRunId]);

  useEffect(() => () => {
    void releaseBrowserRunSession();
  }, [releaseBrowserRunSession]);

  /** Passive embed — direct iframe to target URL (no MYBROWSER / Browser Run session). */
  const openPassiveIframeView = useCallback(
    async (raw: string) => {
      const s = raw.trim();
      if (!s || isVirtual(s)) return;
      const n = normalize(s);
      console.log('[browser] passive_iframe', JSON.stringify({ url: n.slice(0, 240) }));

      setNavigateError(null);
      setScreenshotUrl(null);
      setScreenshotErr(null);
      setMode('browse');
      setViewSurface('preview');
      setInspectedEl(null);
      setIframeBlocked(false);
      setLoading(true);

      await releaseBrowserRunSession();
      setIframeUrl(n);
      setCurrentUrl(n);
      setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(n) ? addressDisplay : n);
      onUrlCommitted?.(n);
      setLoading(false);
    },
    [addressDisplay, onUrlCommitted, releaseBrowserRunSession],
  );

  /** Automation-preview failure recovery: XFO hosts go to Browser Run live view, everything else to passive iframe. */
  const fallbackFromAutomation = useCallback(
    async (u: string) => {
      if (originRequiresBrowserRunEmbed(u) && openBrowserRunLiveViewRef.current) {
        await openBrowserRunLiveViewRef.current(u);
        return;
      }
      await openPassiveIframeView(u);
    },
    [openPassiveIframeView],
  );

  /** MYBROWSER / CDT automation preview — explicit screenshot path only (not agent live default). */
  const loadAutomationPreview = useCallback(
    async (targetUrl: string, preview?: BrowserPreviewPayload | null) => {
      const n = normalize(targetUrl);
      setCurrentUrl(n);
      setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(n) ? addressDisplay : n);
      onUrlCommitted?.(n);
      setMode('browse');
      setNavigateError(null);
      setInspectedEl(null);
      setIframeBlocked(false);

      if (preview?.screenshot_url) {
        setScreenshotUrl(preview.screenshot_url);
        setLoading(false);
        return;
      }

      setLoading(true);
      setScreenshotUrl(null);
      const navTool = registryPickersRef.current.navigate || 'browser_navigate';
      try {
        const data = await invokeCdt(navTool, {
          url: n,
          automation: true,
          ...(agentRunId?.trim() ? { agent_run_id: agentRunId.trim() } : {}),
        });
        if (data.error) {
          setNavigateError(String(data.error));
          await openPassiveIframeView(n);
          return;
        }
        const { screenshot_url } = pickNavigatePreview(data);
        const resolvedUrl =
          typeof data.url === 'string' && data.url.trim() ? data.url.trim() : n;
        setCurrentUrl(resolvedUrl);
        setInputVal(
          addressDisplay?.trim() && /^(blob:|data:)/i.test(resolvedUrl)
            ? addressDisplay
            : resolvedUrl,
        );
        onUrlCommitted?.(resolvedUrl);
        if (screenshot_url) {
          setScreenshotUrl(screenshot_url);
        } else {
          setNavigateError('Automation finished but no screenshot_url was returned');
          await openPassiveIframeView(resolvedUrl);
        }
      } catch (e) {
        setNavigateError(String(e));
        await openPassiveIframeView(n);
      } finally {
        setLoading(false);
      }
    },
    [addressDisplay, agentRunId, onUrlCommitted, openPassiveIframeView],
  );

  /** Browser Run Live View (live.browser.run) — tab-mode page watch; agent-only / explicit fallback. */
  const openBrowserRunLiveView = useCallback(
    async (raw: string) => {
      const s = raw.trim();
      if (!s || isVirtual(s)) return;
      const n = normalize(s);
      console.log('[browser] live_view_requested', JSON.stringify({ url: n.slice(0, 240) }));

      setNavigateError(null);
      setScreenshotUrl(null);
      setScreenshotErr(null);
      setMode('browse');
      setViewSurface('agentLive');
      setInspectedEl(null);
      setIframeBlocked(false);
      setLoading(true);

      try {
        const data = await createBrowserRunLiveSession(
          n,
          trustWorkspaceId,
          browserRunSessionRef.current,
          agentRunId,
        );
        if (data.error || !data.devtools_frontend_url) {
          setNavigateError(data.error || 'Browser Run session did not return a live view URL');
          return;
        }
        browserRunSessionRef.current = data.session_id || browserRunSessionRef.current;
        const destUrl = data.url?.trim() || n;
        setAgentLiveIframeUrl(data.devtools_frontend_url);
        setCurrentUrl(destUrl);
        setInputVal(addressDisplay?.trim() && /^(blob:|data:)/i.test(destUrl) ? addressDisplay : destUrl);
        onUrlCommitted?.(destUrl);
      } catch (e) {
        setNavigateError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [addressDisplay, onUrlCommitted, trustWorkspaceId],
  );

  const ensureOriginTrust = useCallback(
    async (url: string): Promise<boolean> => {
      const n = normalize(url);
      const origin = originOf(n);
      if (sessionTrusted.has(origin)) return true;
      const trust = await checkTrust(origin, trustWorkspaceId);
      if (trust.skip_approval || trust.trusted) {
        setSessionTrusted((prev) => new Set([...prev, origin]));
        return true;
      }
      const scope = await requestTrust(n);
      if (!scope) return false;
      if (scope === 'persistent') await writeTrust(origin, 'persistent', trustWorkspaceId);
      setSessionTrusted((prev) => new Set([...prev, origin]));
      return true;
    },
    [sessionTrusted, requestTrust, trustWorkspaceId],
  );

  const navigate = useCallback(
    async (
      raw: string,
      opts?: { preview?: BrowserPreviewPayload | null; automation?: boolean; agentLive?: boolean },
    ) => {
      const s = raw.trim();
      if (!s || isVirtual(s)) return;
      await loadRegistryPickersIfNeeded();
      const n = normalize(s);
      if (!(await ensureOriginTrust(n))) return;
      const requiresBrowserRun = originRequiresBrowserRunEmbed(n);
      const isPassiveEditorUrl =
        !requiresBrowserRun &&
        (previewSource === 'editor' ||
        /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(n) ||
        n.startsWith('blob:'));
      if (opts?.agentLive === false && opts?.automation === false && !requiresBrowserRun) {
        setViewSurface('preview');
        await openPassiveIframeView(raw);
        return;
      }
      if (requiresBrowserRun && opts?.automation !== true) {
        // Embed policy overrides agentLive:false hints (URL bar) — XFO hosts can never passive-iframe.
        await openBrowserRunLiveView(n);
        return;
      }
      const useAgentLive =
        !isPassiveEditorUrl &&
        (opts?.agentLive === true ||
          (opts?.agentLive !== false &&
            Boolean(agentRunId?.trim()) &&
            !opts?.preview?.screenshot_url));
      if (useAgentLive) {
        await openAgentLiveSession(n);
        return;
      }
      if (!isPassiveEditorUrl && (opts?.automation === true || Boolean(opts?.preview?.screenshot_url))) {
        await loadAutomationPreview(n, opts?.preview ?? null);
        return;
      }
      setViewSurface('preview');
      await openPassiveIframeView(raw);
    },
    [
      agentRunId,
      ensureOriginTrust,
      loadAutomationPreview,
      loadRegistryPickersIfNeeded,
      openAgentLiveSession,
      openBrowserRunLiveView,
      openPassiveIframeView,
      previewSource,
    ],
  );

  // ── Sync parent/agent URL → iframe or MYBROWSER preview (not URL-bar keystrokes) ─
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const n = normalize(initialUrl);
    if (n === currentUrlRef.current) return;
    const requiresBrowserRun = originRequiresBrowserRunEmbed(n);
    const passiveEditor =
      !requiresBrowserRun &&
      (previewSource === 'editor' ||
      /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(n) ||
      n.startsWith('blob:'));
    void navigateRef.current(n, {
      preview: initialPreview?.screenshot_url ? initialPreview : null,
      automation: requiresBrowserRun
        ? false
        : passiveEditor
          ? false
          : initialAutomation === true || Boolean(initialPreview?.screenshot_url),
      agentLive: requiresBrowserRun
        ? true
        : passiveEditor
          ? false
          : initialAgentLive === true || Boolean(agentRunId?.trim()),
    });
  }, [initialUrl, initialPreview, initialAutomation, initialAgentLive, previewSource, agentRunId]);

  // ── Screenshot (Playwright) ─────────────────────────────────────────────────
  const runScreenshot = useCallback(async (clip?: { x: number; y: number; width: number; height: number }) => {
    await loadRegistryPickersIfNeeded();
    setMode('screenshot');
    setScreenshotLoad(true);
    setScreenshotUrl(null);
    setScreenshotErr(null);
    const ac = new AbortController();
    const to = window.setTimeout(() => ac.abort(), 30000);
    try {
      const shotTool = registryPickersRef.current.screenshot || 'cdt_take_screenshot';
      const body = {
        tool_name: shotTool,
        params: {
          url: currentUrl,
          fullPage: !clip,
          ...(clip ? { clip } : {}),
          ...(agentRunId?.trim() ? { agent_run_id: agentRunId.trim() } : {}),
        },
      };
      const res = await fetch('/api/browser/invoke', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body:        JSON.stringify(body),
        signal:      ac.signal,
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      let url = pickInvokeScreenshotUrl(data);
      const statusStr = String(data.status || '');

      if (!url && res.ok && statusStr === 'pending') {
        const jobId = data.id != null ? String(data.id) : '';
        if (!jobId) {
          setScreenshotErr(SCREENSHOT_TIMEOUT_MSG);
          return;
        }
        await sleepMs(5000, ac.signal);
        const job = await fetchPlaywrightJobOnce(jobId, ac.signal);
        if (!job) {
          setScreenshotErr(SCREENSHOT_TIMEOUT_MSG);
          return;
        }
        if (job.status === 'error' || job.status === 'failed') {
          throw new Error(String(job.error || 'Screenshot job failed'));
        }
        url = pickScreenshotUrl(job) || undefined;
        if (!url && String(job?.status || '') === 'pending') {
          setScreenshotErr(SCREENSHOT_TIMEOUT_MSG);
          return;
        }
      }

      if (!res.ok || !url) {
        if (ac.signal.aborted) {
          setScreenshotErr(SCREENSHOT_TIMEOUT_MSG);
          return;
        }
        throw new Error(String(data.error || 'No screenshot URL returned'));
      }
      setScreenshotUrl(url);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setScreenshotErr(SCREENSHOT_TIMEOUT_MSG);
      } else {
        setScreenshotErr(String(e));
      }
    } finally {
      window.clearTimeout(to);
      setScreenshotLoad(false);
    }
  }, [currentUrl, agentRunId, loadRegistryPickersIfNeeded]);

  // ── Hard reload ─────────────────────────────────────────────────────────────
  const hardReload = useCallback(() => {
    if (browserRunSessionRef.current || originRequiresBrowserRunEmbed(currentUrl)) {
      void openBrowserRunLiveView(currentUrl);
    } else if (iframeUrl?.trim()) {
      setLoading(true);
      const u = currentUrl;
      setIframeUrl('');
      window.requestAnimationFrame(() => setIframeUrl(u));
    } else {
      void openPassiveIframeView(currentUrl);
    }
    setMenuOpen(false);
  }, [currentUrl, iframeUrl, openBrowserRunLiveView, openPassiveIframeView]);

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
    setMode(prev => (prev === m ? 'browse' : m));
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
          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-muted">
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
          value={
            viewSurface === 'agentLive'
              ? liveUrlCommitted || (liveSessionReady ? inputVal : '')
              : inputVal
          }
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            const n = normalizeUrl(inputVal);
            if (n) void navigate(n, { automation: false, agentLive: false });
          }}
          placeholder={
            viewSurface === 'agentLive' && !liveSessionReady
              ? 'Starting live browser…'
              : 'https://'
          }
          readOnly={viewSurface === 'agentLive' && agentActive}
          spellCheck={false}
          aria-label="URL"
          className={`flex-1 min-w-0 h-6 px-2 text-[11px] rounded border border-[var(--border-subtle)] bg-[var(--bg-app)] focus:outline-none focus:border-[var(--color-primary)] font-mono text-main placeholder:text-muted ${
            viewSurface === 'agentLive' && agentActive ? 'opacity-90 cursor-default' : ''
          }`}
        />
        {viewSurface === 'agentLive' && liveUrlPending && liveUrlPending !== liveUrlCommitted ? (
          <span className="shrink-0 text-[9px] font-mono text-amber-400/90 max-w-[28%] truncate" title={liveUrlPending}>
            → {liveUrlPending.replace(/^https?:\/\//, '')}
          </span>
        ) : null}

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
          onClick={openDevTools}
        />

        <ToolBtn
          icon={<Layers size={12} strokeWidth={1.75} />}
          title="Open Elements inspector"
          active={devToolsOpen && devToolsTab === 'elements'}
          onClick={() => {
            void (async () => {
              await loadRegistryPickersIfNeeded();
              const u = currentUrlRef.current?.trim();
              if (u) await syncPickerViewport(u);
              setDevToolsSession((n) => n + 1);
              setDevToolsOpen(true);
              setDevToolsTab('elements');
            })();
          }}
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
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-main hover:bg-[var(--bg-hover)] transition-colors text-left">
                <Camera size={12} className="text-muted shrink-0" /> Take Screenshot
              </button>

              <button type="button" onClick={() => { setMenuOpen(false); toggleMode('area'); }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-main hover:bg-[var(--bg-hover)] transition-colors text-left">
                <Camera size={12} className="text-muted shrink-0" /> Capture Area Screenshot
              </button>

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              <button type="button" onClick={hardReload}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-main hover:bg-[var(--bg-hover)] transition-colors text-left">
                <RotateCcw size={12} className="text-muted shrink-0" /> Hard Reload
              </button>

              <button type="button" onClick={copyUrl}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-main hover:bg-[var(--bg-hover)] transition-colors text-left">
                {copied ? <CheckCircle size={12} className="text-green-400 shrink-0" /> : <Copy size={12} className="text-muted shrink-0" />}
                {copied ? 'Copied!' : 'Copy Current URL'}
              </button>

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              {/* Zoom */}
              <div className="flex items-center gap-2 px-3 py-1.5">
                <button type="button" onClick={() => setZoom(z => Math.max(25, z - 25))}
                  className="p-0.5 rounded text-muted hover:text-main hover:bg-[var(--bg-hover)] transition-colors">
                  <ZoomOut size={12} />
                </button>
                <span className="flex-1 text-center text-[11px] font-mono text-main">{zoom}%</span>
                <button type="button" onClick={() => setZoom(z => Math.min(200, z + 25))}
                  className="p-0.5 rounded text-muted hover:text-main hover:bg-[var(--bg-hover)] transition-colors">
                  <ZoomIn size={12} />
                </button>
              </div>

              <div className="h-px bg-[var(--border-subtle)] my-1" />

              <button type="button" onClick={() => clearBrowserData('history')}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-left">
                <Trash2 size={12} className="shrink-0" /> Clear Browsing History
              </button>
              <button type="button" onClick={() => clearBrowserData('cookies')}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-left">
                <Cookie size={12} className="shrink-0" /> Clear Cookies
              </button>
              <button type="button" onClick={() => clearBrowserData('cache')}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors text-left">
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
      {agentActive && viewSurface === 'agentLive' && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--color-primary)]/10 border-b border-[var(--color-primary)]/20 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--color-primary)]">
            Agent Live Session — shared Browser Run
          </span>
          {liveWsConnected ? (
            <span className="ml-auto text-[9px] text-muted">live channel connected</span>
          ) : null}
          {(liveSessionTitle || wsLiveSession?.title) ? (
            <span className="ml-2 truncate text-[9px] text-muted max-w-[40%]">
              {liveSessionTitle || wsLiveSession?.title}
            </span>
          ) : null}
        </div>
      )}

      {viewSurface === 'agentLive' && timelineEvents.length > 0 ? (
        <BrowserLiveTimeline events={timelineEvents} />
      ) : null}

      {/* Human-in-the-loop */}
      {humanInputReq && (
        <div className="flex flex-col gap-2 px-3 py-2 bg-amber-500/10 border-b border-amber-500/30 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-amber-200">Agent needs you</p>
              <p className="text-[10px] text-muted mt-0.5">{humanInputReq.reason}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                className="px-2 py-1 text-[10px] rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-panel)]"
                onClick={() => {
                  const rid = agentRunId?.trim();
                  if (rid) void cancelBrowserHumanInput(rid, trustWorkspaceId);
                  setHumanInputReq(null);
                  window.dispatchEvent(new CustomEvent('iam-browser-human-input-resumed'));
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-2 py-1 text-[10px] rounded bg-[var(--color-primary)] text-white"
                onClick={() => {
                  const rid = agentRunId?.trim();
                  if (rid) void resumeBrowserHumanInput(rid, trustWorkspaceId);
                  setHumanInputReq(null);
                  window.dispatchEvent(new CustomEvent('iam-browser-human-input-resumed'));
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {agentActive && viewSurface === 'preview' && !humanInputReq && (
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
              <div className="flex flex-1 min-h-0 relative flex-col overflow-hidden">
                {hasLiveView && (
                <iframe
                  ref={iframeRef}
                  key={iframeUrl}
                  src={iframeUrl}
                  title="Browser Run live view"
                  allow="clipboard-read; clipboard-write"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads allow-modals"
                  style={{ zoom: zoom !== 100 ? zoom / 100 : undefined }}
                  className={`w-full flex-1 min-h-0 border-0 bg-white transition-opacity duration-150 ${
                    (mode === 'browse' || mode === 'picker' || mode === 'area') && !iframeBlocked && !screenshotUrl
                      ? 'opacity-100'
                      : 'opacity-0 pointer-events-none'
                  }`}
                  onLoad={() => {
                    setLoading(false);
                    injectNavigationBridge();
                    if (mode === 'picker') injectPickerScript();
                  }}
                  onError={() => { setLoading(false); setIframeBlocked(true); }}
                />
                )}

                {!hasLiveView && !screenshotUrl && !loading && !navigateError && mode === 'browse' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center bg-[var(--bg-app)]">
                    <Globe size={32} strokeWidth={1.5} className="text-muted" />
                    <p className="text-sm font-medium text-muted">Browser</p>
                    <p className="text-[11px] text-muted max-w-sm leading-relaxed">
                      Enter a URL above, or instruct the Agent to navigate and use the browser
                    </p>
                  </div>
                )}

                {loading && mode === 'browse' && !screenshotUrl && (
                  <div className="absolute top-0 left-0 right-0 bottom-0 z-[6] flex flex-col items-center justify-center gap-3 bg-[var(--bg-app)]/90">
                    <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
                    <p className="text-[11px] text-muted">
                      {browserRunSessionRef.current ? 'Starting Browser Run live view…' : 'Loading page…'}
                    </p>
                  </div>
                )}

                {navigateError && mode === 'browse' && !screenshotUrl && (
                  <div className="absolute top-0 left-0 right-0 bottom-0 z-10 flex flex-col min-h-0 bg-[var(--bg-app)] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={14} className="text-red-400 shrink-0" />
                      <span className="text-[11px] font-semibold text-red-400">Browser Run live view failed</span>
                    </div>
                    <pre className="text-[10px] text-red-400/90 font-mono bg-[var(--bg-panel)] rounded p-3 whitespace-pre-wrap flex-1 overflow-auto">{navigateError}</pre>
                    <button
                      type="button"
                      onClick={() => void openBrowserRunLiveView(currentUrl)}
                      className="mt-3 text-[10px] text-[var(--color-primary)] underline self-start"
                    >
                      Retry live view
                    </button>
                  </div>
                )}

                {iframeBlocked && mode === 'browse' && !screenshotUrl && !navigateError && (
                  <div className="absolute top-0 left-0 right-0 bottom-0 z-10 flex flex-col min-h-0 bg-[var(--bg-app)]">
                    <BlockedPage url={currentUrl} onScreenshot={runScreenshot} />
                  </div>
                )}

                {(mode === 'browse' || mode === 'picker' || mode === 'area') && screenshotUrl && (
                  <div
                    className="absolute top-0 left-0 right-0 bottom-0 z-[5] flex flex-col min-h-0 overflow-auto bg-[var(--bg-app)]"
                    style={{ zoom: zoom !== 100 ? zoom / 100 : undefined }}
                  >
                    {loading && (
                      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-8">
                        <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
                        <p className="text-[11px] text-muted">Loading automation preview…</p>
                      </div>
                    )}
                    {!loading && navigateError && (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-red-400 shrink-0" />
                          <span className="text-[11px] font-semibold text-red-400">Automation preview failed</span>
                        </div>
                        <pre className="text-[10px] text-red-400/90 font-mono bg-[var(--bg-panel)] rounded p-3 whitespace-pre-wrap">{navigateError}</pre>
                        <button
                          type="button"
                          onClick={() => void loadAutomationPreview(currentUrl)}
                          className="text-[10px] text-[var(--color-primary)] underline"
                        >
                          Retry automation
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setScreenshotUrl(null);
                            setNavigateError(null);
                            void navigate(currentUrl);
                          }}
                          className="ml-3 text-[10px] text-muted underline"
                        >
                          Open live view
                        </button>
                      </div>
                    )}
                    {!loading && !navigateError && (
                      <img
                        src={screenshotUrl}
                        alt={`Automation preview: ${currentUrl}`}
                        className="w-full h-auto block bg-white"
                      />
                    )}
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
                        <p className="text-[11px] text-muted">Capturing via Playwright...</p>
                      </div>
                    ) : screenshotErr ? (
                      <div className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={13} className="text-red-400" />
                          <span className="text-[11px] font-semibold text-red-400">Capture incomplete</span>
                          <button type="button" onClick={() => setMode('browse')} className="ml-auto text-[10px] text-muted hover:text-main underline">Back</button>
                        </div>
                        <pre className="text-[10px] text-red-400 font-mono bg-[var(--bg-panel)] rounded p-3 whitespace-pre-wrap">{screenshotErr}</pre>
                      </div>
                    ) : screenshotUrl ? (
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={13} className="text-green-400" />
                          <span className="text-[11px] font-semibold text-main">Screenshot captured</span>
                          <button type="button" onClick={() => setMode('browse')} className="ml-auto text-[10px] text-muted hover:text-main underline">Back</button>
                        </div>
                        <img src={screenshotUrl} alt="screenshot" className="w-full rounded-lg border border-[var(--border-subtle)]" />
                      </div>
                    ) : null}
                  </div>
                )}

                {mode === 'picker' && pickerCrossOrigin && (hasLiveView || iframeBlocked) && !screenshotUrl && (
                  <div
                    className="absolute inset-0 z-[25] cursor-crosshair"
                    style={{ zoom: zoom !== 100 ? zoom / 100 : undefined }}
                    onMouseMove={onPickerOverlayMove}
                    onMouseLeave={() => setPickerHighlight(null)}
                    onClick={onPickerOverlayClick}
                    role="presentation"
                    aria-hidden
                  >
                    {pickerHighlight && pickerHighlight.width > 0 && pickerHighlight.height > 0 && (
                      <div
                        className="pointer-events-none absolute border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/10 rounded-sm transition-all duration-75"
                        style={{
                          top: pickerHighlight.top,
                          left: pickerHighlight.left,
                          width: pickerHighlight.width,
                          height: pickerHighlight.height,
                        }}
                      />
                    )}
                  </div>
                )}

                {mode === 'picker' && !inspectedEl && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
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
                  key={`${devToolsSession}-${inspectEpoch}`}
                  url={currentUrl}
                  onClose={() => setDevToolsOpen(false)}
                  tab={devToolsTab}
                  onTabChange={setDevToolsTab}
                  inspectedElement={inspectedEl}
                  inspectSameOrigin={inspectSameOrigin}
                  registryPickers={registryPickers}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {toastMsg && (
        <div className="shrink-0 px-3 py-1.5 text-center text-[10px] bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] text-muted">
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
  /** Persist user-entered URL to parent state (survives tab remounts). */
  onUrlCommitted?: (url: string) => void;
  /** `agentsam_agent_run.id` from chat SSE — full-page screenshot POST only. */
  agentRunId?:     string | null;
  workspaceContext?: AgentWorkspaceContextPacket | null;
  /** Editor-sourced opens must never escalate to MYBROWSER / Agent Live. */
  previewSource?:  'editor' | 'agent';
}

export const BrowserView: React.FC<BrowserViewProps> = ({
  url: urlFromParent,
  addressDisplay,
  onUrlCommitted,
  agentRunId = null,
  workspaceContext: _workspaceContext = null,
  previewSource = 'agent',
}) => {
  const [primaryUrl,         setPrimaryUrl]         = useState(() => urlFromParent?.trim() || '');
  const [primaryAutomation, setPrimaryAutomation] = useState(false);
  const [primaryAgentLive,  setPrimaryAgentLive]  = useState(() => Boolean(agentRunId?.trim()));
  const [primaryPreview,    setPrimaryPreview]    = useState<BrowserPreviewPayload | null>(null);
  const urlFromParentRef = useRef(urlFromParent);

  useEffect(() => {
    if (previewSource === 'editor' || !agentRunId?.trim()) return;
    setPrimaryAgentLive(true);
  }, [agentRunId, previewSource]);

  const commitUrlToParent = useCallback(
    (url: string) => {
      setPrimaryAutomation(false);
      setPrimaryAgentLive(false);
      setPrimaryPreview(null);
      onUrlCommitted?.(url);
    },
    [onUrlCommitted],
  );

  // Parent App state after user commit or agent surface_open — not the stale default on first mount.
  useEffect(() => {
    const u = urlFromParent?.trim();
    if (!u) return;
    urlFromParentRef.current = urlFromParent;
    if (u === primaryUrl) return;
    setPrimaryUrl(u);
    if (previewSource === 'editor') {
      setPrimaryAutomation(false);
      setPrimaryAgentLive(false);
      setPrimaryPreview(null);
    }
  }, [urlFromParent, primaryUrl, previewSource]);

  const [secondaryUrl,    setSecondaryUrl]    = useState<string | null>(null);

  // ── Window event listeners (Agent Sam navigation) ───────────────────────────
  useEffect(() => {
    const onAgentOpenSurface = (e: Event) => {
      const d = (e as CustomEvent<{ surface?: string; agent_live?: boolean; url?: string }>).detail;
      if (String(d?.surface || '').toLowerCase() !== 'browser') return;
      if (d?.agent_live) setPrimaryAgentLive(true);
      if (d?.url?.trim()) setPrimaryUrl(d.url.trim());
    };
    const onPrimary = (e: Event) => {
      const d = (e as CustomEvent<{
        url?: string;
        screenshot_url?: string;
        automation?: boolean;
        agent_live?: boolean;
        live_view_url?: string;
        session_id?: string;
      }>).detail;
      if (d?.url) {
        setPrimaryUrl(d.url);
        const hasLive = Boolean(d.live_view_url?.trim());
        const agentLivePreferred =
          hasLive ||
          d.agent_live === true ||
          d.automation === true ||
          Boolean(agentRunId?.trim());
        setPrimaryAutomation(d.automation === true && !agentLivePreferred);
        setPrimaryAgentLive(agentLivePreferred && !d.screenshot_url);
        if (d.screenshot_url) {
          setPrimaryPreview({ screenshot_url: d.screenshot_url });
        } else {
          setPrimaryPreview(null);
        }
        if (agentLivePreferred) {
          window.dispatchEvent(
            new CustomEvent('iam-browser-agent-live', {
              detail: {
                url: d.url,
                live_view_url: d.live_view_url,
                session_id: d.session_id,
                agent_run_id: agentRunId || undefined,
              },
            }),
          );
        }
      }
    };
    const onSecondary = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url;
      if (url) setSecondaryUrl(url);
    };
    window.addEventListener('iam:agent-open-surface', onAgentOpenSurface as EventListener);
    window.addEventListener('iam-browser-navigate',           onPrimary);
    window.addEventListener('iam-browser-navigate-secondary', onSecondary);
    return () => {
      window.removeEventListener('iam:agent-open-surface', onAgentOpenSurface as EventListener);
      window.removeEventListener('iam-browser-navigate',           onPrimary);
      window.removeEventListener('iam-browser-navigate-secondary', onSecondary);
    };
  }, [agentRunId]);

  return (
    <div className="flex w-full h-full overflow-hidden bg-[var(--bg-app)] flex-col">
      <div className="flex w-full min-h-0 flex-1 overflow-hidden">
      <div className={`flex flex-col min-h-0 min-w-0 overflow-hidden transition-all duration-200 ${
        secondaryUrl ? 'w-1/2 border-r border-[var(--border-subtle)]' : 'w-full'
      }`}>
        <BrowserPane
          initialUrl={primaryUrl}
          initialPreview={primaryPreview}
          initialAutomation={primaryAutomation}
          initialAgentLive={primaryAgentLive}
          previewSource={previewSource}
          addressDisplay={addressDisplay}
          label={secondaryUrl ? 'A' : undefined}
          isSplit={!!secondaryUrl}
          onSplit={url => setSecondaryUrl(url)}
          onUrlCommitted={commitUrlToParent}
          agentRunId={previewSource === 'editor' ? null : agentRunId}
          autoFocus
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
          agentRunId={agentRunId}
          />
        </div>
      )}
      </div>
    </div>
  );
};

export default BrowserView;
