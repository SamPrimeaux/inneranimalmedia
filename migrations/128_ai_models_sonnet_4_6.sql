-- 128: Add Claude Sonnet 4.6 to ai_models (official pricing $3/$15 per M tok)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/128_ai_models_sonnet_4_6.sql

INSERT OR REPLACE INTO ai_models (
  id,
  model_key,
  display_name,
  provider,
  input_rate_per_mtok,
  output_rate_per_mtok,
  context_max_tokens,
  show_in_picker,
  is_active
) VALUES (
  'claude-sonnet-4-6',
  'claude-sonnet-4-6',
  'Claude Sonnet 4.6',
  'anthropic',
  3.00,
  15.00,
  200000,
  1,
  1
);
