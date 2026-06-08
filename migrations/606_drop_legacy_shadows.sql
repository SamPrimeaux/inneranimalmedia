-- Legacy MCP/tool shadow tables — zero live reads in src/ as of 2026-06-08.
-- NOT dropped here: tenant_workspaces (live in provisioning/identity), usage_events,
-- workspaces, mcp_tool_call_stats (dashboard schema only — hold for explicit audit).

DROP TABLE IF EXISTS tool_invocations;
DROP TABLE IF EXISTS mcp_tool_calls;
