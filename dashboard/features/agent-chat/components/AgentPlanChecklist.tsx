/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import type { ExecutionPlanState, ExecutionPlanTaskStatus } from '../types';

function statusIcon(status: ExecutionPlanTaskStatus) {
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
    return <Loader2 size={14} className="text-[var(--solar-cyan)] animate-spin shrink-0" aria-hidden />;
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
};

export const AgentPlanChecklist: React.FC<AgentPlanChecklistProps> = ({ plan }) => {
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

  return (
    <div className="mt-2 rounded-xl border border-[var(--dashboard-border)]/90 bg-[var(--scene-bg)]/80 overflow-hidden max-w-full">
      <div className="px-3 py-2.5 border-b border-[var(--dashboard-border)]/60">
        <p className="text-[13px] font-semibold text-[var(--dashboard-text)] leading-snug">
          {plan.plan_title || 'Plan'}
        </p>
        <p className="text-[10px] text-[var(--dashboard-muted)] mt-0.5">
          {headerStatus}
          {failedCount > 0 ? ` · ${failedCount} failed` : ''}
        </p>
      </div>
      <ul className="px-2 py-2 space-y-0.5" aria-label="Plan tasks">
        {sorted.map((task) => (
          <li
            key={task.id}
            className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg text-[12px] text-[var(--dashboard-text)]"
          >
            <span className="mt-0.5">{statusIcon(task.status)}</span>
            <span className="min-w-0 flex-1 leading-snug break-words [overflow-wrap:anywhere]">
              {task.title}
            </span>
          </li>
        ))}
      </ul>
      {hasTrace ? (
        <div className="border-t border-[var(--dashboard-border)]/60">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-[var(--dashboard-muted)] hover:text-[var(--solar-cyan)] transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded ? (
            <div className="px-3 pb-3 space-y-2 text-[10px] font-mono text-[var(--dashboard-muted)] break-all">
              {plan.workflow_run_id ? (
                <p>
                  <span className="text-[var(--text-muted)]">workflow_run_id</span> {plan.workflow_run_id}
                </p>
              ) : null}
              {plan.plan_id ? (
                <p>
                  <span className="text-[var(--text-muted)]">plan_id</span> {plan.plan_id}
                </p>
              ) : null}
              {sorted.map((task) => {
                const bits: string[] = [];
                if (task.trace?.execution_step_id) bits.push(`step ${task.trace.execution_step_id}`);
                if (task.trace?.command_run_id) bits.push(`cmd ${task.trace.command_run_id}`);
                if (task.trace?.capability_type) bits.push(task.trace.capability_type);
                if (task.trace?.files_involved?.length) {
                  bits.push(`files: ${task.trace.files_involved.join(', ')}`);
                }
                if (!task.detail && !bits.length) return null;
                return (
                  <div key={`trace-${task.id}`} className="rounded border border-[var(--dashboard-border)]/50 p-2">
                    <p className="text-[11px] font-sans font-medium text-[var(--dashboard-text)] mb-1">
                      #{task.order_index + 1} {task.title}
                    </p>
                    {bits.length ? <p>{bits.join(' · ')}</p> : null}
                    {task.detail ? <p className="mt-1 whitespace-pre-wrap">{task.detail}</p> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
