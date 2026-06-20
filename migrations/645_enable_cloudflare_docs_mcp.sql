-- 645: Enable Cloudflare Docs MCP — fix server URL + register runtime tools.
--
-- Cursor: add cloudflare-docs to .cursor/mcp.json (mcp-remote → docs.mcp.cloudflare.com).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/645_enable_cloudflare_docs_mcp.sql

UPDATE agentsam_mcp_servers
SET url = 'https://docs.mcp.cloudflare.com/mcp',
    auth_type = 'none',
    is_active = 1,
    display_name = 'Cloudflare Docs',
    updated_at = unixepoch()
WHERE server_key = 'cloudflare-docs';

INSERT OR IGNORE INTO agentsam_mcp_servers (
  server_key, display_name, url, auth_type, is_active, workspace_id, tenant_id, updated_at
) VALUES (
  'cloudflare-docs',
  'Cloudflare Docs',
  'https://docs.mcp.cloudflare.com/mcp',
  'none',
  1,
  NULL,
  NULL,
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, mcp_service_url, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global,
  oauth_visible, modes_json, updated_at
) VALUES (
  'ast_cf_docs_search',
  'search_cloudflare_documentation',
  'search_cloudflare_documentation',
  'Search Cloudflare Documentation',
  'cloudflare.docs',
  'mcp',
  'Search current Cloudflare product documentation (Workers, D1, R2, Workers AI, Pages, Zero Trust, etc.). Prefer over pretraining for limits, APIs, compatibility dates, and pricing.',
  '{"type":"object","properties":{"query":{"type":"string","description":"Natural language search query for Cloudflare docs."}},"required":["query"],"additionalProperties":false}',
  '{"auth_source":"platform","server_key":"cloudflare-docs","remote_tool":"search_cloudflare_documentation"}',
  'https://docs.mcp.cloudflare.com/mcp',
  'cloudflare.docs.search',
  'low',
  0,
  0,
  1,
  0,
  '["*"]',
  20,
  1,
  1,
  '["agent","research","plan","debug","multitask"]',
  unixepoch()
),
(
  'ast_cf_docs_pages_workers',
  'migrate_pages_to_workers_guide',
  'migrate_pages_to_workers_guide',
  'Pages → Workers Migration Guide',
  'cloudflare.docs',
  'mcp',
  'Fetch Cloudflare guidance for migrating Pages projects to Workers. Use when planning framework or deploy path changes.',
  '{"type":"object","properties":{},"additionalProperties":true}',
  '{"auth_source":"platform","server_key":"cloudflare-docs","remote_tool":"migrate_pages_to_workers_guide"}',
  'https://docs.mcp.cloudflare.com/mcp',
  'cloudflare.docs.migrate',
  'low',
  0,
  0,
  1,
  0,
  '["*"]',
  21,
  1,
  0,
  '["agent","plan","deploy"]',
  unixepoch()
);

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes)
VALUES
  ('atpk_cf_docs_search', 'agent_chat_essential', 'search_cloudflare_documentation', 18, 'Live Cloudflare docs MCP search'),
  ('atpk_cf_docs_migrate', 'agent_chat_optional', 'migrate_pages_to_workers_guide', 19, 'Pages→Workers migration guide via docs MCP');
