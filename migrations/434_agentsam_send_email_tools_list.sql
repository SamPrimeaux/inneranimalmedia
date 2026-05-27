-- 434: agentsam_send_email — direct Resend + discoverable description for tools/list / search.

UPDATE agentsam_tools
SET
  description = 'Send email immediately via Resend (MCP). Resolves recipient from to, notification_email, or account email.',
  input_schema = '{"type":"object","properties":{"subject":{"type":"string","description":"Email subject line"},"message":{"type":"string","description":"Plain text email body"},"to":{"type":"string","description":"Recipient email (optional)"},"html":{"type":"string","description":"Optional HTML body"},"priority":{"type":"string","enum":["low","normal","high"]}},"required":["subject","message"],"additionalProperties":false}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_send_email';
