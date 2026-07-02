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

const RUNNER_DELAY_MS_DESKTOP = 2800;
const RUNNER_DELAY_MS_COMPACT = 400;

export type ExecutionTimelineProps = {
  rows: AgentToolTraceRow[];
  mode?: AgentMode;
  workspaceId?: string | null;
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
  workspaceId = null,
  compact = false,
  onDismissRow,
  onClear,
  onCadJobTerminal,
  showDoneFooter = false,
  onOpenInEditor,
}) => {
  const [showRunner, setShowRunner] = useState(false);
  const runnerDelayMs = compact ? RUNNER_DELAY_MS_COMPACT : RUNNER_DELAY_MS_DESKTOP;

  useEffect(() => {
    const anyRunning = rows.some((r) => r.status === 'running' && !r.cadJobLive);
    const anyFailed = rows.some((r) => r.status === 'error' || r.status === 'failed');
    const anyTerminalRunning = rows.some(
      (r) => r.status === 'running' && r.toolName?.startsWith('agentsam_terminal'),
    );
    if (!anyRunning || anyFailed || anyTerminalRunning) {
      setShowRunner(false);
      return undefined;
    }
    const t = window.setTimeout(() => setShowRunner(true), runnerDelayMs);
    return () => window.clearTimeout(t);
  }, [rows, runnerDelayMs]);

  if (!rows.length) return null;
  const anyRunning = rows.some((r) => r.status === 'running' && !r.cadJobLive);
  const anyFailed = rows.some((r) => r.status === 'error' || r.status === 'failed');
  const anyCadLive = rows.some((r) => r.cadJobLive);
  const anyTerminalRunning = rows.some(
    (r) => r.status === 'running' && r.toolName?.startsWith('agentsam_terminal'),
  );

  return (
    <div className="mt-2 min-w-0" aria-label="Execution timeline">
      {onClear ? (
        <div className="flex justify-end pb-0.5">
          <button
            type="button"
            className="text-[10px] text-muted hover:text-[var(--solar-cyan)]"
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
            workspaceId={workspaceId}
            compact={compact}
            defaultExpanded={Boolean(row.cadJobLive)}
            onOpenInEditor={onOpenInEditor}
            onDismiss={onDismissRow ? () => onDismissRow(row.id) : undefined}
            onCadJobTerminal={onCadJobTerminal}
          />
        ))}
        {showRunner && anyRunning && !anyFailed && !anyCadLive && !anyTerminalRunning ? (
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
