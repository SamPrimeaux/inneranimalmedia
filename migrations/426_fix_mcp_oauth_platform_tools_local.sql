-- 426: Point OAuth MCP platform tools at local D1 / OAuth-forward handlers (MCP worker).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/426_fix_mcp_oauth_platform_tools_local.sql

UPDATE agentsam_tools
SET handler_type = 'mcp',
    handler_config = '{"operation":"deploy_status","auth_source":"platform","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_deploy_status';

UPDATE agentsam_tools
SET handler_type = 'mcp',
    handler_config = '{"operation":"daily_summary","auth_source":"platform","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_daily_summary';

UPDATE agentsam_tools
SET handler_type = 'mcp',
    handler_config = '{"operation":"plan","auth_source":"platform","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_plan';

UPDATE agentsam_tools
SET handler_type = 'mcp',
    handler_config = '{"operation":"notify","auth_source":"platform","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_notify';

UPDATE agentsam_tools
SET handler_type = 'mcp',
    handler_config = '{"operation":"cms_read","auth_source":"platform","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_cms_read';

UPDATE agentsam_tools
SET handler_type = 'mcp',
    handler_config = '{"operation":"agent_run","auth_source":"platform","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_run';

UPDATE agentsam_tools
SET handler_type = 'proxy',
    handler_config = '{"proxy_tool":"gdrive_fetch","fallback":"gdrive_list","binding":"local"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_drive_read';
