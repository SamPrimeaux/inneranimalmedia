-- 478: Fix OAuth MCP tool handler_config for memory_manager + supabase lanes.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/478_mcp_oauth_tool_dispatch_handler_config.sql

UPDATE agentsam_mcp_tools
SET handler_config = '{"operation":"memory_manager","auth_source":"platform","binding":"internal"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_manager';

UPDATE agentsam_tools
SET handler_config = '{"operation":"memory_manager","auth_source":"platform","binding":"internal"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_manager';

UPDATE agentsam_mcp_tools
SET handler_config = '{"binding":"HYPERDRIVE","auth_source":"platform","operation":"readonly_sql","schema":"agentsam"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_supabase_query';

UPDATE agentsam_tools
SET handler_config = '{"binding":"HYPERDRIVE","auth_source":"platform","operation":"readonly_sql","schema":"agentsam"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_supabase_query';
