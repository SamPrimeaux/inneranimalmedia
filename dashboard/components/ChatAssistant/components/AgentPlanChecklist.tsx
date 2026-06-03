/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { ExecutionPlanState, ExecutionPlanTaskStatus } from '../types';
import type { AgentMode } from '../types';
import { ChatPresenceIcon } from '../../../features/mode-presence/ChatPresenceIcon';

function statusIcon(status: ExecutionPlanTaskStatus, mode: AgentMode = 'plan') {
  if (status === 'done') {
    return <Check size={14} className="text-[var(--solar-green)] shrink-0" aria-hidden />;
  }
  if (status === 'failed') {
    return <X size={14} className="text-red-400 shrink-0" aria-hidden />;
  }
  if (status === 'skipped') {
    return <span className="text-[11px] text-[var(--dashboard-muted)] shrink-0">—</span>;
  }
  if (status === 'running') {
    return (
      <ChatPresenceIcon mode={mode} state="task_stack" size={14} className="shrink-0" />
    );
  }
  return (
    <span
      className="w-3.5 h-3.5 rounded border border-[var(--dashboard-border)] shrink-0 inline-block"
      aria-hidden
    />
  );
}

export type AgentPlanChecklistProps = {
  plan: ExecutionPlanState;
  mode?: AgentMode;
};

export const AgentPlanChecklist: React.FC<AgentPlanChecklistProps> = ({ plan, mode = 'plan' }) => {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...plan.tasks].sort((a, b) => a.order_index - b.order_index);
  const doneCount = sorted.filter((t) => t.status === 'done').length;
  const failedCount = sorted.filter((t) => t.status === 'failed').length;
  const total = sorted.length;
  const hasTrace = sorted.some(
    (t) =>
      t.detail ||
      t.trace?.execution_step_id ||
      t.trace?.command_run_id ||
      t.trace?.workflow_run_id,
  );

  const headerStatus =
    plan.status === 'complete'
      ? 'Complete'
      : plan.status === 'partial'
        ? 'Partial'
        : plan.status === 'failed'
          ? 'Failed'
          : plan.status === 'running'
            ? `Running${total ? ` · ${doneCount}/${total}` : ''}`
            : 'Planning';

  const headerPresenceState =
    plan.status === 'complete'
      ? 'handoff_ready'
      : plan.status === 'running'
        ? 'task_stack'
        : plan.status === 'failed'
          ? 'failed'
          : 'mapping';

  return (
    <div className="mt-2 rounded-xl border border-[var(--dashboard-border)]/90 bg-[var(--scene-bg)]/80 overflow-hidden max-w-full">
      <div className="px-3 py-2.5 border-b border-[var(--dashboard-border)]/60 flex items-start gap-2.5">
        <ChatPresenceIcon mode={mode} state={headerPresenceState} size={18} className="shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--dashboard-text)] leading-snug">
          {plan.plan_title || 'Plan'}
        </p>
        <p className="text-[10px] text-[var(--dashboard-muted)] mt-0.5">
          {headerStatus}
          {failedCount > 0 ? ` · ${failedCount} failed` : ''}
        </p>
        </div>
      </div>
      <ul className="px-2 py-2 space-y-0.5" aria-label="Plan tasks">
        {sorted.map((task) => (
          <li
            key={task.id}
            className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg text-[12px] text-[var(--dashboard-text)]"
          >
            <span className="mt-0.5">{statusIcon(task.status, mode)}</span>
            <span className="min-w-0 flex-1 leading-snug break-words [overflow-wrap:anywhere]">
              {task.title}
              {task.status === 'running' && (
                <span
                  className="block text-[10px] mt-0.5 text-[var(--solar-cyan)]"
                  style={{ animation: 'agent-sam-plan-shimmer 2.8s ease-in-out infinite' }}
                >
                  {task.detail ? String(task.detail).slice(0, 100) : 'Working…'}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {plan.status === 'running' && sorted.every((t) => t.status !== 'running') && (
        <div className="px-4 pb-2 flex items-center gap-2 text-[11px] text-[var(--dashboard-muted)]">
          <ChatPresenceIcon mode={mode} state="mapping" size={12} />
          Planning next moves…
        </div>
      )}
      {hasTrace ? (
        <div className="border-t border-[var(--dashboard-border)]/60">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide trace' : 'Show trace'}
          </button>
          {expanded ? (
            <div className="px-3 pb-3 space-y-2">
              {sorted
                .filter((t) => t.detail && t.status !== 'todo')
                .map((task) => (
                  <div key={`trace-${task.id}`} className="text-[11px] text-[var(--dashboard-muted)] leading-relaxed">
                    <span className="font-medium text-[var(--dashboard-text)]">{task.title}</span>
                    {' — '}
                    {String(task.detail).slice(0, 300)}
                  </div>
                ))}
              {sorted.filter((t) => t.detail && t.status !== 'todo').length === 0 && (
                <p className="text-[11px] text-[var(--dashboard-muted)]">No trace yet.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
