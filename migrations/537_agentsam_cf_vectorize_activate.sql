-- 537: Activate agentsam_cf_vectorize — cf vectorize.manage on main + MCP workers.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/537_agentsam_cf_vectorize_activate.sql

UPDATE agentsam_tools
SET
  is_active = 1,
  is_degraded = 0,
  handler_type = 'cf',
  tool_category = 'storage.vectorize',
  oauth_visible = 1,
  dispatch_target = 'both',
  handler_config = '{"operation":"vectorize.manage","resource":"vectorize","auth_source":"workspace","provider":"cloudflare"}',
  description = 'Query, upsert, or delete vectors in an Agent Sam Vectorize index. Pass index_name and operation (query|upsert|delete). For query/upsert pass raw vector[] or natural language in query/text (1536-d text-embedding-3-large).',
  input_schema = '{"type":"object","properties":{"operation":{"type":"string","enum":["query","upsert","delete"]},"index_name":{"type":"string","description":"Index name (e.g. agentsam-codebase-oai3large-1536) or lane alias code|schema|memory|documents|courses"},"query":{"type":"string","description":"Natural language query — embedded for query op when vector omitted"},"text":{"type":"string","description":"Text to embed for upsert when vector omitted"},"vector":{"type":"array","items":{"type":"number"},"description":"1536-d float embedding"},"top_k":{"type":"integer","description":"Query result limit (default 10)"},"id":{"type":"string","description":"Vector id for upsert/delete"},"ids":{"type":"array","items":{"type":"string"},"description":"Vector ids for delete"},"metadata":{"type":"object","description":"Optional metadata for upsert"},"filter":{"type":"object","description":"Optional Vectorize metadata filter for query"}},"required":["index_name"],"additionalProperties":true}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_cf_vectorize';

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  id, client_id, tool_key, sort_order, is_active, created_at, updated_at
)
VALUES (
  'ast_oauth_agentsam_cf_vectorize',
  'iam_mcp_inneranimalmedia',
  'agentsam_cf_vectorize',
  110,
  1,
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1, updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_cf_vectorize';
