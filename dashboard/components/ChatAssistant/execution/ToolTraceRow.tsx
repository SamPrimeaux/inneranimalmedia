/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import type { AgentMode } from '../types';
import type { AgentToolTraceRow } from './types';
import { ScrollablePreviewPanel } from './ScrollablePreviewPanel';
import { resolveToolTracePresence } from '../../../features/agent-run/toolTracePresence';
import { simplifyToolName } from '../../../features/agent-chat/formatThinkingStepName';

export type ToolTraceRowProps = {
  row: AgentToolTraceRow;
  mode?: AgentMode;
  defaultExpanded?: boolean;
  compact?: boolean;
  onDismiss?: () => void;
};

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

function statusDot(status: AgentToolTraceRow['status']): string {
  if (status === 'error') return 'bg-red-400';
  if (status === 'running') return 'bg-amber-400';
  return 'bg-emerald-400';
}

export const ToolTraceRow: React.FC<ToolTraceRowProps> = ({
  row,
  mode = 'agent',
  onDismiss,
}) => {
  const failed = row.status === 'error';
  const running = row.status === 'running';
  const [open, setOpen] = useState(false);

  const tracePresence = useMemo(
    () =>
      resolveToolTracePresence({
        toolName: row.toolName,
        status: row.status,
        mode,
        lines: row.lines,
      }),
    [row.toolName, row.status, row.lines, mode],
  );

  const detailsText = row.detailsJson?.trim() || '';
  const toolLabel = simplifyToolName(row.toolName || tracePresence.label);
  const durationLabel =
    row.durationMs != null && !running
      ? row.durationMs < 1000
        ? `${row.durationMs}ms`
        : `${(row.durationMs / 1000).toFixed(1)}s`
      : running
        ? '…'
        : '';

  return (
    <div className="min-w-0" data-status={row.status === 'done' ? 'passed' : row.status} data-lane={tracePresence.lane}>
      <div className="flex items-center gap-2 py-0.5 text-[11px] text-[var(--dashboard-muted)] min-w-0">
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${statusDot(row.status)}`} aria-hidden />
        <span className="truncate min-w-0 flex-1">
          {toolLabel}
          {durationLabel ? <span className="ml-1.5 opacity-70">{durationLabel}</span> : null}
        </span>
        {detailsText || row.lines.length ? (
          <button
            type="button"
            className="shrink-0 text-[10px] text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] transition-colors"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            details ›
          </button>
        ) : null}
        {onDismiss && !running ? (
          <button
            type="button"
            className="shrink-0 text-[10px] text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)]"
            onClick={onDismiss}
          >
            ×
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="pl-4 pb-1 space-y-1">
          {row.lines.map((line) => (
            <p key={line} className="text-[10px] text-[var(--dashboard-muted)] m-0 font-mono truncate">
              {line}
            </p>
          ))}
          {detailsText ? (
            <ScrollablePreviewPanel>
              <div className="flex justify-end mb-1">
                <CopyButton text={detailsText} />
              </div>
              <pre className="m-0 whitespace-pre-wrap break-words text-[10px] text-[var(--dashboard-text)] font-mono leading-relaxed">
                {detailsText}
              </pre>
            </ScrollablePreviewPanel>
          ) : null}
          {failed && !detailsText ? (
            <p className="text-[10px] text-red-400 m-0">Tool failed</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
