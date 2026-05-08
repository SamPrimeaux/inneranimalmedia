-- 304: Enable Anthropic compaction beta (compact-2026-01-12) for catalog rows that support it via features_json.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/304_agentsam_ai_compaction_feature.sql

UPDATE agentsam_ai
SET
  features_json = json_set(COALESCE(features_json, '{}'), '$.compaction', json('true')),
  updated_at = unixepoch()
WHERE model_key IN ('claude-sonnet-4-6', 'claude-opus-4-7', 'claude-opus-4-6')
  AND status = 'active';
