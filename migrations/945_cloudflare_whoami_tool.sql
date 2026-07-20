-- 945: cloudflare_whoami — redacted CF credential diagnostics for MCP operators.
INSERT INTO agentsam_tools (
  tool_key, tool_name, display_name, tool_category, description, input_schema,
  handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
  oauth_visible, is_active, is_global, domain, capability_tier, updated_at
)
SELECT
  'cloudflare_whoami', 'cloudflare_whoami', 'Cloudflare Whoami', 'cloudflare',
  'Redacted Cloudflare credential diagnostics for the authenticated MCP actor. Returns credential_source, account ids/names, token verify status — never secrets.',
  '{"type":"object","additionalProperties":false,"properties":{}}',
  'cf',
  '{"operation":"cloudflare.whoami","resource":"cloudflare","auth_source":"platform"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, 'cloudflare', 'common', unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'cloudflare_whoami');

INSERT OR REPLACE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, is_active, notes,
  created_at, updated_at, expose_on_connector, connector_priority
) VALUES (
  'iam_mcp_inneranimalmedia', 'cloudflare_whoami', 'read', 15, 1,
  'Operator CF credential diagnostics (no secrets)',
  unixepoch(), unixepoch(), 1, 15
);
