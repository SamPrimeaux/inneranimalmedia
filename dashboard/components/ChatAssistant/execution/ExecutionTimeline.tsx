/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { AgentMode } from '../types';
import type { AgentToolTraceRow } from './types';
import { ToolTraceRow } from './ToolTraceRow';
import { OfflineRunnerEmbed } from '../../agent/OfflineRunnerEmbed';
import './toolTraceTimeline.css';

const RUNNER_DELAY_MS = 2800;

export type ExecutionTimelineProps = {
  rows: AgentToolTraceRow[];
  mode?: AgentMode;
  compact?: boolean;
  onDismissRow?: (id: string) => void;
  onClear?: () => void;
  onCadJobTerminal?: (rowId: string) => void;
  showDoneFooter?: boolean;
  onOpenInEditor?: (file: { name: string; content: string }) => void;
};

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
  rows,
  mode = 'agent',
  onDismissRow,
  onClear,
  onCadJobTerminal,
  showDoneFooter = false,
  onOpenInEditor,
}) => {
  const [showRunner, setShowRunner] = useState(false);

  useEffect(() => {
    const anyRunning = rows.some((r) => r.status === 'running' && !r.cadJobLive);
    if (!anyRunning) {
      setShowRunner(false);
      return undefined;
    }
    const t = window.setTimeout(() => setShowRunner(true), RUNNER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [rows]);

  if (!rows.length) return null;
  const anyRunning = rows.some((r) => r.status === 'running');
  const anyCadLive = rows.some((r) => r.cadJobLive);

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
            defaultExpanded={Boolean(row.cadJobLive)}
            onOpenInEditor={onOpenInEditor}
            onDismiss={onDismissRow ? () => onDismissRow(row.id) : undefined}
            onCadJobTerminal={onCadJobTerminal}
          />
        ))}
        {showRunner && anyRunning && !anyCadLive ? (
          <div className="tool-trace-wait-runner mt-2 mb-1">
            <OfflineRunnerEmbed height={220} />
          </div>
        ) : null}
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
