-- 787: Unified Gmail OAuth spine — canonical google_gmail provider, au_* token keys, agent tools.

-- Normalize legacy provider alias
UPDATE user_oauth_tokens
SET provider = 'google_gmail'
WHERE lower(provider) = 'gmail';

-- Migrate email-keyed user_id rows to canonical au_* when auth_users match exists
UPDATE user_oauth_tokens
SET user_id = (
  SELECT au.id
  FROM auth_users au
  WHERE lower(trim(au.email)) = lower(trim(user_oauth_tokens.user_id))
  LIMIT 1
)
WHERE lower(provider) = 'google_gmail'
  AND user_id NOT LIKE 'au_%'
  AND EXISTS (
    SELECT 1
    FROM auth_users au
    WHERE lower(trim(au.email)) = lower(trim(user_oauth_tokens.user_id))
  );

-- User-scoped Gmail tools for in-app Agent Sam (REST, not Gmail MCP)
INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval,
   workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES
(
  'gmail_list_inbox', 'gmail_list_inbox',
  'Gmail List Inbox', 'gmail',
  'List recent inbox messages for the signed-in user Gmail account(s). Requires google_gmail OAuth.',
  '{"type":"object","additionalProperties":false,"properties":{"account":{"type":"string","description":"Google account email (optional when one account connected)"},"max_results":{"type":"integer","minimum":1,"maximum":50}}}',
  'agent',
  '{"handler":"gmail_list_inbox","module":"tools/builtin/gmail.js"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 0, 1, 1, unixepoch()
),
(
  'gmail_modify_message', 'gmail_modify_message',
  'Gmail Modify Message', 'gmail',
  'Modify Gmail labels (read/star/archive/trash) for a message id on the user connected account.',
  '{"type":"object","additionalProperties":false,"properties":{"message_id":{"type":"string"},"account":{"type":"string"},"is_read":{"type":"boolean"},"is_starred":{"type":"boolean"},"is_archived":{"type":"boolean"},"trash":{"type":"boolean"},"add_label_ids":{"type":"array","items":{"type":"string"}},"remove_label_ids":{"type":"array","items":{"type":"string"}}},"required":["message_id"]}',
  'agent',
  '{"handler":"gmail_modify_message","module":"tools/builtin/gmail.js"}',
  'medium', 0, '["*"]', '["agent","multitask"]', 0, 1, 1, unixepoch()
),
(
  'gmail_send', 'gmail_send',
  'Gmail Send', 'gmail',
  'Send email via the user connected Gmail account (google_gmail OAuth).',
  '{"type":"object","additionalProperties":false,"properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"html":{"type":"string"},"account":{"type":"string"}},"required":["to","subject"]}',
  'agent',
  '{"handler":"gmail_send","module":"tools/builtin/gmail.js"}',
  'high', 1, '["*"]', '["agent","multitask"]', 0, 1, 1, unixepoch()
)
ON CONFLICT(tool_key) DO UPDATE SET
  handler_type = excluded.handler_type,
  handler_config = excluded.handler_config,
  description = excluded.description,
  input_schema = excluded.input_schema,
  tool_category = excluded.tool_category,
  display_name = excluded.display_name,
  is_active = 1,
  updated_at = unixepoch();
