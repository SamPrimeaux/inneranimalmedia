-- 423: Move agentsam_health_check + agentsam_workspace_context to catalog d1 handlers (envelope post-process).
-- MCP server: mcp-d1-sql-executor.js applyD1ResponseEnvelope — not mcp-builtin-handlers.js
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/423_agentsam_discovery_health_context_catalog.sql

UPDATE agentsam_tools
SET
  handler_type = 'd1',
  tool_category = 'platform',
  handler_config = '{"sql":"SELECT id, name, tenant_id, r2_prefix, github_repo FROM workspaces WHERE id = :workspace_id LIMIT 1","bind_workspace":true,"envelope":"mcp_health"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_health_check';

UPDATE agentsam_tools
SET
  handler_type = 'd1',
  tool_category = 'platform',
  handler_config = '{"sql":"SELECT w.id, w.name, w.handle, w.domain, w.tenant_id, w.r2_prefix, w.github_repo, ws.settings_json AS settings_json FROM workspaces w LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id WHERE w.id = :workspace_id LIMIT 1","bind_workspace":true,"envelope":"workspace_context"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_workspace_context';

UPDATE agentsam_mcp_tools
SET
  handler_type = 'd1',
  handler_config = '{"sql":"SELECT id, name, tenant_id, r2_prefix, github_repo FROM workspaces WHERE id = :workspace_id LIMIT 1","bind_workspace":true,"envelope":"mcp_health"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_health_check';

UPDATE agentsam_mcp_tools
SET
  handler_type = 'd1',
  handler_config = '{"sql":"SELECT w.id, w.name, w.handle, w.domain, w.tenant_id, w.r2_prefix, w.github_repo, ws.settings_json AS settings_json FROM workspaces w LEFT JOIN workspace_settings ws ON ws.workspace_id = w.id WHERE w.id = :workspace_id LIMIT 1","bind_workspace":true,"envelope":"workspace_context"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_workspace_context';
