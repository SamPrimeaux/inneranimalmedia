-- 787: Unified Gmail OAuth spine — canonical google_gmail provider, au_* token keys, agent tools.

-- Normalize legacy provider alias (idempotent)
UPDATE user_oauth_tokens
SET provider = 'google_gmail'
WHERE lower(provider) = 'gmail';

-- Drop email-keyed rows when canonical au_* row already exists for same account
DELETE FROM user_oauth_tokens
WHERE rowid IN (
  SELECT e.rowid
  FROM user_oauth_tokens e
  INNER JOIN auth_users au ON lower(trim(au.email)) = lower(trim(e.user_id))
  INNER JOIN user_oauth_tokens c
    ON c.user_id = au.id
   AND lower(c.provider) = 'google_gmail'
   AND lower(c.account_identifier) = lower(e.account_identifier)
  WHERE e.user_id NOT LIKE 'au_%'
    AND lower(e.provider) = 'google_gmail'
);

-- Migrate remaining email-keyed rows to canonical au_*
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
UPDATE agentsam_tools
SET
  tool_name = 'gmail_list_inbox',
  display_name = 'Gmail List Inbox',
  tool_category = 'gmail',
  description = 'List recent inbox messages for the signed-in user Gmail account(s). Requires google_gmail OAuth.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"account":{"type":"string","description":"Google account email (optional when one account connected)"},"max_results":{"type":"integer","minimum":1,"maximum":50}}}',
  handler_type = 'agent',
  handler_config = '{"handler":"gmail_list_inbox","module":"tools/builtin/gmail.js"}',
  risk_level = 'low',
  requires_approval = 0,
  workspace_scope = '["*"]',
  modes_json = '["ask","plan","debug","agent","multitask"]',
  oauth_visible = 0,
  is_active = 1,
  is_global = 1,
  updated_at = unixepoch()
WHERE tool_key = 'gmail_list_inbox';

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'gmail_list_inbox', 'gmail_list_inbox', 'Gmail List Inbox', 'gmail',
  'List recent inbox messages for the signed-in user Gmail account(s). Requires google_gmail OAuth.',
  '{"type":"object","additionalProperties":false,"properties":{"account":{"type":"string","description":"Google account email (optional when one account connected)"},"max_results":{"type":"integer","minimum":1,"maximum":50}}}',
  'agent', '{"handler":"gmail_list_inbox","module":"tools/builtin/gmail.js"}',
  'low', 0, '["*"]', '["ask","plan","debug","agent","multitask"]', 0, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'gmail_list_inbox');

UPDATE agentsam_tools
SET
  tool_name = 'gmail_modify_message',
  display_name = 'Gmail Modify Message',
  tool_category = 'gmail',
  description = 'Modify Gmail labels (read/star/archive/trash) for a message id on the user connected account.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"message_id":{"type":"string"},"account":{"type":"string"},"is_read":{"type":"boolean"},"is_starred":{"type":"boolean"},"is_archived":{"type":"boolean"},"trash":{"type":"boolean"},"add_label_ids":{"type":"array","items":{"type":"string"}},"remove_label_ids":{"type":"array","items":{"type":"string"}}},"required":["message_id"]}',
  handler_type = 'agent',
  handler_config = '{"handler":"gmail_modify_message","module":"tools/builtin/gmail.js"}',
  risk_level = 'medium',
  requires_approval = 0,
  workspace_scope = '["*"]',
  modes_json = '["agent","multitask"]',
  oauth_visible = 0,
  is_active = 1,
  is_global = 1,
  updated_at = unixepoch()
WHERE tool_key = 'gmail_modify_message';

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'gmail_modify_message', 'gmail_modify_message', 'Gmail Modify Message', 'gmail',
  'Modify Gmail labels (read/star/archive/trash) for a message id on the user connected account.',
  '{"type":"object","additionalProperties":false,"properties":{"message_id":{"type":"string"},"account":{"type":"string"},"is_read":{"type":"boolean"},"is_starred":{"type":"boolean"},"is_archived":{"type":"boolean"},"trash":{"type":"boolean"},"add_label_ids":{"type":"array","items":{"type":"string"}},"remove_label_ids":{"type":"array","items":{"type":"string"}}},"required":["message_id"]}',
  'agent', '{"handler":"gmail_modify_message","module":"tools/builtin/gmail.js"}',
  'medium', 0, '["*"]', '["agent","multitask"]', 0, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'gmail_modify_message');

UPDATE agentsam_tools
SET
  tool_name = 'gmail_send',
  display_name = 'Gmail Send',
  tool_category = 'gmail',
  description = 'Send email via the user connected Gmail account (google_gmail OAuth).',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"html":{"type":"string"},"account":{"type":"string"}},"required":["to","subject"]}',
  handler_type = 'agent',
  handler_config = '{"handler":"gmail_send","module":"tools/builtin/gmail.js"}',
  risk_level = 'high',
  requires_approval = 1,
  workspace_scope = '["*"]',
  modes_json = '["agent","multitask"]',
  oauth_visible = 0,
  is_active = 1,
  is_global = 1,
  updated_at = unixepoch()
WHERE tool_key = 'gmail_send';

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, description, input_schema,
   handler_type, handler_config, risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global, updated_at)
SELECT
  'gmail_send', 'gmail_send', 'Gmail Send', 'gmail',
  'Send email via the user connected Gmail account (google_gmail OAuth).',
  '{"type":"object","additionalProperties":false,"properties":{"to":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"html":{"type":"string"},"account":{"type":"string"}},"required":["to","subject"]}',
  'agent', '{"handler":"gmail_send","module":"tools/builtin/gmail.js"}',
  'high', 1, '["*"]', '["agent","multitask"]', 0, 1, 1, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_tools WHERE tool_key = 'gmail_send');
