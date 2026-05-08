-- 306: Deprecate legacy dated Haiku 3.5 catalog row; canonical low-latency Anthropic is claude-haiku-4-5-20251001.
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/306_deprecate_legacy_haiku_3_5_catalog.sql

UPDATE agentsam_ai
SET
  status = 'deprecated',
  show_in_picker = 0,
  updated_at = unixepoch()
WHERE provider = 'anthropic'
  AND model_key = 'claude-3-5-haiku-20241022';
