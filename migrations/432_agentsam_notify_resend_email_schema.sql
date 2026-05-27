-- 432: agentsam_notify — document dashboard + Resend email channel fields.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/432_agentsam_notify_resend_email_schema.sql

UPDATE agentsam_tools
SET
  description = 'Send a dashboard notification (D1) or email via Resend (channel=email). Requires message.',
  input_schema = '{"type":"object","properties":{"channel":{"type":"string","enum":["dashboard","email"],"description":"dashboard=D1 notification, email=send via Resend"},"message":{"type":"string","description":"Notification body"},"subject":{"type":"string","description":"Email subject (email channel only)"},"to":{"type":"string","description":"Recipient email (email channel only, defaults to RESEND_TO)"},"html":{"type":"string","description":"Optional HTML body (email channel only)"},"title":{"type":"string"},"severity":{"type":"string","enum":["info","warning","error"]},"action":{"type":"string","description":"action=email alias for Resend"}},"required":["message"],"additionalProperties":false}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_notify';
