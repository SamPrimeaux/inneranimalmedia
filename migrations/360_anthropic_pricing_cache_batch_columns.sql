-- 360: Anthropic extended pricing (D1 column budget: 1h cache write + JSON extras for batch/fast).
-- cache_write_rate_per_mtok = 5-minute cache WRITE (legacy name, documented alias).
-- pricing_extras_json: batch rates, fast_mode rates, explicit 5m write duplicate for readers.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/360_anthropic_pricing_cache_batch_columns.sql

ALTER TABLE agentsam_ai ADD COLUMN cache_write_1h_rate_per_mtok REAL;
ALTER TABLE agentsam_ai ADD COLUMN pricing_extras_json TEXT;

-- Haiku 4.5
UPDATE agentsam_ai SET
  input_rate_per_mtok = 1.0,
  output_rate_per_mtok = 5.0,
  cache_read_rate_per_mtok = 0.10,
  cache_write_rate_per_mtok = 1.25,
  cache_write_1h_rate_per_mtok = 2.00,
  pricing_extras_json = '{"cache_write_5m_rate_per_mtok":1.25,"cache_write_1h_rate_per_mtok":2.0,"batch_input_rate_per_mtok":0.5,"batch_output_rate_per_mtok":2.5,"supports_batch":0,"fast_mode_input_rate_per_mtok":null,"fast_mode_output_rate_per_mtok":null,"supports_fast_mode":0}',
  pricing_source = 'anthropic_public_2026',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_haiku_4_5', 'claude-haiku-4-5-20251001') AND mode = 'model';

-- Sonnet 4.6
UPDATE agentsam_ai SET
  input_rate_per_mtok = 3.0,
  output_rate_per_mtok = 15.0,
  cache_read_rate_per_mtok = 0.30,
  cache_write_rate_per_mtok = 3.75,
  cache_write_1h_rate_per_mtok = 6.00,
  pricing_extras_json = '{"cache_write_5m_rate_per_mtok":3.75,"cache_write_1h_rate_per_mtok":6.0,"batch_input_rate_per_mtok":1.5,"batch_output_rate_per_mtok":7.5,"supports_batch":0,"fast_mode_input_rate_per_mtok":null,"fast_mode_output_rate_per_mtok":null,"supports_fast_mode":0}',
  pricing_source = 'anthropic_public_2026',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_sonnet_4_6', 'claude-sonnet-4-6') AND mode = 'model';

-- Opus 4.7
UPDATE agentsam_ai SET
  input_rate_per_mtok = 5.0,
  output_rate_per_mtok = 25.0,
  cache_read_rate_per_mtok = 0.50,
  cache_write_rate_per_mtok = 6.25,
  cache_write_1h_rate_per_mtok = 10.00,
  pricing_extras_json = '{"cache_write_5m_rate_per_mtok":6.25,"cache_write_1h_rate_per_mtok":10.0,"batch_input_rate_per_mtok":2.5,"batch_output_rate_per_mtok":12.5,"supports_batch":0,"fast_mode_input_rate_per_mtok":30.0,"fast_mode_output_rate_per_mtok":150.0,"supports_fast_mode":0}',
  pricing_source = 'anthropic_public_2026',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_opus_4_7', 'claude-opus-4-7') AND mode = 'model';

UPDATE agentsam_model_catalog SET
  cost_notes = 'pricing_mtok_in=1;pricing_mtok_out=5;cache_read_mtok=0.10;cache_write_5m_mtok=1.25;cache_write_1h_mtok=2.00;batch_in_mtok=0.50;batch_out_mtok=2.50',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5';

UPDATE agentsam_model_catalog SET
  cost_notes = 'pricing_mtok_in=3;pricing_mtok_out=15;cache_read_mtok=0.30;cache_write_5m_mtok=3.75;cache_write_1h_mtok=6.00;batch_in_mtok=1.50;batch_out_mtok=7.50;long_context_1m=standard',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_sonnet_4_6';

UPDATE agentsam_model_catalog SET
  cost_notes = 'pricing_mtok_in=5;pricing_mtok_out=25;cache_read_mtok=0.50;cache_write_5m_mtok=6.25;cache_write_1h_mtok=10.00;batch_in_mtok=2.50;batch_out_mtok=12.50;fast_mode_in_mtok=30;fast_mode_out_mtok=150;long_context_1m=standard',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_opus_4_7';
