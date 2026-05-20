-- 356: Enable Anthropic automatic prompt caching for team catalog models.
-- Worker sends top-level cache_control: { type: ephemeral } when supports_cache / prompt_caching is on
-- or when assembled system prompt exceeds ~8k chars (see resolveAnthropicAutomaticCacheControl).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/356_anthropic_prompt_caching.sql

UPDATE agentsam_ai SET
  supports_cache = 1,
  features_json = json_set(COALESCE(features_json, '{}'), '$.prompt_caching', json('true')),
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_haiku_4_5', 'anthropic_sonnet_4_6', 'anthropic_opus_4_7');
