-- 402: Drop legacy MCP tool registry (superseded by agentsam_mcp_tools)
-- Canonical registry: agentsam_mcp_tools (tool_key, handler_type, handler_config, modes_json).
-- IAM Worker (src/) and MCP server (tools/list, dispatch) read agentsam_mcp_tools only.
-- Views v_mcp_tools / v_mcp_tool_drift / v_agentsam_mcp_tools_* already use agentsam_mcp_tools.
-- Note: there was never a D1 table named mcp_tools; legacy name was mcp_registered_tools.

DROP TABLE IF EXISTS mcp_registered_tools;
