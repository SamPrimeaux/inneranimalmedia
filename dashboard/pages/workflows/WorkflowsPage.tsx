/**
 * D1 workflow runner — moved out of Agent chat for a dedicated surface.
 */
import React, { useCallback } from 'react';
import { Network } from 'lucide-react';
import {
  WorkflowPicker,
  WorkflowRunCard,
  useWorkflowRunner,
} from '../../features/agent-chat/components/WorkflowRunBoard';
import type { WorkflowRow } from '../../features/agent-chat/components/WorkflowRunBoard';

export const WorkflowsPage: React.FC = () => {
  const { runState, approvalBusy, startWorkflow, handleApproval } = useWorkflowRunner({});

  const handleStart = useCallback(
    (workflow: WorkflowRow) => {
      void startWorkflow(workflow);
    },
    [startWorkflow],
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[var(--dashboard-canvas)] text-[var(--dashboard-text)]">
      <header className="shrink-0 border-b border-[var(--dashboard-border)] px-4 py-3 flex items-center gap-3 bg-[var(--dashboard-panel)]">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--dashboard-border)] bg-[var(--scene-bg)] text-[var(--solar-cyan)]">
          <Network size={18} strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold text-[var(--text-heading)] tracking-tight">Workflows</h1>
          <p className="text-[11px] text-[var(--dashboard-muted)] mt-0.5">
            Run D1-backed graphs from <code className="text-[var(--solar-cyan)]">agentsam_workflows</code> with live SSE.
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-4">
          <section className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] overflow-hidden">
            <WorkflowPicker
              onStartWorkflow={handleStart}
              isRunning={runState.status === 'running' || runState.status === 'awaiting_approval'}
            />
          </section>

          {runState.status !== 'idle' && (
            <section className="rounded-xl border border-[var(--dashboard-border)] bg-[var(--scene-bg)] p-3">
              <WorkflowRunCard runState={runState} onApprove={handleApproval} approvalBusy={approvalBusy} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
