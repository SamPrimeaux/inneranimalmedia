-- 599: Wire subagent profile tools to agentsam_subagent_profile (singular) — list/get/create.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/599_subagent_profile_tools_fix.sql

UPDATE agentsam_tools
SET
  handler_type = 'agent',
  handler_key = 'agentsam_list_agents',
  handler_config = '{"handler":"agentsam_list_agents","auth_source":"workspace"}',
  description = 'List subagent profiles from agentsam_subagent_profile for this user and workspace (includes platform-global templates).',
  is_active = 1,
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_list_agents';

UPDATE agentsam_tools
SET
  handler_type = 'agent',
  handler_key = 'agentsam_get_agent',
  handler_config = '{"handler":"agentsam_get_agent","auth_source":"workspace"}',
  description = 'Get one subagent profile by slug from agentsam_subagent_profile.',
  is_active = 1,
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_get_agent';

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category,
  handler_key, handler_config,
  description, input_schema,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_global, workspace_scope,
  sort_priority, updated_at
) VALUES (
  'ast_agentsam_create_subagent',
  'agentsam_create_subagent',
  'agentsam_create_subagent',
  'Create Subagent',
  'agent', 'agent',
  'agentsam_create_subagent',
  '{"handler":"agentsam_create_subagent","auth_source":"workspace"}',
  'Create a custom subagent profile row in agentsam_subagent_profile for this user and workspace.',
  '{"type":"object","properties":{"display_name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"},"instructions_markdown":{"type":"string"},"allowed_tool_globs":{"type":"array","items":{"type":"string"}},"default_model_id":{"type":"string"},"sandbox_mode":{"type":"string","default":"workspace-write"},"access_mode":{"type":"string","enum":["read_only","read_write"],"default":"read_write"}},"required":["display_name"]}',
  'medium', 0, 0,
  1, 1, '["*"]',
  55, unixepoch()
);

UPDATE agentsam_tools
SET
  handler_type = 'agent',
  handler_key = 'agentsam_create_subagent',
  handler_config = '{"handler":"agentsam_create_subagent","auth_source":"workspace"}',
  description = 'Create a custom subagent profile row in agentsam_subagent_profile for this user and workspace.',
  is_active = 1,
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_create_subagent';

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, expose_on_connector, connector_priority, updated_at
) VALUES (
  'iam_mcp_inneranimalmedia',
  'agentsam_create_subagent',
  'write',
  55,
  '599: create subagent profile in agentsam_subagent_profile',
  1,
  1,
  55,
  unixepoch()
);
