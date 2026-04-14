import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bug, Loader2, RefreshCw } from 'lucide-react';

type McpToolErrorRow = {
  id?: string | number;
  tool_name?: string;
  status?: string;
  error_message?: string | null;
  session_id?: string | null;
  created_at?: string | number | null;
  invoked_at?: string | number | null;
};

type AuditRow = {
  id?: string | number;
  event_type?: string;
  message?: string | null;
  created_at?: string | number | null;
  metadata_json?: string | null;
  run_id?: string | null;
};

type WorkerErrorRow = {
  id?: string | number;
  path?: string | null;
  method?: string | null;
  status_code?: string | number | null;
  error_message?: string | null;
  created_at?: string | number | null;
};

type ProblemsPayload = {
  checked_at?: string;
  mcp_tool_errors?: McpToolErrorRow[];
  audit_failures?: AuditRow[];
  worker_errors?: WorkerErrorRow[];
};

const POLL_MS = 60_000;

function formatTs(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    try {
      return new Date(v * 1000).toLocaleString();
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function isAuditWarning(eventType: string): boolean {
  return eventType.toLowerCase().includes('warn');
}

function formatServerCheckedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export const ProblemsDebugPanel: React.FC<{
  onClose?: () => void;
  /** After selecting a thread from an MCP row, parent can reveal Agent Sam and close this sidebar. */
  onNavigateToAgentThread?: (sessionId: string) => void;
  onOpenMcpPanel?: () => void;
}> = ({ onClose, onNavigateToAgentThread, onOpenMcpPanel }) => {
  const [data, setData] = useState<ProblemsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (isManual: boolean) => {
    if (isManual) setRefreshing(true);
    else if (!hasLoadedOnce.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/problems', { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as ProblemsPayload & { error?: string };
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : `Request failed (${res.status})`);
        setData(null);
        return;
      }
      setData({
        checked_at: typeof body.checked_at === 'string' ? body.checked_at : undefined,
        mcp_tool_errors: Array.isArray(body.mcp_tool_errors) ? body.mcp_tool_errors : [],
        audit_failures: Array.isArray(body.audit_failures) ? body.audit_failures : [],
        worker_errors: Array.isArray(body.worker_errors) ? body.worker_errors : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load problems');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(false), POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const mcp = data?.mcp_tool_errors ?? [];
  const audits = data?.audit_failures ?? [];
  const wx = data?.worker_errors ?? [];

  const { warnAudits, errAudits } = useMemo(() => {
    const warn: AuditRow[] = [];
    const err: AuditRow[] = [];
    for (const a of audits) {
      const et = String(a?.event_type || '');
      if (isAuditWarning(et)) warn.push(a);
      else err.push(a);
    }
    return { warnAudits: warn, errAudits: err };
  }, [audits]);

  const statusBarErrors = mcp.length + wx.length + errAudits.length;
  const statusBarWarnings = warnAudits.length;
  const totalRows = mcp.length + audits.length + wx.length;

  const cardClass =
    'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3 mb-2.5 text-[12px]';

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Bug size={14} className="text-[var(--solar-red)] shrink-0" />
          <span className="text-[11px] font-bold tracking-widest uppercase truncate">Problems</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={refreshing}
            className="p-1.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
            title="Refresh"
            onClick={() => void load(true)}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {onClose && (
            <button
              type="button"
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-1 rounded border border-[var(--border-subtle)]"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] leading-relaxed shrink-0">
        Server-side diagnostics from D1 (MCP tool calls, audit log, worker 5xx). These counts match the status bar
        error and warning badges, not Monaco editor squiggles.
        {data?.checked_at ? (
          <span className="block mt-1 text-[var(--text-muted)] opacity-90">
            Last checked {formatServerCheckedAt(data.checked_at)}
          </span>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 chat-hide-scroll">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-[12px] py-4">
            <Loader2 size={16} className="animate-spin shrink-0" />
            Loading problems...
          </div>
        ) : null}

        {error ? (
          <div className="text-[12px] text-[var(--solar-red)] mb-3 whitespace-pre-wrap break-words">{error}</div>
        ) : null}

        {!loading && !error && data ? (
          <div className="text-[11px] text-[var(--text-muted)] mb-3">
            Summary: {statusBarErrors} error-line{statusBarErrors !== 1 ? 's' : ''},{' '}
            {statusBarWarnings} warning-line{statusBarWarnings !== 1 ? 's' : ''} (same as status bar). {totalRows}{' '}
            row{totalRows !== 1 ? 's' : ''} listed below.
            {totalRows === 0 ? (
              <span className="block mt-1 text-[var(--text-main)]">
                Nothing in the current windows (up to 50 MCP, 25 audit, 20 worker rows).
              </span>
            ) : null}
          </div>
        ) : null}

        {mcp.length > 0 ? (
          <section className="mb-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
              MCP tool failures ({mcp.length})
            </h4>
            {mcp.map((row) => {
              const sid = row.session_id != null ? String(row.session_id).trim() : '';
              const msg =
                row.error_message != null && String(row.error_message).trim()
                  ? String(row.error_message)
                  : '(no error_message)';
              return (
                <div
                  key={`mcp-${row.id ?? row.tool_name}-${row.created_at ?? row.invoked_at}`}
                  className={cardClass}
                >
                  <div className="font-semibold text-[var(--text-primary)] mb-1">
                    {row.tool_name != null ? String(row.tool_name) : 'tool'}
                    {row.status ? (
                      <span className="font-normal text-[var(--text-muted)] ml-2">{String(row.status)}</span>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mb-1.5">
                    {formatTs(row.created_at ?? row.invoked_at)}
                  </div>
                  <div className="text-[var(--solar-red)] whitespace-pre-wrap break-words">{msg}</div>
                  {sid && onNavigateToAgentThread ? (
                    <button
                      type="button"
                      className="mt-2 text-[11px] font-semibold text-[var(--solar-cyan)] hover:brightness-110"
                      onClick={() => onNavigateToAgentThread(sid)}
                    >
                      Open in Agent Sam
                    </button>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}

        {errAudits.length > 0 ? (
          <section className="mb-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
              Audit (errors / denials) ({errAudits.length})
            </h4>
            {errAudits.map((row) => (
              <div key={`aud-e-${row.id ?? row.event_type}-${row.created_at}`} className={cardClass}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">
                  {row.event_type != null ? String(row.event_type) : 'event'}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mb-1.5">{formatTs(row.created_at)}</div>
                <div className="text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                  {row.message != null ? String(row.message) : ''}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {warnAudits.length > 0 ? (
          <section className="mb-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
              Audit (warnings) ({warnAudits.length})
            </h4>
            <p className="text-[10px] text-[var(--text-muted)] mb-2">
              Also shown under the yellow warning count in the status bar.
            </p>
            {warnAudits.map((row) => (
              <div key={`aud-w-${row.id ?? row.event_type}-${row.created_at}`} className={cardClass}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">
                  {row.event_type != null ? String(row.event_type) : 'event'}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mb-1.5">{formatTs(row.created_at)}</div>
                <div className="text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                  {row.message != null ? String(row.message) : ''}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {wx.length > 0 ? (
          <section className="mb-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
              Worker HTTP errors ({wx.length})
            </h4>
            {onOpenMcpPanel ? (
              <p className="text-[10px] text-[var(--text-muted)] mb-2">
                If failures involve MCP or integrations, use{' '}
                <button
                  type="button"
                  className="text-[var(--solar-cyan)] font-semibold hover:brightness-110"
                  onClick={onOpenMcpPanel}
                >
                  Tools &amp; MCP
                </button>
                .
              </p>
            ) : null}
            {wx.map((row) => (
              <div key={`wx-${row.id ?? row.path}-${row.created_at}`} className={cardClass}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">
                  Worker {row.status_code != null ? String(row.status_code) : '5xx'}{' '}
                  <span className="font-normal text-[var(--text-muted)]">
                    {row.method != null ? String(row.method) : ''} {row.path != null ? String(row.path) : ''}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mb-1.5">{formatTs(row.created_at)}</div>
                <div className="text-[var(--solar-red)] whitespace-pre-wrap break-words">
                  {row.error_message != null ? String(row.error_message) : ''}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
};
