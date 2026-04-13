import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  TerminalSquare,
  MessageSquare,
  Wrench,
  ShieldAlert,
  ServerCrash,
  Copy,
  ExternalLink,
} from 'lucide-react';

type RawProblemPayload = {
  mcp_tool_errors?: unknown[];
  audit_failures?: unknown[];
  worker_errors?: unknown[];
};

export type DebugProblem = {
  id: string;
  source: 'mcp' | 'audit' | 'worker';
  title: string;
  severity: 'error' | 'warning' | 'info';
  timestamp?: string | null;
  summary: string;
  details?: string;
  sessionId?: string | null;
  suggestedCommand?: string | null;
  relatedPath?: string | null;
  relatedUrl?: string | null;
  raw?: unknown;
};

function safeString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n = 220): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function inferSuggestedCommand(problem: DebugProblem): string | null {
  if (problem.source === 'mcp') {
    return `echo ${JSON.stringify(problem.title)} && echo ${JSON.stringify(problem.summary)}`;
  }
  if (problem.source === 'worker') {
    return `echo ${JSON.stringify(problem.title)} && echo ${JSON.stringify(problem.summary)}`;
  }
  if (problem.source === 'audit') {
    return `echo ${JSON.stringify(problem.title)} && echo ${JSON.stringify(problem.summary)}`;
  }
  return null;
}

function normalizeMcp(row: any, idx: number): DebugProblem {
  const title =
    row?.tool_name ||
    row?.tool ||
    row?.name ||
    row?.command_name ||
    `mcp_tool_${idx + 1}`;

  const summary =
    row?.error ||
    row?.message ||
    row?.detail ||
    row?.output_text ||
    safeString(row);

  return {
    id: `mcp:${row?.id || idx}`,
    source: 'mcp',
    title: safeString(title),
    severity: 'error',
    timestamp: row?.created_at || row?.timestamp || row?.started_at || null,
    summary: truncate(safeString(summary), 280),
    details: safeString(row),
    sessionId: row?.session_id || null,
    suggestedCommand: row?.command_text || row?.command || null,
    relatedPath: row?.file_path || row?.path || null,
    relatedUrl: row?.url || null,
    raw: row,
  };
}

function normalizeAudit(row: any, idx: number): DebugProblem {
  const eventType = safeString(row?.event_type || row?.type || `audit_${idx + 1}`);
  const severity =
    String(eventType).toLowerCase().includes('warn') ? 'warning' : 'error';

  const summary =
    row?.error ||
    row?.message ||
    row?.detail ||
    row?.notes ||
    safeString(row);

  return {
    id: `audit:${row?.id || idx}`,
    source: 'audit',
    title: eventType,
    severity,
    timestamp: row?.created_at || row?.timestamp || row?.occurred_at || null,
    summary: truncate(safeString(summary), 280),
    details: safeString(row),
    sessionId: row?.session_id || null,
    suggestedCommand: null,
    relatedPath: row?.file_path || row?.path || null,
    relatedUrl: row?.url || null,
    raw: row,
  };
}

function normalizeWorker(row: any, idx: number): DebugProblem {
  const title =
    row?.worker_name ||
    row?.name ||
    row?.route ||
    `worker_error_${idx + 1}`;

  const summary =
    row?.error ||
    row?.message ||
    row?.detail ||
    row?.output_text ||
    safeString(row);

  return {
    id: `worker:${row?.id || idx}`,
    source: 'worker',
    title: safeString(title),
    severity: 'error',
    timestamp: row?.created_at || row?.timestamp || row?.started_at || null,
    summary: truncate(safeString(summary), 280),
    details: safeString(row),
    sessionId: row?.session_id || null,
    suggestedCommand: row?.command_text || null,
    relatedPath: row?.file_path || row?.path || null,
    relatedUrl: row?.url || null,
    raw: row,
  };
}

function sourceIcon(source: DebugProblem['source']) {
  switch (source) {
    case 'mcp':
      return <Wrench size={13} className="text-[var(--solar-cyan)]" />;
    case 'audit':
      return <ShieldAlert size={13} className="text-[var(--solar-yellow)]" />;
    case 'worker':
      return <ServerCrash size={13} className="text-[var(--solar-red)]" />;
  }
}

