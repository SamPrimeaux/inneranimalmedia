import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { GripVertical, Code2, ExternalLink, Play, Copy } from 'lucide-react';
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

/** Beyond this, show truncated in-card preview and nudge Monaco. */
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
  /** Opens `MonacoEditorView` (workspace editor) with virtual file — same as chat “Open in Monaco”. */
  onOpenInEditor?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => void;
  /**
   * `true` = fixed global dock (App shell): no top margin; parent handles position.
   * `false` = inline in chat column (legacy).
   */
  docked?: boolean;
};

function shouldPollApprovals(opts: {
  pathname: string;
  hasVisibleApproval: boolean;
  workspaceId: string;
  agentRunId: string | null;
  toolExecutionActive: boolean;
  recentPending: boolean;
}): boolean {
  const { pathname, hasVisibleApproval, workspaceId, agentRunId, toolExecutionActive, recentPending } = opts;
  if (!workspaceId) return false;
  if (hasVisibleApproval) return true;
  if (toolExecutionActive) return true;
  if (agentRunId) return true;
  if (recentPending) return true;
  const p = pathname.toLowerCase();
  return p.startsWith('/dashboard');
}

function formatActionTitle(toolName: string, description: string): string {
  const d0 = String(description || '')
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  if (d0 && d0.length >= 4 && d0.length <= 100) return d0;
  const raw = String(toolName || '').trim();
  if (raw) {
    const t = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return t.length > 72 ? t.slice(0, 70) + '…' : t;
  }
  return d0 || 'Approval';
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
        <span key={k} style={{ color: 'var(--color-text-tertiary, #64748b)' }}>
          {tok}
        </span>,
      );
      continue;
    }
    if (tok.startsWith("'") || tok.startsWith('"')) {
      parts.push(
        <span key={k} style={{ color: 'var(--solar-green, #86efac)' }}>
          {tok}
        </span>,
      );
      continue;
    }
    if (/^[,();]$/.test(tok)) {
      parts.push(
        <span key={k} style={{ color: 'var(--dashboard-muted, #94a3b8)' }}>
          {tok}
        </span>,
      );
      continue;
    }
    if (/^\w+$/.test(tok) && SQL_KW.has(tok.toLowerCase())) {
      parts.push(
        <span key={k} style={{ color: 'var(--solar-cyan, #7dd3fc)', fontWeight: 600 }}>
          {tok}
        </span>,
      );
      continue;
    }
    parts.push(
      <span key={k} style={{ color: 'var(--dashboard-text, #e2e8f0)' }}>
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
        <div className="mt-2 text-[0.65rem] text-[var(--dashboard-muted)] border-t border-[var(--dashboard-border)]/60 pt-2">
          Preview truncated in chat — use <strong className="text-[var(--solar-cyan)]">Open in editor</strong> for the
          full script and Monaco highlighting.
        </div>
      ) : null}
    </>
  );
}

