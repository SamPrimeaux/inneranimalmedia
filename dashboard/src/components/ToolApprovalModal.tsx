import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Code2, ExternalLink, Play, Copy, ShieldAlert, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { ActiveFile } from '../../types';

type Approval = {
  id: string;
  tool_name: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  preview_sql?: string;
  preview_command?: string;
  server_display_name?: string;
  is_mcp_server: boolean;
  queue_count: number;
};

const BACKOFF_MS = [5000, 15000, 45000];
const RECENT_PENDING_MS = 120_000;

const LARGE_CHARS = 4000;
const LARGE_LINES = 48;
const TRUNCATE_LINES = 32;

const SQL_KW = new Set(
  `select from where update set and or insert into values delete create alter drop table index null is like join left right inner outer on as order by group having limit offset with returning public begin commit rollback transaction case when then else end distinct union all exists not in between asc desc primary key references default constraint cascade`.split(
    /\s+/,
  ),
);

type ToolApprovalModalProps = {
  workspaceId?: string | null;
  agentRunId?: string | null;
  toolExecutionActive?: boolean;
  chatSessionId?: string | null;
  onOpenInEditor?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => void;
  /** @deprecated Fixed dock removed — always inline in chat column. */
  docked?: boolean;
  className?: string;
};

function shouldPollApprovals(opts: {
  pathname: string;
  hasVisibleApproval: boolean;
  workspaceId: string;
  agentRunId: string | null;
  toolExecutionActive: boolean;
  recentPending: boolean;
  chatSessionId: string;
}): boolean {
  const { pathname, hasVisibleApproval, workspaceId, agentRunId, toolExecutionActive, recentPending, chatSessionId } =
    opts;
  if (!workspaceId) return false;
  const onAgentRoute = pathname.toLowerCase().startsWith('/dashboard/agent');
  if (hasVisibleApproval) return true;
  if (toolExecutionActive) return true;
  if (agentRunId) return true;
  if (recentPending && onAgentRoute) return true;
  if (!onAgentRoute) return false;
  if (!chatSessionId.trim()) return false;
  return false;
}

function formatActionTitle(toolName: string, description: string): string {
  const d0 = String(description || '')
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  if (d0 && d0.length >= 4 && d0.length <= 120) return d0;
  const raw = String(toolName || '').trim();
  if (raw) {
    const t = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 72 ? t.slice(0, 70) + '…' : t;
  }
  return d0 || 'Approval required';
}

function isDeployLike(a: Approval): boolean {
  const blob = `${a.tool_name} ${a.description}`.toLowerCase();
  return (
    /\bdeploy\b/.test(blob) ||
    /\bwrangler\b/.test(blob) ||
    /\bedge\s*function\b/.test(blob) ||
    /\bgithub\b.*\b(push|repo)\b/.test(blob) ||
    /\bfunctions?\b.*\bdeploy\b/.test(blob)
  );
}

function looksLikeSql(s: string): boolean {
  const t = s.trim().slice(0, 400).toLowerCase();
  return /^\s*(select|insert|update|delete|with|create|alter|drop|truncate|explain)\b/.test(t);
}

function riskStyles(level: Approval['risk_level']): { pill: string; ring: string } {
  switch (level) {
    case 'critical':
      return {
        pill: 'bg-red-500/15 text-red-300 border-red-400/30',
        ring: 'ring-red-400/25',
      };
    case 'high':
      return {
        pill: 'bg-amber-500/12 text-amber-200 border-amber-400/28',
        ring: 'ring-amber-400/20',
      };
    case 'medium':
      return {
        pill: 'bg-yellow-500/10 text-yellow-200/90 border-yellow-400/22',
        ring: 'ring-yellow-400/15',
      };
    default:
      return {
        pill: 'bg-emerald-500/10 text-emerald-200/90 border-emerald-400/22',
        ring: 'ring-emerald-400/12',
      };
  }
}

