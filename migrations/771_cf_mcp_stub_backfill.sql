-- 771: Backfill stub agentsam_cf_* rows (tool_name set, tool_key NULL) from a prior
-- partial catalog write. Makes account-level CF MCP tools routable.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/771_cf_mcp_stub_backfill.sql

UPDATE agentsam_tools
SET tool_key = 'agentsam_cf_d1_list',
    display_name = 'Cloudflare D1 List',
    tool_category = 'cloudflare.d1',
    description = 'List all D1 databases in your connected Cloudflare account via Bindings MCP.',
    input_schema = '{"type":"object","additionalProperties":false,"properties":{}}',
    handler_type = 'mcp',
    handler_config = '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"d1_databases_list","auth_source":"user_oauth_tokens","provider":"cloudflare"}',
    risk_level = 'low',
    requires_approval = 0,
    workspace_scope = '["*"]',
    modes_json = '["ask","plan","debug","agent","multitask"]',
    oauth_visible = 1,
    dispatch_target = 'mcp_proxy',
    mcp_service_url = 'https://bindings.mcp.cloudflare.com/mcp',
    is_active = 1,
    is_global = 1,
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_cf_d1_list';

UPDATE agentsam_tools
SET tool_key = 'agentsam_cf_workers_list',
    display_name = 'Cloudflare Workers List',
    tool_category = 'cloudflare.workers',
    description = 'List Workers scripts in your connected Cloudflare account via Bindings MCP.',
    input_schema = '{"type":"object","additionalProperties":false,"properties":{}}',
    handler_type = 'mcp',
    handler_config = '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"workers_list","auth_source":"user_oauth_tokens","provider":"cloudflare"}',
    risk_level = 'low',
    requires_approval = 0,
    workspace_scope = '["*"]',
    modes_json = '["ask","plan","debug","agent","multitask"]',
    oauth_visible = 1,
    dispatch_target = 'mcp_proxy',
    mcp_service_url = 'https://bindings.mcp.cloudflare.com/mcp',
    is_active = 1,
    is_global = 1,
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_cf_workers_list';

UPDATE agentsam_tools
SET tool_key = 'agentsam_cf_worker_get',
    display_name = 'Cloudflare Worker Get',
    tool_category = 'cloudflare.workers',
    description = 'Get Worker script metadata from your connected Cloudflare account via Bindings MCP.',
    input_schema = '{"type":"object","additionalProperties":false,"properties":{"script_name":{"type":"string"},"worker_name":{"type":"string"}},"required":["script_name"]}',
    handler_type = 'mcp',
    handler_config = '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"workers_get_worker","auth_source":"user_oauth_tokens","provider":"cloudflare"}',
    risk_level = 'low',
    requires_approval = 0,
    workspace_scope = '["*"]',
    modes_json = '["ask","plan","debug","agent","multitask"]',
    oauth_visible = 1,
    dispatch_target = 'mcp_proxy',
    mcp_service_url = 'https://bindings.mcp.cloudflare.com/mcp',
    is_active = 1,
    is_global = 1,
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_cf_worker_get';

UPDATE agentsam_tools
SET tool_key = 'agentsam_cf_kv_list',
    display_name = 'Cloudflare KV Namespaces',
    tool_category = 'cloudflare.kv',
    description = 'List KV namespaces in your connected Cloudflare account via Bindings MCP. Use agentsam_kv_manage for key read/write.',
    input_schema = '{"type":"object","additionalProperties":false,"properties":{}}',
    handler_type = 'mcp',
    handler_config = '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"kv_namespaces_list","auth_source":"user_oauth_tokens","provider":"cloudflare"}',
    risk_level = 'low',
    requires_approval = 0,
    workspace_scope = '["*"]',
    modes_json = '["ask","plan","debug","agent","multitask"]',
    oauth_visible = 1,
    dispatch_target = 'mcp_proxy',
    mcp_service_url = 'https://bindings.mcp.cloudflare.com/mcp',
    is_active = 1,
    is_global = 1,
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_cf_kv_list';

UPDATE agentsam_tools
SET tool_key = 'agentsam_cf_r2_buckets',
    display_name = 'Cloudflare R2 Buckets',
    tool_category = 'cloudflare.r2',
    description = 'List or manage R2 buckets (account-level) via Bindings MCP. Use agentsam_r2_get/put/delete for object CRUD.',
    input_schema = '{"type":"object","additionalProperties":false,"properties":{"operation":{"type":"string","enum":["list","get","create"],"default":"list"},"name":{"type":"string"}}}',
    handler_type = 'mcp',
    handler_config = '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"r2_buckets_list","auth_source":"user_oauth_tokens","provider":"cloudflare"}',
    risk_level = 'low',
    requires_approval = 0,
    workspace_scope = '["*"]',
    modes_json = '["ask","plan","debug","agent","multitask"]',
    oauth_visible = 1,
    dispatch_target = 'mcp_proxy',
    mcp_service_url = 'https://bindings.mcp.cloudflare.com/mcp',
    is_active = 1,
    is_global = 1,
    updated_at = unixepoch()
WHERE tool_name = 'agentsam_cf_r2_buckets';
