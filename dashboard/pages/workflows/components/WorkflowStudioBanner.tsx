import React from 'react';
import { GitBranch, Play, Plus } from 'lucide-react';

type Props = {
  workflowName?: string | null;
  workflowKey?: string | null;
  nodeCount?: number;
  edgeCount?: number;
  runStatus?: string;
  isRunning?: boolean;
  onOpenLibrary: () => void;
  onCreateWorkflow: () => void;
  onRun: () => void;
  canRun: boolean;
};

export function WorkflowStudioBanner({
  workflowName,
  workflowKey,
  nodeCount = 0,
  edgeCount = 0,
  runStatus = 'idle',
  isRunning = false,
  onOpenLibrary,
  onCreateWorkflow,
  onRun,
  canRun,
}: Props) {
  const statusLabel =
    runStatus === 'awaiting_approval'
      ? 'Awaiting approval'
      : runStatus === 'running'
        ? 'Running'
        : runStatus === 'completed'
          ? 'Completed'
          : runStatus === 'error' || runStatus === 'failed'
            ? 'Failed'
            : 'Ready';

  return (
    <div className="wf-hero">
      <div className="wf-hero-main">
        <div className="wf-hero-kicker">
          <GitBranch size={14} />
          DAG Workflow Studio
        </div>
        <h1 className="wf-hero-title">{workflowName || 'Build automations as a graph'}</h1>
        <p className="wf-hero-copy">
          Design step dependencies on the canvas, run live with SSE, and pause at approval gates.
          Steps with parallel branches run concurrently when edges allow — same mental model as
          Cloudflare Workflows DAG.
        </p>
        <div className="wf-hero-meta">
          <span className="wf-tag accent">D1-backed DAG</span>
          <span className="wf-tag">Live SSE runs</span>
          <span className="wf-tag">Approval resume</span>
          {workflowKey ? (
            <span className="wf-tag mono">{workflowKey}</span>
          ) : null}
          {nodeCount > 0 ? <span className="wf-tag">{nodeCount} nodes · {edgeCount} edges</span> : null}
        </div>
      </div>
      <div className="wf-hero-actions">
        <span className={`wf-status-pill status-${runStatus}`}>{statusLabel}</span>
        <button type="button" className="wf-btn" onClick={onOpenLibrary}>
          Library
        </button>
        <button type="button" className="wf-btn" onClick={onCreateWorkflow}>
          <Plus size={14} />
          New workflow
        </button>
        <button type="button" className="wf-btn primary" disabled={!canRun || isRunning} onClick={onRun}>
          <Play size={14} />
          {isRunning ? 'Running…' : 'Run DAG'}
        </button>
      </div>
    </div>
  );
}
