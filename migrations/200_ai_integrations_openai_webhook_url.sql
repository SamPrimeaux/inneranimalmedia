-- 200: ai_integrations — OpenAI webhooks public URL (dashboard registration).
-- Row: id 26, integration_key OPENAI_WEBHOOK_SECRET, name "OpenAI Webhooks"
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/200_ai_integrations_openai_webhook_url.sql

UPDATE ai_integrations
SET
  metadata = '{"endpoint":"https://inneranimalmedia.com/api/webhooks/openai","path":"/api/webhooks/openai","legacy_path":"/api/hooks/openai","events":17,"signing_header":"webhook-signature","algo":"hmac-sha256","dashboard":"https://platform.openai.com/settings/webhooks","configured":"2026-03-31","note":"OPENAI_WEBHOOK_SECRET in CF worker secrets; URL set for OpenAI dashboard"}',
  configured_at = datetime('now')
WHERE id = 26 AND integration_key = 'OPENAI_WEBHOOK_SECRET';
