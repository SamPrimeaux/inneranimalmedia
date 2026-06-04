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
  onDismissRow?: (id: string) => void;
  onClear?: () => void;
};

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
  rows,
  mode = 'agent',
  onDismissRow,
  onClear,
}) => {
  if (!rows.length) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-[var(--dashboard-border)]/80 pt-3" aria-label="Execution timeline">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Execution</span>
        {onClear && (
          <button
            type="button"
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)]"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <ToolTraceRow
            key={row.id}
            row={row}
            mode={mode}
            onDismiss={onDismissRow ? () => onDismissRow(row.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
};
