/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { AgentMode } from '../types';
import type { AgentToolTraceRow } from './types';
import { resolveToolTracePresence } from '../../../features/agent-run/toolTracePresence';
import { ChatPresenceIcon } from '../../../features/mode-presence/ChatPresenceIcon';
import {
  formatToolTraceDisplayTitle,
  resolveToolTraceMetaLabel,
} from '../../../lib/formatToolTraceDisplayTitle';
import {
  monacoHandoffFilename,
  resolveToolTraceBlocks,
} from '../../../lib/toolTracePreview';
import { ToolTraceCodeBlock } from './ToolTraceCodeBlock';
import { DataGrid } from '../../DataGrid';
import './toolTraceTimeline.css';

const TOOL_TRACE_ICON_PX = 24;

export type ToolTraceRowProps = {
  row: AgentToolTraceRow;
  mode?: AgentMode;
  defaultExpanded?: boolean;
  compact?: boolean;
  onDismiss?: () => void;
  onOpenInEditor?: (file: { name: string; content: string }) => void;
};

export const ToolTraceRow: React.FC<ToolTraceRowProps> = ({
  row,
  mode = 'agent',
  defaultExpanded = false,
  onDismiss,
  onOpenInEditor,
}) => {
  const failed = row.status === 'error';
  const running = row.status === 'running';
  const [open, setOpen] = useState(defaultExpanded || running);

  useEffect(() => {
    if (running) setOpen(true);
  }, [running, row.id]);

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
  const { command, request, result } = useMemo(() => resolveToolTraceBlocks(row), [row]);
  const metaLabel = resolveToolTraceMetaLabel(row, command);
  const cardStatus = failed ? 'error' : running ? 'working' : 'done';

  const durationLabel =
    row.durationMs != null && !running
      ? row.durationMs < 1000
        ? `${row.durationMs}ms`
        : `${(row.durationMs / 1000).toFixed(1)}s`
      : '';

  const hasExpandable = running || Boolean(request || result || failed);

  const toggle = useCallback(() => {
    if (hasExpandable) setOpen((v) => !v);
  }, [hasExpandable]);

  return (
    <div className="tool-trace-item min-w-0" data-status={row.status} data-lane={tracePresence.lane}>
      <div className="tool-trace-row-btn flex items-start">
        <button
          type="button"
          className="tool-trace-collapsed-btn flex items-center gap-2 min-w-0 flex-1"
          onClick={toggle}
          aria-expanded={open}
          disabled={!hasExpandable}
        >
          <span className={`tool-trace-title truncate${running ? ' tool-trace-title--shimmer' : ''}`}>
            {title}
            {durationLabel ? <span className="ml-1.5 opacity-60 font-normal">{durationLabel}</span> : null}
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
          <div className="tool-trace-expand-header">
            <ChatPresenceIcon
              mode={mode}
              state={tracePresence.presenceState}
              iconKey={tracePresence.iconKey}
              size={TOOL_TRACE_ICON_PX}
              cardStatus={cardStatus}
            />
            <div className="min-w-0 flex-1">
              <div className="tool-trace-expand-title">{title}</div>
              <div className="tool-trace-meta">{metaLabel}</div>
            </div>
          </div>

          {request ? (
            <ToolTraceCodeBlock
              label="Request"
              text={request.text}
              lang={request.lang}
              onOpenInEditor={onOpenInEditor}
              editorFilename={monacoHandoffFilename(row, 'request', request.lang)}
            />
          ) : null}

          {result ? (
            <ToolTraceCodeBlock
              label={running ? 'Output' : 'Result'}
              text={result.text}
              lang={result.lang}
              onOpenInEditor={onOpenInEditor}
              editorFilename={monacoHandoffFilename(row, 'result', result.lang)}
            />
          ) : row.isSql && row.sqlRows && row.sqlRows.length > 0 ? (
            <div className="tool-trace-code-block">
              <span className="tool-trace-code-block__label">Result</span>
              <div className="tool-trace-code-viewport px-1 pb-1">
                <DataGrid data={row.sqlRows.slice(0, 25)} />
              </div>
            </div>
          ) : running ? (
            <div className="tool-trace-code-block">
              <span className="tool-trace-code-block__label">Result</span>
              <div className="tool-trace-code-viewport tool-trace-code-viewport--idle">
                <span className="tool-trace-meta">Waiting for output…</span>
              </div>
            </div>
          ) : null}

          {failed && !request && !result ? (
            <p className="text-[11px] text-red-400 m-0 px-1">Tool failed</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
