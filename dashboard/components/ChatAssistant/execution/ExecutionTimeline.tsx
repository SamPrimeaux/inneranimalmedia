/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { AgentMode } from '../types';
import type { AgentToolTraceRow } from './types';
import { ToolTraceRow } from './ToolTraceRow';
import './toolTraceTimeline.css';

export type ExecutionTimelineProps = {
  rows: AgentToolTraceRow[];
  mode?: AgentMode;
  /** Mobile: plain rows — details collapsed behind text links. */
  compact?: boolean;
  onDismissRow?: (id: string) => void;
  onClear?: () => void;
  /** When stream idle and no running tools — show Claude-style Done footer. */
  showDoneFooter?: boolean;
};

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
  rows,
  mode = 'agent',
  onDismissRow,
  onClear,
  showDoneFooter = false,
}) => {
  if (!rows.length) return null;
  const anyRunning = rows.some((r) => r.status === 'running');

  return (
    <div className="mt-2 min-w-0" aria-label="Execution timeline">
      {onClear ? (
        <div className="flex justify-end pb-0.5">
          <button
            type="button"
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)]"
            onClick={onClear}
          >
            Clear
          </button>
        </div>
      ) : null}
      <div className="tool-trace-stack">
        {rows.map((row) => (
          <ToolTraceRow
            key={row.id}
            row={row}
            mode={mode}
            onDismiss={onDismissRow ? () => onDismissRow(row.id) : undefined}
          />
        ))}
        {showDoneFooter && !anyRunning ? (
          <div className="tool-trace-done" role="status">
            <span className="tool-trace-done-mark" aria-hidden>
              ✓
            </span>
            Done
          </div>
        ) : null}
      </div>
    </div>
  );
};
