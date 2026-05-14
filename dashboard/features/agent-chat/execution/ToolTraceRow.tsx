/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AgentToolTraceRow } from './types';
import { ScrollablePreviewPanel } from './ScrollablePreviewPanel';

export type ToolTraceRowProps = {
  row: AgentToolTraceRow;
  defaultExpanded?: boolean;
  onDismiss?: () => void;
};

export const ToolTraceRow: React.FC<ToolTraceRowProps> = ({ row, defaultExpanded, onDismiss }) => {
  const failed = row.status === 'error';
  const [open, setOpen] = useState(!!defaultExpanded || failed);

  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  const dot =
    row.status === 'running'
      ? 'bg-amber-400'
      : row.status === 'error'
        ? 'bg-red-500'
        : 'bg-emerald-500';

  const text = row.lines.join('\n').trim();
  const summary = text ? text.split('\n').slice(0, 2).join(' · ').slice(0, 140) : row.toolName;

  return (
    <div
      className="agent-trace-row rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] overflow-hidden"
      data-status={row.status === 'done' ? 'passed' : row.status}
    >
      <button
        type="button"
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--bg-hover)]/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`agent-trace-dot inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] shrink-0">
          {row.status}
        </span>
        <span className="text-[12px] font-medium text-[var(--dashboard-text)] truncate flex-1 min-w-0">
          {row.toolName}
        </span>
        {row.durationMs != null && (
          <span className="text-[10px] text-[var(--text-muted)] shrink-0">{(row.durationMs / 1000).toFixed(1)}s</span>
        )}
        {open ? <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />}
      </button>
      {!open && (
        <div className="px-2.5 pb-2 text-[11px] text-[var(--text-muted)] truncate" title={summary}>
          {summary}
        </div>
      )}
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {row.isSql && row.sqlRows && row.sqlRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-[var(--dashboard-border)]/70">
              <table className="w-full text-[11px] font-mono border-collapse">
                <thead>
                  <tr>
                    {Object.keys(row.sqlRows[0]).map((k) => (
                      <th
                        key={k}
                        className="text-left px-2 py-1 border-b border-[var(--dashboard-border)] text-[var(--text-muted)] font-medium"
                      >
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {row.sqlRows.map((r, ri) => (
                    <tr key={ri}>
                      {Object.values(r).map((v, j) => (
                        <td key={j} className="px-2 py-1 border-b border-[var(--dashboard-border)]/60 text-[var(--dashboard-text)]">
                          {String(v ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ScrollablePreviewPanel>
              <pre className="m-0 p-2 whitespace-pre-wrap break-words text-[var(--dashboard-text)]">
                {text || (row.status === 'running' ? '…' : '(no output)')}
                {row.status === 'running' ? '\n▊' : ''}
              </pre>
            </ScrollablePreviewPanel>
          )}
          {onDismiss && row.status !== 'running' && (
            <button
              type="button"
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)]"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
};
