-- Register bridge_key_auth_test for agentsam tool registry (run against prod D1 when deploying).
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_name, display_name, tool_category, handler_type,
  description, handler_config, intent_tags, modes_json,
  risk_level, requires_approval, is_active
) VALUES (
  'ast_bridge_key_auth_test',
  'bridge_key_auth_test',
  'Bridge Key Auth Test',
  'terminal',
  'http',
  'Probes /api/terminal/session/register with X-Bridge-Key to verify bridge auth is live',
  json_object(
    'url_env', 'TERMINAL_WS_URL',
    'path', '/api/terminal/session/register',
    'method', 'POST',
    'auth_header', 'X-Bridge-Key',
    'auth_env', 'AGENTSAM_BRIDGE_KEY'
  ),
  '["bridge","auth","health","terminal"]',
  '["agent","debug"]',
  'low',
  0,
  1
);
