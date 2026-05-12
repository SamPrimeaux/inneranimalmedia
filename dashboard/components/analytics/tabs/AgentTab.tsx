import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';
import { AgentChatPlanTracePanel } from '../panels/AgentChatPlanTracePanel';

export default function AgentTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <AgentChatPlanTracePanel />
      </div>
      <EmptyTelemetryCard
        title="Workflow Graph"
        dataSourceKey="workflowGraph"
        status="not_connected_yet"
        reason="Workflow node/edge tables exist, but workflow graph rendering is not connected to the analytics API yet."
        suggestedAction="Expose /api/analytics/agent/graph from agentsam_workflow_nodes and agentsam_workflow_edges."
      />
      <EmptyTelemetryCard
        title="Dependency Graph"
        dataSourceKey="dependencyGraph"
        status="not_connected_yet"
        reason="Dependency graph schema exists, but chain dependency events are not yet surfaced in workflow drilldowns."
        suggestedAction="Connect agentsam_execution_dependency_graph to workflow drilldowns and /api/analytics/agent/dependencies."
      />
    </div>
  );
}

