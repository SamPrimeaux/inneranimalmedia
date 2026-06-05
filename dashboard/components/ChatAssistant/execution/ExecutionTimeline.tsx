/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { AgentMode } from '../types';
import type { AgentToolTraceRow } from './types';
import { ToolTraceRow } from './ToolTraceRow';

export type ExecutionTimelineProps = {
  rows: AgentToolTraceRow[];
  mode?: AgentMode;
  /** Mobile: plain rows — details collapsed behind text links. */
  compact?: boolean;
  onDismissRow?: (id: string) => void;
  onClear?: () => void;
};

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
  rows,
  mode = 'agent',
  compact = false,
  onDismissRow,
  onClear,
}) => {
  if (!rows.length) return null;
  return (
    <div className="mt-2 space-y-0.5 min-w-0" aria-label="Execution timeline">
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
      <div className="space-y-0.5">
        {rows.map((row) => (
          <ToolTraceRow
            key={row.id}
            row={row}
            mode={mode}
            compact={compact}
            onDismiss={onDismissRow ? () => onDismissRow(row.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
};
