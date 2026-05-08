import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

export default function CodebaseTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EmptyTelemetryCard
        title="Codebase Health"
        dataSourceKey="codebaseHealth"
        status="not_connected_yet"
        reason="Codebase indexing exists, but codebase health is not connected to the analytics API yet."
        suggestedAction="Expose /api/analytics/codebase backed by code index job + indexing freshness tables."
      />
    </div>
  );
}

