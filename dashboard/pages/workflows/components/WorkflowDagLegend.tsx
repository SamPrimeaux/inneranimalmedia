import React from 'react';

export function WorkflowDagLegend() {
  return (
    <div className="wf-dag-legend" aria-label="DAG canvas legend">
      <div className="wf-dag-legend-title">DAG semantics</div>
      <div className="wf-dag-legend-row">
        <span className="wf-legend-dot idle" /> Idle step
      </div>
      <div className="wf-dag-legend-row">
        <span className="wf-legend-dot running" /> Running (live SSE)
      </div>
      <div className="wf-dag-legend-row">
        <span className="wf-legend-dot done" /> Completed
      </div>
      <div className="wf-dag-legend-row">
        <span className="wf-legend-dot failed" /> Failed / denied
      </div>
      <div className="wf-dag-legend-hint">
        Edges define dependencies. Fan-out steps can run in parallel when they share no blocking edge.
      </div>
    </div>
  );
}
