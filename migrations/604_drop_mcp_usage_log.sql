-- mcp_usage_log retired — all MCP tool execution now writes to agentsam_tool_call_log
-- Confirmed zero reads in codebase as of 2026-06-08 (caff9f68)

DROP TRIGGER IF EXISTS trg_mcp_tool_calls_usage;

DROP TABLE IF EXISTS mcp_usage_log;
