/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import type { AgentToolTraceRow } from './types';
import { ScrollablePreviewPanel } from './ScrollablePreviewPanel';

export type ToolTraceRowProps = {
  row: AgentToolTraceRow;
  defaultExpanded?: boolean;
  onDismiss?: () => void;
};

const SERVER_LABEL = 'inneranimalmedia-mcp-server';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(text).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [text],
  );
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export const ToolTraceRow: React.FC<ToolTraceRowProps> = ({ row, defaultExpanded, onDismiss }) => {
  const failed = row.status === 'error';
  const running = row.status === 'running';
  const [open, setOpen] = useState(!!defaultExpanded || failed);

  useEffect(() => {
    if (failed) setOpen(true);
  }, [failed]);

  const dotColor = running
    ? 'bg-amber-400'
    : failed
      ? 'bg-red-500'
      : 'bg-emerald-500';

  const dotClass = `inline-block h-[7px] w-[7px] shrink-0 rounded-full ${dotColor} ${
    running ? 'animate-pulse' : ''
  }`;

  const text = row.lines.join('\n').trim();

  return (
    <div
      className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] overflow-hidden"
      data-status={row.status === 'done' ? 'passed' : row.status}
    >
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-[var(--bg-hover)]/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-medium text-[var(--text-muted)] tracking-wide">
            {SERVER_LABEL}
          </span>
          <span className="text-[12px] font-mono font-medium text-[var(--dashboard-text)] truncate">
            {row.toolName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={dotClass} aria-hidden />
          <span
            className={`text-[10px] font-medium ${
              failed
                ? 'text-red-400'
                : running
                  ? 'text-amber-400'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            {running ? 'running' : failed ? 'error' : 'done'}
          </span>
          {row.durationMs != null && !running && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {row.durationMs < 1000
                ? `${row.durationMs}ms`
                : `${(row.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {open ? (
            <ChevronDown size={13} className="text-[var(--text-muted)]" />
          ) : (
            <ChevronRight size={13} className="text-[var(--text-muted)]" />
          )}
        </div>
      </button>

      {/* Collapsed preview */}
      {!open && text && (
        <div className="px-3.5 pb-2.5 text-[11px] text-[var(--text-muted)] truncate font-mono">
          {text.split('\n')[0].slice(0, 120)}
        </div>
      )}

      {/* Expanded body */}
      {open && (
        <div className="border-t border-[var(--dashboard-border)]/60">
          {row.isSql && row.sqlRows && row.sqlRows.length > 0 ? (
            <div className="px-3.5 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Response
                </span>
                <CopyButton text={JSON.stringify(row.sqlRows, null, 2)} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--dashboard-border)]/70">
                <table className="w-full text-[11px] font-mono border-collapse">
                  <thead>
                    <tr>
                      {Object.keys(row.sqlRows[0]).map((k) => (
                        <th
                          key={k}
                          className="text-left px-2.5 py-1.5 border-b border-[var(--dashboard-border)] text-[var(--text-muted)] font-medium"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {row.sqlRows.map((r, ri) => (
                      <tr key={ri} className="hover:bg-[var(--bg-hover)]/30 transition-colors">
                        {Object.values(r).map((v, j) => (
                          <td
                            key={j}
                            className="px-2.5 py-1.5 border-b border-[var(--dashboard-border)]/50 text-[var(--dashboard-text)]"
                          >
                            {String(v ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="px-3.5 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Response
                </span>
                {text && <CopyButton text={text} />}
              </div>
              <ScrollablePreviewPanel>
                <pre className="m-0 p-2.5 whitespace-pre-wrap break-words text-[11px] text-[var(--dashboard-text)] font-mono leading-relaxed">
                  {text || (running ? '…' : '(no output)')}
                  {running ? '\n▊' : ''}
                </pre>
              </ScrollablePreviewPanel>
            </div>
          )}

          {onDismiss && !running && (
            <div className="px-3.5 pb-2.5">
              <button
                type="button"
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