export function ToolApprovalModal({
  workspaceId = null,
  agentRunId = null,
  toolExecutionActive = false,
  onOpenInEditor,
  docked = false,
}: ToolApprovalModalProps) {
  const location = useLocation();
  const [approval, setApproval] = useState<Approval | null>(null);
  const approvalRef = useRef<Approval | null>(null);
  approvalRef.current = approval;

  const [queryFolded, setQueryFolded] = useState(false);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allowlistLoading, setAllowlistLoading] = useState(false);
  const [pollStopped401, setPollStopped401] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const runMenuRef = useRef<HTMLDivElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);

  const backoffRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPendingSignalRef = useRef(0);

  const ws = typeof workspaceId === 'string' ? workspaceId.trim() : '';

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
        })
      ) {
        kick(45_000);
        return;
      }
      try {
        const runQ = agentRunId?.trim() ? `&run_id=${encodeURIComponent(agentRunId.trim())}` : '';
        const r = await fetch(
          `/api/agent/approval/pending?workspace_id=${encodeURIComponent(ws)}${runQ}`,
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
            setQueryFolded(false);
            setRunMenuOpen(false);
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
  }, [location.pathname, pollStopped401, ws, agentRunId, toolExecutionActive]);

  useEffect(() => {
    if (!runMenuOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (runMenuRef.current?.contains(t) || playBtnRef.current?.contains(t)) return;
      setRunMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [runMenuOpen]);

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
    setRunMenuOpen(false);
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
    setRunMenuOpen(false);
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
        ? 'Added to allowlist and approved — agent continues.'
        : 'Approved — agent continues.',
      2800,
    );
  }

  if (!approval) return null;

  const deployish = isDeployLike(approval);
  const cancelLabel = deployish ? 'Skip' : 'Cancel';
  const runLabel = deployish ? 'Deploy' : 'Run';
  const titleRaw = formatActionTitle(approval.tool_name, approval.description);
  const title = titleRaw.toUpperCase();
  const showSqlHighlight = looksLikeSql(displayPreview);
  const descOne = String(approval.description || '')
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  const showDesc = descOne && descOne.replace(/\s+/g, ' ') !== titleRaw.replace(/\s+/g, ' ');

  return (
    <div
      className={`${docked ? '' : 'mt-4 '}w-full max-w-[min(100%,32rem)] rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)]/95 shadow-lg backdrop-blur-md overflow-hidden`}
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}
    >
      {/* Minimal header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--dashboard-border)]/80 bg-[var(--dashboard-panel)]/90">
        <GripVertical
          size={16}
          className="shrink-0 text-[var(--dashboard-muted)] opacity-70"
          aria-hidden
        />
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span
            className="truncate text-[0.7rem] font-mono font-semibold tracking-wide text-[var(--dashboard-text)] uppercase"
            title={title}
          >
            {title}
          </span>
          {approval.queue_count > 1 ? (
            <span className="shrink-0 rounded-full border border-[var(--dashboard-border)] px-1.5 py-0.5 text-[0.6rem] text-[var(--dashboard-muted)]">
              +{approval.queue_count - 1} pending
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {preview ? (
            <button
              type="button"
              title={queryFolded ? 'Show query' : 'Hide query'}
              onClick={() => setQueryFolded((f) => !f)}
              className={`p-1.5 rounded-md border transition-colors ${
                queryFolded
                  ? 'border-transparent text-[var(--dashboard-muted)] hover:bg-[var(--scene-bg)]'
                  : 'border-[var(--dashboard-border)]/80 bg-[var(--scene-bg)]/80 text-[var(--solar-cyan)]'
              }`}
            >
              <Code2 size={16} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            title="Open in editor (Monaco)"
            onClick={openEditor}
            disabled={!preview.trim() || !onOpenInEditor}
            className="p-1.5 rounded-md border border-transparent text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--dashboard-border)] hover:bg-[var(--scene-bg)] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <ExternalLink size={16} aria-hidden />
          </button>
          <div className="relative" ref={runMenuRef}>
            <button
              ref={playBtnRef}
              type="button"
              title={runLabel}
              disabled={loading || allowlistLoading}
              onClick={() => setRunMenuOpen((o) => !o)}
              className="p-1.5 rounded-md border border-[var(--dashboard-border)]/70 bg-[var(--scene-bg)]/90 text-[var(--dashboard-text)] hover:border-[var(--solar-cyan)]/50 hover:text-[var(--solar-cyan)] disabled:opacity-40 transition-colors"
            >
              <Play size={15} className="fill-current" aria-hidden />
            </button>
            {runMenuOpen ? (
              <div
                className="absolute right-0 top-[calc(100%+6px)] z-[80] min-w-[13.5rem] rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/98 backdrop-blur-lg py-1.5 px-1.5 shadow-xl"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left rounded-lg px-3 py-2 text-[0.75rem] font-medium text-[var(--dashboard-text)] hover:bg-[var(--scene-bg)] border border-transparent hover:border-[var(--dashboard-border)]"
                  disabled={loading || allowlistLoading}
                  onClick={() => void finishWithOutcome('denied', deployish ? 'Skipped.' : 'Cancelled.', 2200)}
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={loading || allowlistLoading}
                  onClick={() =>
                    void finishWithOutcome(
                      'approved',
                      looksLikeSql(preview)
                        ? 'Approved — SQL feedback (rows, errors, or e.g. “Success. No rows returned”) appears in chat after execution.'
                        : 'Approved — agent continues.',
                      2800,
                    )
                  }
                  className="mt-1 w-full rounded-lg px-3 py-2.5 text-[0.8rem] font-semibold text-[var(--solar-green)] border border-[var(--color-success-border,rgba(34,197,94,0.35))] bg-[rgba(74,222,128,0.12)] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_18px_rgba(34,197,94,0.15)] hover:bg-[rgba(74,222,128,0.18)] disabled:opacity-45"
                >
                  {runLabel}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={loading || allowlistLoading}
                  onClick={() => void addToAllowlistAndApprove()}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-[0.72rem] font-semibold text-[var(--solar-indigo,#a5b4fc)] border border-[var(--dashboard-border)]/80 bg-[rgba(99,102,241,0.08)] hover:bg-[rgba(99,102,241,0.14)] disabled:opacity-45"
                >
                  {allowlistLoading ? 'Saving…' : 'Add to Allowlist'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {preview && !queryFolded ? (
        <div className="border-b border-[var(--dashboard-border)]/60 bg-[var(--bg-code-pre,var(--scene-bg))]">
          <div className="flex items-center justify-end gap-1 px-2 py-1">
            <button
              type="button"
              title="Copy"
              onClick={() => void copyPreview()}
              className="p-1 rounded-md text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--dashboard-panel)] transition-colors"
            >
              <Copy size={14} aria-hidden />
            </button>
          </div>
          <pre
            className="m-0 max-h-[min(40vh,280px)] overflow-auto px-3 pb-3 text-[0.6875rem] font-mono leading-relaxed"
            style={{ tabSize: 2 }}
          >
            {showSqlHighlight ? (
              <SqlPreviewBody text={displayPreview} truncated={isLarge} />
            ) : (
              <>
                <span className="text-[var(--dashboard-text)] whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {displayPreview}
                </span>
                {isLarge ? (
                  <div className="mt-2 text-[0.65rem] text-[var(--dashboard-muted)] border-t border-[var(--dashboard-border)]/60 pt-2">
                    Large payload — open in <strong className="text-[var(--solar-cyan)]">editor</strong> for full
                    Monaco view.
                  </div>
                ) : null}
              </>
            )}
          </pre>
        </div>
      ) : null}

      {showDesc ? (
        <p className="m-0 px-3 py-2 text-[0.7rem] leading-snug text-[var(--dashboard-muted)] border-b border-[var(--dashboard-border)]/40 line-clamp-2">
          {descOne}
        </p>
      ) : null}

      {outcome ? (
        <div
          className={`px-3 py-2.5 text-[0.72rem] font-mono border-t ${
            outcome.tone === 'ok'
              ? 'bg-[rgba(34,197,94,0.08)] text-[var(--solar-green)] border-[var(--color-success-border,rgba(34,197,94,0.25))]'
              : 'bg-[rgba(248,113,113,0.08)] text-[var(--solar-red,#f87171)] border-[var(--color-danger-border,rgba(248,113,113,0.35))]'
          }`}
        >
          {outcome.text}
        </div>
      ) : null}

      {approval.is_mcp_server ? (
        <p className="m-0 px-3 py-2 text-[0.65rem] text-[var(--dashboard-muted)] border-t border-[var(--dashboard-border)]/30">
          {approval.server_display_name ?? 'Agent Sam'} — external tool; no PII sent by default.
        </p>
      ) : null}
    </div>
  );
}
