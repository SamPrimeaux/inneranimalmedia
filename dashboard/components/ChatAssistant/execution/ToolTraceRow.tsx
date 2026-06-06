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
import { ChatPresenceIcon } from '../../../features/mode-presence/ChatPresenceIcon';
import {
  formatToolTraceDisplayTitle,
  resolveToolTraceCommand,
  resolveToolTraceMetaLabel,
} from '../../../lib/formatToolTraceDisplayTitle';
import './toolTraceTimeline.css';

/** Presence / loading SVG slot — 2× prior inline trace size (~16px → 32px). */
const TOOL_TRACE_ICON_PX = 32;

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

export const ToolTraceRow: React.FC<ToolTraceRowProps> = ({
  row,
  mode = 'agent',
  defaultExpanded = false,
  onDismiss,
}) => {
  const failed = row.status === 'error';
  const running = row.status === 'running';
  const [open, setOpen] = useState(defaultExpanded);

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

  const title = formatToolTraceDisplayTitle(row);
  const command = useMemo(() => resolveToolTraceCommand(row), [row]);
  const metaLabel = resolveToolTraceMetaLabel(row, command);
  const detailsText = row.detailsJson?.trim() || '';
  const hasExpandable = Boolean(detailsText || row.lines.length || command);
  const cardStatus = failed ? 'error' : running ? 'working' : 'done';

  const durationLabel =
    row.durationMs != null && !running
      ? row.durationMs < 1000
        ? `${row.durationMs}ms`
        : `${(row.durationMs / 1000).toFixed(1)}s`
      : '';

  const toggle = () => {
    if (hasExpandable) setOpen((v) => !v);
  };

  return (
    <div className="tool-trace-item min-w-0" data-status={row.status} data-lane={tracePresence.lane}>
      <div className="tool-trace-row-btn flex items-start">
        <button
          type="button"
          className="flex items-start gap-2.5 min-w-0 flex-1 border-none bg-transparent p-0 text-left"
          onClick={toggle}
          aria-expanded={open}
          disabled={!hasExpandable}
          style={{ cursor: hasExpandable ? 'pointer' : 'default' }}
        >
          <span className="tool-trace-icon">
            <ChatPresenceIcon
              mode={mode}
              state={tracePresence.presenceState}
              iconKey={tracePresence.iconKey}
              size={TOOL_TRACE_ICON_PX}
              cardStatus={cardStatus}
            />
          </span>
          <span className="tool-trace-body min-w-0 flex-1">
            <span className={`tool-trace-title block truncate${running ? ' tool-trace-title--shimmer' : ''}`}>
              {title}
              {durationLabel ? <span className="ml-1.5 opacity-60 font-normal">{durationLabel}</span> : null}
            </span>
            <span className="tool-trace-meta block">{metaLabel}</span>
          </span>
          {hasExpandable ? (
            <span className={`tool-trace-chevron${open ? ' tool-trace-chevron--open' : ''}`} aria-hidden />
          ) : null}
        </button>
        {onDismiss && !running ? (
          <button
            type="button"
            className="shrink-0 ml-1 text-[10px] text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] self-start mt-1"
            onClick={onDismiss}
          >
            ×
          </button>
        ) : null}
      </div>

      {open && hasExpandable ? (
        <div className="tool-trace-expand">
          {command ? (
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-wide text-[var(--dashboard-muted)] mb-1">Command</div>
              <pre className="m-0 whitespace-pre-wrap break-words text-[11px] text-[var(--dashboard-text)] font-mono leading-relaxed">
                {command}
              </pre>
            </div>
          ) : null}
          {row.lines.length ? (
            <div className={command ? 'mb-2' : ''}>
              {!command ? (
                <div className="text-[9px] uppercase tracking-wide text-[var(--dashboard-muted)] mb-1">
                  {running ? 'Output' : 'Result'}
                </div>
              ) : null}
              {row.lines.map((line, idx) => (
                <p
                  key={`${row.id}-line-${idx}`}
                  className="text-[11px] text-[var(--dashboard-muted)] m-0 font-mono whitespace-pre-wrap break-words"
                >
                  {line}
                </p>
              ))}
            </div>
          ) : null}
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
          {failed && !detailsText && !row.lines.length ? (
            <p className="text-[11px] text-red-400 m-0">Tool failed</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
