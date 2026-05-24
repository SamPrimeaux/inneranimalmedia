-- 407: Read-only MCP discovery tools (health, workspace context, errors, registry search).
-- MCP server: handleBuiltin in inneranimalmedia-mcp-server (v2.6.1+).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/407_mcp_discovery_read_tools.sql

INSERT OR IGNORE INTO agentsam_mcp_tools (
  id,
  user_id,
  tool_key,
  tool_name,
  display_name,
  tool_category,
  description,
  input_schema,
  handler_type,
  handler_config,
  enabled,
  is_active,
  risk_level,
  requires_approval,
  modes_json,
  workspace_scope,
  routing_scope,
  updated_at
)
SELECT
  'amt_' || t.tool_key,
  COALESCE(
    (SELECT user_id FROM agentsam_mcp_tools WHERE tool_key = 'agentsam_list_agents' AND trim(COALESCE(user_id, '')) != '' LIMIT 1),
    'au_871d920d1233cbd1'
  ),
  t.tool_key,
  t.tool_key,
  t.tool_key,
  'discovery',
  t.description,
  t.input_schema,
  'builtin',
  '{}',
  1,
  1,
  'low',
  0,
  '["auto","agent","debug","ask"]',
  '["*"]',
  'workspace',
  unixepoch()
FROM (
  SELECT 'agentsam_health_check' AS tool_key,
    'Live MCP server status: version, workspace/token binding, binding availability (no secrets).' AS description,
    '{"type":"object","properties":{},"additionalProperties":false}' AS input_schema
  UNION ALL SELECT 'agentsam_workspace_context',
    'Workspace row, settings_json, r2_prefix, github_repo, and default model from D1.',
    '{"type":"object","properties":{},"additionalProperties":false}'
  UNION ALL SELECT 'agentsam_recent_errors',
    'Last N errors for this workspace from agentsam_error_log (read-only).',
    '{"type":"object","properties":{"limit":{"type":"integer","description":"Max rows (default 20, max 100)"}},"additionalProperties":false}'
  UNION ALL SELECT 'agentsam_search_tools',
    'Search agentsam_mcp_tools registry by name, lane/category, or description.',
    '{"type":"object","properties":{"query":{"type":"string","description":"Search text"},"limit":{"type":"integer","description":"Max results (default 25, max 50)"}},"required":["query"],"additionalProperties":false}'
) AS t;

INSERT OR IGNORE INTO agentsam_capability_aliases (
  abstract_capability,
  match_kind,
  match_value,
  capability_lane,
  priority,
  requires_approval,
  is_mutation,
  rationale,
  is_active
) VALUES
  ('agentsam_health_check', 'tool_key', 'agentsam_health_check', 'discover', 10, 0, 0, 'MCP health probe', 1),
  ('agentsam_workspace_context', 'tool_key', 'agentsam_workspace_context', 'discover', 10, 0, 0, 'Workspace binding context', 1),
  ('agentsam_recent_errors', 'tool_key', 'agentsam_recent_errors', 'discover', 10, 0, 0, 'Workspace error tail', 1),
  ('agentsam_search_tools', 'tool_key', 'agentsam_search_tools', 'discover', 10, 0, 0, 'Registry search', 1);

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, notes) VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_health_check', 'read', 5, 'Server + workspace health'),
  ('iam_mcp_inneranimalmedia', 'agentsam_workspace_context', 'read', 6, 'Workspace settings snapshot'),
  ('iam_mcp_inneranimalmedia', 'agentsam_recent_errors', 'read', 7, 'Recent workspace errors'),
  ('iam_mcp_inneranimalmedia', 'agentsam_search_tools', 'read', 8, 'Search tool registry');
