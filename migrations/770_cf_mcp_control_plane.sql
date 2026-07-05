-- 770: Route account-level Cloudflare ops through Bindings MCP (OAuth) instead of
-- duplicate internal D1/KV/R2 bucket/Workers lanes. Object-level R2/KV keys,
-- Vectorize, and wrangler migrate stay on internal handlers.
--
-- Requires catalog-tool-executor.js + cf-mcp-proxy.js (Cloudflare OAuth bearer path).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/770_cf_mcp_control_plane.sql

-- ── 1. MCP server row ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO agentsam_mcp_servers (
  server_key, display_name, url, auth_type, is_active, workspace_id, tenant_id, updated_at
) VALUES (
  'cloudflare-bindings',
  'Cloudflare Bindings',
  'https://bindings.mcp.cloudflare.com/mcp',
  'user_oauth_cloudflare',
  1,
  NULL,
  NULL,
  unixepoch()
);

UPDATE agentsam_mcp_servers
SET url = 'https://bindings.mcp.cloudflare.com/mcp',
    auth_type = 'user_oauth_cloudflare',
    display_name = 'Cloudflare Bindings',
    is_active = 1,
    updated_at = unixepoch()
WHERE server_key = 'cloudflare-bindings';

-- ── 2. D1 query/write → CF MCP d1_database_query ─────────────────────────────
UPDATE agentsam_tools
SET handler_type = 'mcp',
    dispatch_target = 'mcp_proxy',
    mcp_service_url = 'https://bindings.mcp.cloudflare.com/mcp',
    oauth_visible = 1,
    handler_config = '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"d1_database_query","auth_source":"user_oauth_tokens","provider":"cloudflare","default_database_id":"cf87b717-d4e2-4cf8-bab0-a81268e32d49","resource":"d1"}',
    description = 'Run read-only D1 SQL (SELECT, schema discovery, EXPLAIN) via Cloudflare Bindings MCP using your connected CF OAuth. Defaults to platform business D1 when database_id is omitted.',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_d1_query';

UPDATE agentsam_tools
SET handler_type = 'mcp',
    dispatch_target = 'mcp_proxy',
    mcp_service_url = 'https://bindings.mcp.cloudflare.com/mcp',
    oauth_visible = 1,
    handler_config = '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"d1_database_query","auth_source":"user_oauth_tokens","provider":"cloudflare","default_database_id":"cf87b717-d4e2-4cf8-bab0-a81268e32d49","resource":"d1"}',
    description = 'Run D1 INSERT/UPDATE/DELETE/DDL via Cloudflare Bindings MCP using your connected CF OAuth. Defaults to platform business D1 when database_id is omitted.',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_d1_write';

-- Migrate stays internal (wrangler/terminal lane)
UPDATE agentsam_tools
SET handler_type = 'cf',
    dispatch_target = 'internal',
    handler_config = '{"operation":"d1.migrate","auth_source":"workspace","provider":"cloudflare","resource":"d1"}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_d1_migrate';

-- ── 3. New account-level CF MCP tools ───────────────────────────────────────
-- See migrations/771_cf_mcp_stub_backfill.sql (upserts stub rows by tool_name).

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category,
  description, input_schema,
  handler_type, handler_config,
  risk_level, requires_approval,
  workspace_scope, modes_json,
  oauth_visible, dispatch_target, mcp_service_url,
  is_active, is_global,
  updated_at
) VALUES (
  'ast_cf_worker_code',
  'agentsam_cf_worker_code', 'agentsam_cf_worker_code', 'Cloudflare Worker Code', 'cloudflare.workers',
  'Fetch Worker script source code via Bindings MCP.',
  '{"type":"object","additionalProperties":false,"properties":{"script_name":{"type":"string"},"worker_name":{"type":"string"}},"required":["script_name"]}',
  'mcp',
  '{"mcp_service_url":"https://bindings.mcp.cloudflare.com/mcp","server_key":"cloudflare-bindings","remote_tool":"workers_get_worker_code","auth_source":"user_oauth_tokens","provider":"cloudflare"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 'mcp_proxy', 'https://bindings.mcp.cloudflare.com/mcp',
  1, 1,
  unixepoch()
);

-- ── 4. Explicit internal-only object lanes (no accidental MCP routing) ───────
UPDATE agentsam_tools
SET dispatch_target = 'internal',
    updated_at = unixepoch()
WHERE tool_key IN (
  'agentsam_r2_get',
  'agentsam_r2_put',
  'agentsam_r2_delete',
  'agentsam_r2_list',
  'agentsam_kv_manage',
  'agentsam_cf_vectorize'
);

-- ── 5. Capability aliases for new tools ─────────────────────────────────────
INSERT OR IGNORE INTO agentsam_capability_aliases (
  abstract_capability, match_kind, match_value, capability_lane, priority, requires_approval, is_mutation, rationale, is_active
) VALUES
  ('cloudflare.d1.list', 'tool_key', 'agentsam_cf_d1_list', 'develop', 10, 0, 0, '770: CF MCP D1 list', 1),
  ('cloudflare.workers.list', 'tool_key', 'agentsam_cf_workers_list', 'develop', 10, 0, 0, '770: CF MCP workers list', 1),
  ('cloudflare.workers.read', 'tool_key', 'agentsam_cf_worker_get', 'develop', 10, 0, 0, '770: CF MCP worker get', 1),
  ('cloudflare.kv.list', 'tool_key', 'agentsam_cf_kv_list', 'develop', 10, 0, 0, '770: CF MCP KV namespaces', 1),
  ('cloudflare.r2.buckets', 'tool_key', 'agentsam_cf_r2_buckets', 'develop', 10, 0, 0, '770: CF MCP R2 buckets', 1);
