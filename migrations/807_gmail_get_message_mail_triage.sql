-- 807: gmail_get_message tool + mail_triage allowlist (full body before triage conclusions).

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'gmail_get_message', 'gmail_get_message', 'Gmail Get Message', 'gmail',
  'Fetch a single Gmail message by id with full body text (user OAuth). Use after gmail_list_inbox when triaging — distinguishes setup-in-progress vs confirmed.',
  '{"type":"object","additionalProperties":false,"properties":{"message_id":{"type":"string","description":"Gmail message id from gmail_list_inbox"},"account":{"type":"string","description":"Optional connected account email"}},"required":["message_id"]}',
  'agent', '{"handler":"gmail_get_message","module":"tools/builtin/gmail.js"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 0, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'gmail_get_message');

UPDATE agentsam_tools
SET
  tool_name = 'gmail_get_message',
  display_name = 'Gmail Get Message',
  tool_category = 'gmail',
  description = 'Fetch a single Gmail message by id with full body text (user OAuth). Use after gmail_list_inbox when triaging — distinguishes setup-in-progress vs confirmed.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"message_id":{"type":"string","description":"Gmail message id from gmail_list_inbox"},"account":{"type":"string","description":"Optional connected account email"}},"required":["message_id"]}',
  handler_type = 'agent',
  handler_config = '{"handler":"gmail_get_message","module":"tools/builtin/gmail.js"}',
  risk_level = 'low',
  requires_approval = 0,
  modes_json = '["ask","plan","debug","agent","multitask"]',
  is_active = 1,
  is_global = 1,
  updated_at = unixepoch()
WHERE tool_key = 'gmail_get_message';

UPDATE agentsam_subagent_profile
SET
  instructions_markdown = 'You are Agent Sam mail triage. Live ## Mail context may list inbox metadata only. Before classifying Stripe/Google/security items: call gmail_list_inbox then gmail_get_message on each candidate id (or agentsam_gmail_mcp_get_thread for threads). Never guess from subject alone. Summarize from tool bodies; group related Stripe setup emails as one flow. No emojis.',
  updated_at = datetime('now')
WHERE slug = 'mail_triage' AND is_active = 1;

UPDATE agentsam_prompt_routes
SET
  tool_keys = '["gmail_list_inbox","gmail_get_message","gmail_modify_message","gmail_send","agentsam_gmail_mcp_search_threads","agentsam_gmail_mcp_get_thread"]',
  max_tools = 8,
  updated_at = unixepoch()
WHERE route_key = 'mail_triage' AND tenant_id IS NULL;