function highlightSqlLine(line: string, keyPrefix: string): React.ReactNode {
  if (line === '') return '\u00A0';
  const tokenRe =
    /('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|--[^\n]*|\w+|[(),;]|\s+)/g;
  const parts: React.ReactNode[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = tokenRe.exec(line)) !== null) {
    const tok = m[0];
    const k = `${keyPrefix}-${i++}`;
    if (/^\s+$/.test(tok) || tok.startsWith('--') || tok.startsWith('/*')) {
      parts.push(
        <span key={k} className="text-[var(--dashboard-muted)]/80">
          {tok}
        </span>,
      );
      continue;
    }
    if (tok.startsWith("'") || tok.startsWith('"')) {
      parts.push(
        <span key={k} className="text-emerald-300/90">
          {tok}
        </span>,
      );
      continue;
    }
    if (/^[,();]$/.test(tok)) {
      parts.push(
        <span key={k} className="text-[var(--dashboard-muted)]">
          {tok}
        </span>,
      );
      continue;
    }
    if (/^\w+$/.test(tok) && SQL_KW.has(tok.toLowerCase())) {
      parts.push(
        <span key={k} className="text-sky-300/95 font-medium">
          {tok}
        </span>,
      );
      continue;
    }
    parts.push(
      <span key={k} className="text-[var(--dashboard-text)]/95">
        {tok}
      </span>,
    );
  }
  return parts;
}

function SqlPreviewBody({ text, truncated }: { text: string; truncated: boolean }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((ln, li) => (
        <div key={li} className="whitespace-pre [overflow-wrap:anywhere]">
          {highlightSqlLine(ln, `L${li}`)}
        </div>
      ))}
      {truncated ? (
        <div className="mt-2 text-[0.65rem] text-[var(--dashboard-muted)] border-t border-white/[0.06] pt-2">
          Truncated — open in editor for the full script.
        </div>
      ) : null}
    </>
  );
}

