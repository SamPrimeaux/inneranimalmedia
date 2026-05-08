import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

export default function AdvisorsTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EmptyTelemetryCard
        title="Advisor Findings"
        dataSourceKey="dataHealth"
        status="not_connected_yet"
        reason="Advisor surfaces are staged, but findings are not connected to the analytics API yet."
        suggestedAction="Expose /api/analytics/advisors and map findings from error + guardrail + data health sources."
      />
      <EmptyTelemetryCard
        title="Guardrails"
        dataSourceKey="guardrails"
        status="not_connected_yet"
        reason="Guardrail events exist, but guardrail analytics are not connected to the Advisors tab yet."
        suggestedAction="Expose /api/analytics/advisors/guardrails backed by agentsam_guardrail_events."
      />
    </div>
  );
}

