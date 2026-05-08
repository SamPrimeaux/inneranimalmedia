import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

export default function D1TelemetryTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EmptyTelemetryCard
        title="D1 Telemetry"
        dataSourceKey="executionPerf"
        status="not_connected_yet"
        reason="D1 telemetry is designed to roll up through execution performance metrics, but the analytics endpoint wiring is not connected yet."
        suggestedAction="Expose /api/analytics/d1 backed by agentsam_execution_performance_metrics and key D1 telemetry tables."
      />
      <EmptyTelemetryCard
        title="Data Health"
        dataSourceKey="dataHealth"
        status="not_connected_yet"
        reason="Data health classification endpoint is staged, but not implemented yet."
        suggestedAction="Implement /api/analytics/data-health with table classification and freshness checks."
      />
    </div>
  );
}

