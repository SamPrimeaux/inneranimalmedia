ALTER TABLE agentsam_mcp_tools ADD COLUMN tenant_id TEXT;
ALTER TABLE agentsam_mcp_tools ADD COLUMN workspace_id TEXT;
ALTER TABLE agentsam_mcp_tools ADD COLUMN agent_id TEXT;
ALTER TABLE agentsam_mcp_tools ADD COLUMN server_key TEXT;
ALTER TABLE agentsam_mcp_tools ADD COLUMN server_id TEXT;
ALTER TABLE agentsam_mcp_tools ADD COLUMN routing_scope TEXT DEFAULT 'workspace';
ALTER TABLE agentsam_mcp_tools ADD COLUMN last_error TEXT;
ALTER TABLE agentsam_mcp_tools ADD COLUMN health_status TEXT DEFAULT 'unknown';
ALTER TABLE agentsam_mcp_tools ADD COLUMN health_checked_at TEXT;
