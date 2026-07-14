-- 906: Wire MCP OAuth auth_source for ticket tools (platform D1) + gmail agent stubs.
-- Fixes agentsam_ticket_* rejection: handler_config lacked auth_source/operation.
-- Ticket tools execute against platform env.DB (whole-account operator lane), not customer workspace D1.

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.operation', 'ticket.list',
      '$.lane', 'platform_d1'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_ticket_list';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.operation', 'ticket.get',
      '$.lane', 'platform_d1'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_ticket_get';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.operation', 'ticket.create',
      '$.lane', 'platform_d1'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_ticket_create';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.operation', 'ticket.set_status',
      '$.lane', 'platform_d1'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_ticket_set_status';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'platform',
      '$.operation', 'ticket.add_note',
      '$.lane', 'platform_d1'
    ),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_ticket_add_note';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'user_oauth_tokens',
      '$.provider', 'google_gmail',
      '$.operation', COALESCE(json_extract(handler_config, '$.operation'), 'gmail.list_inbox')
    ),
    updated_at = datetime('now')
WHERE tool_key = 'gmail_list_inbox';

UPDATE agentsam_tools
SET handler_config = json_set(
      COALESCE(handler_config, '{}'),
      '$.auth_source', 'user_oauth_tokens',
      '$.provider', 'google_gmail',
      '$.operation', COALESCE(json_extract(handler_config, '$.operation'), 'gmail.get_message')
    ),
    updated_at = datetime('now')
WHERE tool_key = 'gmail_get_message';

-- Claude / ChatGPT OAuth connector must list ticket tools (oauth_visible alone is not enough).
INSERT OR REPLACE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, is_active, notes,
  created_at, updated_at, expose_on_connector, connector_priority
) VALUES
  ('iam_mcp_inneranimalmedia', 'agentsam_ticket_list', 'read', 510, 1,
   'Platform agentsam_tickets list (platform D1)', unixepoch(), unixepoch(), 1, 110),
  ('iam_mcp_inneranimalmedia', 'agentsam_ticket_get', 'read', 511, 1,
   'Platform agentsam_tickets get (platform D1)', unixepoch(), unixepoch(), 1, 111),
  ('iam_mcp_inneranimalmedia', 'agentsam_ticket_create', 'write', 512, 1,
   'Platform agentsam_tickets create (platform D1)', unixepoch(), unixepoch(), 1, 112),
  ('iam_mcp_inneranimalmedia', 'agentsam_ticket_set_status', 'write', 513, 1,
   'Platform agentsam_tickets status (platform D1)', unixepoch(), unixepoch(), 1, 113),
  ('iam_mcp_inneranimalmedia', 'agentsam_ticket_add_note', 'write', 514, 1,
   'Platform agentsam_tickets note (platform D1)', unixepoch(), unixepoch(), 1, 114);
