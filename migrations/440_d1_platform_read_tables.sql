-- 440: D1 platform catalog tables — SELECT via agentsam_db_query without tenant/workspace tautology.
-- Data tables with tenant_id/workspace_id still require real scope filters (enforced in MCP).

CREATE TABLE IF NOT EXISTS agentsam_d1_platform_read_tables (
  table_name TEXT PRIMARY KEY,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO agentsam_d1_platform_read_tables (table_name, notes) VALUES
  ('agentsam_cookbook', 'Recipe/prompt catalog (no tenant column)'),
  ('agentsam_tools', 'Tool registry'),
  ('agentsam_mcp_oauth_tool_allowlist', 'OAuth connector tool allowlist'),
  ('agentsam_mcp_oauth_external_client_registry', 'ChatGPT/Claude/Cursor registry'),
  ('agentsam_capability_aliases', 'Public tool_key ↔ executor aliases'),
  ('agentsam_model_catalog', 'Model provider catalog'),
  ('agentsam_rules_document', 'Platform rules'),
  ('agentsam_workflows', 'Workflow registry'),
  ('agentsam_workflow_handlers', 'Workflow handler registry'),
  ('agentsam_workflow_nodes', 'Workflow node definitions'),
  ('agentsam_workflow_edges', 'Workflow edges'),
  ('agentsam_prompt_routes', 'Prompt routing registry'),
  ('agentsam_routing_arms', 'Routing arms'),
  ('agentsam_route_requirements', 'Route capability requirements'),
  ('oauth_clients', 'OAuth client registry'),
  ('agentsam_mcp_tools', 'Per-user MCP tool bindings'),
  ('agentsam_tool_pricing', 'Tool pricing reference'),
  ('ai_tool_roles', 'External AI role metadata');

UPDATE agentsam_tools
SET schema_hint = COALESCE(schema_hint, '') || ' Use agentsam_db_schema for table discovery. Platform catalog tables (agentsam_cookbook, agentsam_tools, allowlists) are readable without tenant filter; user data tables require tenant_id or workspace_id in SQL.',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_db_query', 'd1_query');
