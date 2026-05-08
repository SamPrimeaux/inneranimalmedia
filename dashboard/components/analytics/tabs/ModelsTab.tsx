import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

export default function ModelsTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EmptyTelemetryCard
        title="Model Leaderboard"
        dataSourceKey="modelLeaderboard"
        status="not_connected_yet"
        reason="Execution performance metrics are provisioned, but the model leaderboard endpoint is not connected yet."
        suggestedAction="Expose /api/analytics/models/leaderboard backed by agentsam_execution_performance_metrics."
      />
      <EmptyTelemetryCard
        title="Eval Runs"
        dataSourceKey="evalRuns"
        status="not_connected_yet"
        reason="Eval tables exist, but eval execution is not connected to the analytics API yet."
        suggestedAction="Wire eval writes and expose /api/analytics/models/evals."
      />
    </div>
  );
}

