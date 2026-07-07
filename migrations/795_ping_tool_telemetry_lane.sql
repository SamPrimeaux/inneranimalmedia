-- 795: agentsam_ping — handler_type must match agentsam_tools CHECK (telemetry, not platform).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/795_ping_tool_telemetry_lane.sql

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, handler_key, handler_config,
  description, input_schema,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_global, workspace_scope, oauth_visible, dispatch_target,
  sort_priority, updated_at
) VALUES (
  'ast_agentsam_ping',
  'agentsam_ping',
  'agentsam_ping',
  'Ping',
  'telemetry',
  'platform',
  'agentsam_ping',
  '{"operation":"ping","auth_source":"none"}',
  'Liveness ping — returns MCP server version and workspace context (no side effects).',
  '{"type":"object","properties":{"echo":{"type":"string","description":"Optional string echoed in response"}},"additionalProperties":false}',
  'low',
  0,
  0,
  1,
  1,
  '["*"]',
  1,
  'mcp',
  3,
  unixepoch()
);

UPDATE agentsam_tools
SET
  handler_type = 'telemetry',
  handler_key = 'agentsam_ping',
  handler_config = '{"operation":"ping","auth_source":"none"}',
  oauth_visible = 1,
  is_active = 1,
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_ping';
