import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

export default function RagTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EmptyTelemetryCard
        title="RAG Health"
        dataSourceKey="ragHealth"
        status="not_connected_yet"
        reason="RAG/codebase tables exist, but RAG health is not connected to the analytics API yet."
        suggestedAction="Expose /api/analytics/rag backed by existing RAG indexing + query tables already wired in the worker."
      />
    </div>
  );
}

