/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { AgentMode } from '../types';
import type { AgentToolTraceRow } from './types';
import { ToolTraceRow } from './ToolTraceRow';
import { OfflineRunnerEmbed } from '../../agent/OfflineRunnerEmbed';
import { isImageGenerationToolName } from '../../../lib/toolTracePreview';
import './toolTraceTimeline.css';

const RUNNER_DELAY_MS_DESKTOP = 2800;
const RUNNER_DELAY_MS_COMPACT = 400;

function onlyImageGenToolsRunning(rows: AgentToolTraceRow[]): boolean {
  const running = rows.filter((r) => r.status === 'running' && !r.cadJobLive);
  return running.length > 0 && running.every((r) => isImageGenerationToolName(r.toolName));
}

export type ExecutionTimelineProps = {
  rows: AgentToolTraceRow[];
  mode?: AgentMode;
  workspaceId?: string | null;
  compact?: boolean;
  onDismissRow?: (id: string) => void;
  onClear?: () => void;
  onCadJobTerminal?: (rowId: string) => void;
  showDoneFooter?: boolean;
  /** Resolved model for this turn (e.g. gpt-5.6-terra) — shown in Done footer. */
  runModelKey?: string | null;
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
  runModelKey = null,
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
    // Image gen has its own progressive card — never swap in the dodge mini-game.
    if (!anyRunning || anyFailed || anyTerminalRunning || onlyImageGenToolsRunning(rows)) {
      setShowRunner(false);
      return undefined;
    }
    const t = window.setTimeout(() => setShowRunner(true), runnerDelayMs);
    return () => window.clearTimeout(t);
  }, [rows, runnerDelayMs]);

  if (!rows.length) return null;
  // Image tools render via AgentImageGenerationCard — never the tool SQL/result chrome.
  const visibleRows = rows.filter((r) => !isImageGenerationToolName(r.toolName));
  if (!visibleRows.length) return null;
  const anyRunning = visibleRows.some((r) => r.status === 'running' && !r.cadJobLive);
  const anyFailed = visibleRows.some((r) => r.status === 'error' || r.status === 'failed');
  const anyCadLive = visibleRows.some((r) => r.cadJobLive);
  const anyTerminalRunning = visibleRows.some(
    (r) => r.status === 'running' && r.toolName?.startsWith('agentsam_terminal'),
  );
  const hideWaitRunner =
    onlyImageGenToolsRunning(rows) || rows.every((r) => isImageGenerationToolName(r.toolName));

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
        {visibleRows.map((row) => (
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
        {showRunner &&
        anyRunning &&
        !anyFailed &&
        !anyCadLive &&
        !anyTerminalRunning &&
        !hideWaitRunner ? (
          <div className="tool-trace-wait-runner mt-2 mb-1">
            <OfflineRunnerEmbed height={220} />
          </div>
        ) : null}
        {showDoneFooter && !anyRunning ? (
          <div className="tool-trace-done" role="status">
            <span className="tool-trace-done-mark" aria-hidden>
              ✓
            </span>
            <span>Done</span>
            {runModelKey?.trim() ? (
              <span className="tool-trace-done-meta" title={runModelKey.trim()}>
                · {runModelKey.trim()}
              </span>
            ) : null}
            {visibleRows.length > 0 ? (
              <span
                className="tool-trace-done-meta"
                title={visibleRows.map((r) => r.toolName).filter(Boolean).join(', ')}
              >
                ·{' '}
                {Array.from(new Set(visibleRows.map((r) => r.toolName).filter(Boolean)))
                  .slice(0, 4)
                  .join(', ')}
                {visibleRows.length > 4 ? ` +${visibleRows.length - 4}` : ''}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
