-- 433: ChatGPT OAuth allowlist + handler config for agentsam_send_email (outbox queue).

UPDATE agentsam_tools
SET
  handler_type = 'mcp',
  handler_config = '{"operation":"send_email","auth_source":"platform","binding":"local"}',
  description = 'Queue transactional email via notification_outbox (processed by IAM Resend worker).',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_send_email';

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, updated_at
) VALUES (
  'iam_mcp_inneranimalmedia',
  'agentsam_send_email',
  'write',
  108,
  'Queue email via notification_outbox',
  1,
  unixepoch()
);
