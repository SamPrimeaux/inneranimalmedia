-- 375: P0 webhook registry alignment (OpenAI canonical URL, Anthropic signature header).
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/375_webhook_registry_events_p0.sql

UPDATE agentsam_webhooks
SET
  endpoint_url = 'https://inneranimalmedia.com/api/webhooks/openai',
  signature_header = 'x-openai-signature',
  metadata_json = json_set(
    COALESCE(NULLIF(trim(metadata_json), ''), '{}'),
    '$.legacy_path',
    '/api/hooks/openai',
    '$.canonical_path',
    '/api/webhooks/openai'
  ),
  updated_at = datetime('now')
WHERE provider = 'openai'
  AND slug = 'openai-main';

UPDATE agentsam_webhooks
SET
  signature_header = 'X-Webhook-Signature',
  updated_at = datetime('now')
WHERE provider = 'anthropic';

UPDATE ai_integrations
SET
  metadata = json_set(
    COALESCE(NULLIF(trim(metadata), ''), '{}'),
    '$.endpoint',
    'https://inneranimalmedia.com/api/webhooks/openai',
    '$.path',
    '/api/webhooks/openai',
    '$.legacy_path',
    '/api/hooks/openai'
  ),
  configured_at = datetime('now')
WHERE integration_key = 'OPENAI_WEBHOOK_SECRET'
   OR id = 26;
