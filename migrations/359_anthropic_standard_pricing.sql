-- 359: Anthropic standard + prompt-cache-read pricing (USD per MTok in agentsam_ai; per-1k in catalog).
-- Standard: Haiku $1/$5 | Sonnet $3/$15 | Opus $5/$25
-- Cache read hits: Haiku $0.10 | Sonnet $0.30 | Opus $0.50
-- Cache write 5m: 1.25× input | 1h: 2× input — see migration 360 for explicit columns
-- Notes: batch_api=0.5× both sides; fast_mode=6× Opus 4.6/4.7 only; Sonnet/Opus 4.6+ 1M ctx at standard rates
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/359_anthropic_standard_pricing.sql

-- Haiku 4.5
UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.001,
  cost_per_1k_out = 0.005,
  cost_notes = COALESCE(cost_notes, '') || ';pricing_mtok_in=1;pricing_mtok_out=5;cache_read_mtok=0.10;cache_write_mtok=1.25;batch_discount=0.5',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5';

UPDATE agentsam_ai SET
  input_rate_per_mtok = 1.0,
  output_rate_per_mtok = 5.0,
  cache_read_rate_per_mtok = 0.10,
  cache_write_rate_per_mtok = 1.25,
  pricing_source = 'anthropic_public_2026',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_haiku_4_5', 'claude-haiku-4-5-20251001') AND mode = 'model';

-- Sonnet 4.6 (1M context at standard — already in 354)
UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.003,
  cost_per_1k_out = 0.015,
  cost_notes = COALESCE(cost_notes, '') || ';pricing_mtok_in=3;pricing_mtok_out=15;cache_read_mtok=0.30;cache_write_mtok=3.75;batch_discount=0.5;long_context_1m=standard',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_sonnet_4_6';

UPDATE agentsam_ai SET
  input_rate_per_mtok = 3.0,
  output_rate_per_mtok = 15.0,
  cache_read_rate_per_mtok = 0.30,
  cache_write_rate_per_mtok = 3.75,
  pricing_source = 'anthropic_public_2026',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_sonnet_4_6', 'claude-sonnet-4-6') AND mode = 'model';

-- Opus 4.7 (1M context at standard)
UPDATE agentsam_model_catalog SET
  cost_per_1k_in = 0.005,
  cost_per_1k_out = 0.025,
  context_window = 1000000,
  cost_notes = COALESCE(cost_notes, '') || ';pricing_mtok_in=5;pricing_mtok_out=25;cache_read_mtok=0.50;cache_write_mtok=6.25;batch_discount=0.5;fast_mode_6x=30/150;long_context_1m=standard',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_opus_4_7';

UPDATE agentsam_ai SET
  input_rate_per_mtok = 5.0,
  output_rate_per_mtok = 25.0,
  cache_read_rate_per_mtok = 0.50,
  cache_write_rate_per_mtok = 6.25,
  supports_fast_mode = 0,
  pricing_source = 'anthropic_public_2026',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_opus_4_7', 'claude-opus-4-7') AND mode = 'model';
