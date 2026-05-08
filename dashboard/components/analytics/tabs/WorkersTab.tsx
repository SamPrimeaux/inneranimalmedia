import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

export default function WorkersTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EmptyTelemetryCard
        title="R2 Inventory"
        dataSourceKey="r2Inventory"
        status="not_connected_yet"
        reason="R2 inventory tables exist, but the Workers R2 analytics endpoint is not connected yet."
        suggestedAction="Expose /api/analytics/workers/r2 backed by r2_object_inventory and r2_bucket_summary."
      />
      <EmptyTelemetryCard
        title="Dashboard Versions"
        dataSourceKey="dashboardVersions"
        status="not_connected_yet"
        reason="Dashboard version tables exist, but version/deploy visibility is not connected yet."
        suggestedAction="Expose /api/analytics/workers/dashboard-versions backed by dashboard_versions."
      />
    </div>
  );
}