export function ToolApprovalModal({
  workspaceId = null,
  agentRunId = null,
  toolExecutionActive = false,
  chatSessionId = null,
  onOpenInEditor,
  className = '',
}: ToolApprovalModalProps) {
  const location = useLocation();
  const [approval, setApproval] = useState<Approval | null>(null);
  const approvalRef = useRef<Approval | null>(null);
  approvalRef.current = approval;

  const [previewOpen, setPreviewOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [pollStopped401, setPollStopped401] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPendingSignalRef = useRef(0);

  const ws = typeof workspaceId === 'string' ? workspaceId.trim() : '';
  const sid = typeof chatSessionId === 'string' ? chatSessionId.trim() : '';

  useEffect(() => {
    if (!location.pathname.toLowerCase().startsWith('/dashboard/agent')) {
      setApproval(null);
      setOutcome(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    setApproval(null);
    setOutcome(null);
  }, [sid]);

  useEffect(() => {
    let cancelled = false;
    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    async function run() {
      if (cancelled || pollStopped401) return;
      if (!ws) {
        kick(30_000);
        return;
      }
      if (document.hidden) {
        kick(8000);
        return;
      }
      const recentPending = Date.now() - lastPendingSignalRef.current < RECENT_PENDING_MS;
      if (
        !shouldPollApprovals({
          pathname: location.pathname,
          hasVisibleApproval: approvalRef.current != null,
          workspaceId: ws,
          agentRunId: agentRunId ?? null,
          toolExecutionActive,
          recentPending,
          chatSessionId: sid,
        })
      ) {
        kick(45_000);
        return;
      }
      try {
        const runQ = agentRunId?.trim() ? `&run_id=${encodeURIComponent(agentRunId.trim())}` : '';
        const sessionQ = sid ? `&session_id=${encodeURIComponent(sid)}` : '';
        const r = await fetch(
          `/api/agent/approval/pending?workspace_id=${encodeURIComponent(ws)}${runQ}${sessionQ}`,
          { credentials: 'same-origin' },
        );
        if (r.status === 401) {
          setPollStopped401(true);
          return;
        }
        if (r.status === 400) {
          kick(20_000);
          return;
        }
        if (!r.ok) {
          const i = Math.min(backoffRef.current, BACKOFF_MS.length - 1);
          backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length - 1);
          kick(BACKOFF_MS[i]);
          return;
        }
        backoffRef.current = 0;
        const d = (await r.json()) as { approval?: Approval | null; pending_count?: number };
        const pc = typeof d.pending_count === 'number' ? d.pending_count : d.approval?.queue_count ?? 0;
        if (pc > 0) lastPendingSignalRef.current = Date.now();
        if (!cancelled) {
          setApproval(d.approval ?? null);
          if (d.approval) {
            setOutcome(null);
            setPreviewOpen(true);
          }
        }
        kick(4000);
      } catch {
        const i = Math.min(backoffRef.current, BACKOFF_MS.length - 1);
        backoffRef.current = Math.min(backoffRef.current + 1, BACKOFF_MS.length - 1);
        kick(BACKOFF_MS[i]);
      }
    }

    function kick(delay: number) {
      clearTimer();
      timerRef.current = window.setTimeout(run, delay);
    }

    const onVis = () => {
      if (!document.hidden && !pollStopped401) kick(4000);
    };
    document.addEventListener('visibilitychange', onVis);
    backoffRef.current = 0;
    kick(4000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      clearTimer();
    };
  }, [location.pathname, pollStopped401, ws, agentRunId, toolExecutionActive, sid]);

  const preview = approval ? approval.preview_sql || approval.preview_command || '' : '';
  const previewLines = preview ? preview.split('\n').length : 0;
  const isLarge = preview.length > LARGE_CHARS || previewLines > LARGE_LINES;
  const displayPreview = useMemo(() => {
    if (!preview) return '';
    if (!isLarge) return preview;
    return preview.split('\n').slice(0, TRUNCATE_LINES).join('\n');
  }, [preview, isLarge]);

  const virtualName = useMemo(() => {
    if (!approval) return 'approval_preview.sql';
    const base = approval.tool_name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'approval';
    return looksLikeSql(preview) ? `${base}.sql` : `${base}.txt`;
  }, [approval, preview]);

  const openEditor = useCallback(() => {
    if (!preview.trim() || !onOpenInEditor) return;
    onOpenInEditor({ name: virtualName, content: preview });
  }, [preview, virtualName, onOpenInEditor]);

  const copyPreview = useCallback(async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      /* ignore */
    }
  }, [preview]);

  async function patchApproval(action: 'approved' | 'denied'): Promise<{ ok: boolean; error?: string }> {
    const id = approval?.id;
    if (!id) return { ok: false, error: 'No approval' };
    try {
      const r = await fetch(`/api/agent/approval/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: action }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return { ok: false, error: data.error || `Request failed (${r.status})` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message || 'Network error' };
    }
  }

  async function finishWithOutcome(
    action: 'approved' | 'denied',
    successText: string,
    clearAfterMs: number,
  ): Promise<void> {
    setLoading(true);
    const res = await patchApproval(action);
    setLoading(false);
    if (!res.ok) {
      setOutcome({ tone: 'err', text: res.error || 'Request failed' });
      return;
    }
    setOutcome({ tone: 'ok', text: successText });
    window.setTimeout(() => {
      setApproval(null);
      setOutcome(null);
    }, clearAfterMs);
  }

  async function addToAllowlistAndApprove(): Promise<void> {
    if (!approval) return;
    setAllowlistLoading(true);
    if (preview.trim()) {
      try {
        await fetch('/api/agent/allowlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ command: preview, workspace_id: ws }),
        });
      } catch {
        /* still try approve */
      }
    }
    setAllowlistLoading(false);
    await finishWithOutcome(
      'approved',
      preview.trim()
        ? 'Added to allowlist — agent continues.'
        : 'Approved — agent continues.',
      2800,
    );
  }

  if (!approval) return null;

  const deployish = isDeployLike(approval);
  const cancelLabel = deployish ? 'Skip' : 'Dismiss';
  const runLabel = deployish ? 'Deploy' : 'Run';
  const title = formatActionTitle(approval.tool_name, approval.description);
  const risk = riskStyles(approval.risk_level);
  const showSqlHighlight = looksLikeSql(displayPreview);
  const busy = loading || allowlistLoading;

  return (
    <div
      role="region"
      aria-label="Action approval"
      className={`w-full min-w-0 max-w-full shrink-0 ${className}`.trim()}
    >
      <div
        className={`relative w-full min-w-0 rounded-2xl border border-white/[0.08] bg-[color-mix(in_srgb,var(--dashboard-panel)_72%,transparent)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ${risk.ring} overflow-hidden`}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-black/[0.12]" aria-hidden />

        <div className="relative flex items-start gap-2.5 px-3 py-2.5 border-b border-white/[0.06]">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-200/90">
            <ShieldAlert size={15} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-medium leading-snug text-[var(--dashboard-text)] line-clamp-2">
              {title}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide ${risk.pill}`}
              >
                {approval.risk_level}
              </span>
              {approval.queue_count > 1 ? (
                <span className="text-[0.625rem] text-[var(--dashboard-muted)]">
                  +{approval.queue_count - 1} in queue
                </span>
              ) : null}
              {approval.is_mcp_server ? (
                <span className="text-[0.625rem] text-[var(--dashboard-muted)] truncate max-w-[10rem]">
                  {approval.server_display_name ?? 'MCP'}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            title="Dismiss"
            disabled={busy}
            onClick={() => void finishWithOutcome('denied', 'Dismissed.', 1200)}
            className="shrink-0 p-1 rounded-md text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        {preview ? (
          <div className="relative border-b border-white/[0.05]">
            <button
              type="button"
              onClick={() => setPreviewOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[0.6875rem] font-medium text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] hover:bg-white/[0.03] transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                <Code2 size={13} aria-hidden />
                {looksLikeSql(preview) ? 'SQL preview' : 'Command preview'}
              </span>
              {previewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {previewOpen ? (
              <div className="relative mx-2 mb-2 rounded-xl border border-white/[0.06] bg-black/25 overflow-hidden">
                <div className="flex items-center justify-end gap-0.5 px-1.5 py-1 border-b border-white/[0.05]">
                  <button
                    type="button"
                    title="Copy"
                    onClick={() => void copyPreview()}
                    className="p-1 rounded-md text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-white/[0.05] transition-colors"
                  >
                    <Copy size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Open in editor"
                    onClick={openEditor}
                    disabled={!onOpenInEditor}
                    className="p-1 rounded-md text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-white/[0.05] disabled:opacity-35 transition-colors"
                  >
                    <ExternalLink size={13} aria-hidden />
                  </button>
                </div>
                <pre
                  className="m-0 max-h-[min(28vh,200px)] overflow-auto px-2.5 py-2 text-[0.6875rem] font-mono leading-relaxed"
                  style={{ tabSize: 2 }}
                >
                  {showSqlHighlight ? (
                    <SqlPreviewBody text={displayPreview} truncated={isLarge} />
                  ) : (
                    <>
                      <span className="text-[var(--dashboard-text)]/95 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {displayPreview}
                      </span>
                      {isLarge ? (
                        <div className="mt-2 text-[0.65rem] text-[var(--dashboard-muted)] border-t border-white/[0.06] pt-2">
                          Large payload — open in editor.
                        </div>
                      ) : null}
                    </>
                  )}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}

        {outcome ? (
          <div
            className={`px-3 py-2 text-[0.72rem] border-b border-white/[0.05] ${
              outcome.tone === 'ok'
                ? 'bg-emerald-500/8 text-emerald-300'
                : 'bg-red-500/8 text-red-300'
            }`}
          >
            {outcome.text}
          </div>
        ) : null}

        <div className="relative flex flex-wrap items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void finishWithOutcome(
                'approved',
                looksLikeSql(preview)
                  ? 'Approved — results appear in chat after execution.'
                  : 'Approved — agent continues.',
                2800,
              )
            }
            className="inline-flex items-center justify-center gap-1.5 min-h-[2rem] px-3.5 rounded-lg text-[0.75rem] font-semibold text-[var(--solar-base03)] bg-[var(--solar-cyan)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_4px_14px_rgba(34,211,238,0.22)] hover:brightness-110 disabled:opacity-45 transition-all"
          >
            <Play size={13} className="fill-current" aria-hidden />
            {loading ? 'Running…' : runLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addToAllowlistAndApprove()}
            className="inline-flex items-center justify-center min-h-[2rem] px-3 rounded-lg text-[0.75rem] font-medium text-[var(--dashboard-text)] border border-white/[0.1] bg-white/[0.04] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-white/[0.07] disabled:opacity-45 transition-all"
          >
            {allowlistLoading ? 'Saving…' : 'Add to Allowlist'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void finishWithOutcome('denied', deployish ? 'Skipped.' : 'Cancelled.', 2200)}
            className="inline-flex items-center justify-center min-h-[2rem] px-2.5 rounded-lg text-[0.72rem] font-medium text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)] hover:bg-white/[0.04] disabled:opacity-45 transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
