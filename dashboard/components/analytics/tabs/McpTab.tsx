import React from 'react';
import { EmptyTelemetryCard } from '../cards/EmptyTelemetryCard';

export default function McpTab() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <EmptyTelemetryCard
        title="Tool Call Leaderboard"
        dataSourceKey="toolCalls"
        status="not_connected_yet"
        reason="MCP tool execution tables exist, but tool call analytics are not connected to /api/analytics yet."
        suggestedAction="Expose /api/analytics/mcp/tools backed by agentsam_mcp_tool_execution with agentsam_tool_call_log as fallback."
      />
      <EmptyTelemetryCard
        title="Tool Cache"
        dataSourceKey="toolCache"
        status="not_connected_yet"
        reason="Prompt/tool cache tracking exists in schema, but cache savings are not connected to the MCP tab yet."
        suggestedAction="Connect agentsam_prompt_cache_keys to a cache effectiveness aggregation endpoint."
      />
    </div>
  );
}