function severityTone(severity: DebugProblem['severity']) {
  if (severity === 'error') return 'text-[var(--solar-red)]';
  if (severity === 'warning') return 'text-[var(--solar-yellow)]';
  return 'text-[var(--solar-cyan)]';
}

export const ProblemsDebugPanel: React.FC<{
  onClose?: () => void;
  onOpenAgentThread?: (sessionId: string) => void;
  onOpenDebugTerminal?: (problem: DebugProblem) => void;
}> = ({ onClose, onOpenAgentThread, onOpenDebugTerminal }) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<RawProblemPayload | null>(null);

  const loadProblems = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/agent/problems', { credentials: 'same-origin' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Failed to load problems (${r.status})`);
      }
      setPayload((data && typeof data === 'object') ? data : {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load problems');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProblems();
  }, [loadProblems]);

  const problems = useMemo(() => {
    const rows: DebugProblem[] = [];

    const mcp = Array.isArray(payload?.mcp_tool_errors) ? payload!.mcp_tool_errors : [];
    const audit = Array.isArray(payload?.audit_failures) ? payload!.audit_failures : [];
    const worker = Array.isArray(payload?.worker_errors) ? payload!.worker_errors : [];

    mcp.forEach((row, i) => rows.push(normalizeMcp(row, i)));
    audit.forEach((row, i) => rows.push(normalizeAudit(row, i)));
    worker.forEach((row, i) => rows.push(normalizeWorker(row, i)));

    return rows.map((p) => ({
      ...p,
      suggestedCommand: p.suggestedCommand || inferSuggestedCommand(p),
    }));
  }, [payload]);

  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.filter((p) => p.severity === 'warning').length;

  return (
    <div className="w-full h-full min-h-0 flex flex-col bg-[var(--bg-panel)] text-[var(--text-main)] overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={14} className="text-[var(--solar-red)] shrink-0" />
          <span className="text-[11px] font-bold tracking-widest uppercase truncate">Problems</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void loadProblems()}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--border-subtle)]/40 text-[10px] text-[var(--text-muted)] shrink-0">
        <div>{errors} errors · {warnings} warnings · {problems.length} total</div>
        <div className="mt-1">
          Selector mode only — click a problem to hand it off into terminal debug flow.
        </div>
      </div>

      {err ? (
        <div className="p-3 text-[11px] text-[var(--solar-red)]">{err}</div>
      ) : null}

      {loading && !payload ? (
        <div className="p-4 text-center text-[11px] text-[var(--text-muted)]">Loading problems…</div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {!loading && problems.length === 0 ? (
          <div className="p-4 text-[11px] text-[var(--text-muted)] text-center">
            No current problems returned by <code>/api/agent/problems</code>.
          </div>
        ) : null}

        {problems.map((problem) => (
          <div
            key={problem.id}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)]/50 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {sourceIcon(problem.source)}
                  <span className="text-[12px] font-semibold truncate">{problem.title}</span>
                  <span className={`text-[9px] font-mono uppercase ${severityTone(problem.severity)}`}>
                    {problem.severity}
                  </span>
                </div>
                {problem.timestamp ? (
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mt-1">
                    {problem.timestamp}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`mt-2 text-[11px] leading-relaxed ${severityTone(problem.severity)}`}>
              {problem.summary}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenDebugTerminal?.(problem)}
                className="px-3 py-1.5 rounded text-[11px] font-semibold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30 flex items-center gap-1.5"
              >
                <TerminalSquare size={12} />
                Open in terminal
              </button>

              {problem.sessionId ? (
                <button
                  type="button"
                  onClick={() => onOpenAgentThread?.(problem.sessionId!)}
                  className="px-3 py-1.5 rounded text-[11px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] flex items-center gap-1.5"
                >
                  <MessageSquare size={12} />
                  Open in Agent Sam
                </button>
              ) : null}

              {problem.details ? (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(problem.details || '').catch(() => {})}
                  className="px-3 py-1.5 rounded text-[11px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] flex items-center gap-1.5"
                >
                  <Copy size={12} />
                  Copy details
                </button>
              ) : null}

              {problem.relatedUrl ? (
                <button
                  type="button"
                  onClick={() => window.open(problem.relatedUrl!, '_blank', 'noopener,noreferrer')}
                  className="px-3 py-1.5 rounded text-[11px] font-semibold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] flex items-center gap-1.5"
                >
                  <ExternalLink size={12} />
                  Open URL
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
