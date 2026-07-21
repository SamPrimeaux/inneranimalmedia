-- 951: Align Anthropic agentsam_model_pricing + catalog to anthropic.com/pricing (2026-07-20).
-- Sonnet 5 intro $2/$10 thru 2026-08-31; standard $3/$15 from 2026-09-01.
-- Fill Opus 4.8 cache/batch; add Fable 5 pricing row (missing).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/951_anthropic_sonnet5_fable5_pricing_align.sql

-- ── Sonnet 5 intro (now → 2026-09-01 exclusive end via effective_to) ──────────
INSERT INTO agentsam_model_pricing (
  id, provider, model_key, pricing_kind, currency,
  input_rate_per_mtok, output_rate_per_mtok,
  cache_read_rate_per_mtok, cache_write_5m_rate_per_mtok, cache_write_1h_rate_per_mtok,
  batch_input_rate_per_mtok, batch_output_rate_per_mtok,
  supports_prompt_cache, supports_batch, supports_fast_mode,
  effective_from, effective_to, is_active,
  source_url, source_label, notes, created_at, updated_at,
  tokenizer_multiplier_note
) VALUES (
  'anthropic:claude-sonnet-5:standard:intro',
  'anthropic', 'claude-sonnet-5', 'standard', 'USD',
  2.0, 10.0,
  0.20, 2.50, 4.0,
  1.0, 5.0,
  1, 1, 0,
  '2026-07-01 00:00:00', '2026-09-01 00:00:00', 1,
  'https://www.anthropic.com/pricing',
  'Anthropic Claude API pricing',
  'Sonnet 5 introductory $2/$10 per MTok through 2026-08-31. Cache 5m write=$2.50 read=$0.20; 1h write=$4; batch 50%. New tokenizer may bill up to ~35% more tokens vs Sonnet 4.6 on same text.',
  datetime('now'), datetime('now'),
  'Sonnet 5 tokenizer can produce up to ~35% more billable tokens vs Sonnet 4.6 on the same input — measure before assuming cost parity.'
)
ON CONFLICT(id) DO UPDATE SET
  input_rate_per_mtok = excluded.input_rate_per_mtok,
  output_rate_per_mtok = excluded.output_rate_per_mtok,
  cache_read_rate_per_mtok = excluded.cache_read_rate_per_mtok,
  cache_write_5m_rate_per_mtok = excluded.cache_write_5m_rate_per_mtok,
  cache_write_1h_rate_per_mtok = excluded.cache_write_1h_rate_per_mtok,
  batch_input_rate_per_mtok = excluded.batch_input_rate_per_mtok,
  batch_output_rate_per_mtok = excluded.batch_output_rate_per_mtok,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  is_active = 1,
  source_url = excluded.source_url,
  source_label = excluded.source_label,
  notes = excluded.notes,
  tokenizer_multiplier_note = excluded.tokenizer_multiplier_note,
  updated_at = datetime('now');

-- ── Sonnet 5 standard (Sep 1, 2026+) ─────────────────────────────────────────
INSERT INTO agentsam_model_pricing (
  id, provider, model_key, pricing_kind, currency,
  input_rate_per_mtok, output_rate_per_mtok,
  cache_read_rate_per_mtok, cache_write_5m_rate_per_mtok, cache_write_1h_rate_per_mtok,
  batch_input_rate_per_mtok, batch_output_rate_per_mtok,
  supports_prompt_cache, supports_batch, supports_fast_mode,
  effective_from, effective_to, is_active,
  source_url, source_label, notes, created_at, updated_at,
  tokenizer_multiplier_note
) VALUES (
  'anthropic:claude-sonnet-5:standard',
  'anthropic', 'claude-sonnet-5', 'standard', 'USD',
  3.0, 15.0,
  0.30, 3.75, 6.0,
  1.5, 7.5,
  1, 1, 0,
  '2026-09-01 00:00:00', NULL, 1,
  'https://www.anthropic.com/pricing',
  'Anthropic Claude API pricing',
  'Sonnet 5 standard $3/$15 per MTok from 2026-09-01. Cache/batch match Sonnet 4.6 multipliers. Tokenizer may bill up to ~35% more tokens vs 4.6.',
  datetime('now'), datetime('now'),
  'Sonnet 5 tokenizer can produce up to ~35% more billable tokens vs Sonnet 4.6 on the same input — measure before assuming cost parity.'
)
ON CONFLICT(id) DO UPDATE SET
  input_rate_per_mtok = excluded.input_rate_per_mtok,
  output_rate_per_mtok = excluded.output_rate_per_mtok,
  cache_read_rate_per_mtok = excluded.cache_read_rate_per_mtok,
  cache_write_5m_rate_per_mtok = excluded.cache_write_5m_rate_per_mtok,
  cache_write_1h_rate_per_mtok = excluded.cache_write_1h_rate_per_mtok,
  batch_input_rate_per_mtok = excluded.batch_input_rate_per_mtok,
  batch_output_rate_per_mtok = excluded.batch_output_rate_per_mtok,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  is_active = 1,
  source_url = excluded.source_url,
  source_label = excluded.source_label,
  notes = excluded.notes,
  tokenizer_multiplier_note = excluded.tokenizer_multiplier_note,
  updated_at = datetime('now');

-- ── Fable 5 ──────────────────────────────────────────────────────────────────
INSERT INTO agentsam_model_pricing (
  id, provider, model_key, pricing_kind, currency,
  input_rate_per_mtok, output_rate_per_mtok,
  cache_read_rate_per_mtok, cache_write_5m_rate_per_mtok, cache_write_1h_rate_per_mtok,
  batch_input_rate_per_mtok, batch_output_rate_per_mtok,
  supports_prompt_cache, supports_batch, supports_fast_mode,
  effective_from, effective_to, is_active,
  source_url, source_label, notes, created_at, updated_at
) VALUES (
  'anthropic:claude-fable-5:standard',
  'anthropic', 'claude-fable-5', 'standard', 'USD',
  10.0, 50.0,
  1.0, 12.50, 20.0,
  5.0, 25.0,
  1, 1, 0,
  '2026-07-01 00:00:00', NULL, 1,
  'https://www.anthropic.com/pricing',
  'Anthropic Claude API pricing',
  'Fable 5 $10/$50 per MTok. Cache write 5m=$12.50 read=$1; 1h write=$20; batch 50%.',
  datetime('now'), datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  input_rate_per_mtok = excluded.input_rate_per_mtok,
  output_rate_per_mtok = excluded.output_rate_per_mtok,
  cache_read_rate_per_mtok = excluded.cache_read_rate_per_mtok,
  cache_write_5m_rate_per_mtok = excluded.cache_write_5m_rate_per_mtok,
  cache_write_1h_rate_per_mtok = excluded.cache_write_1h_rate_per_mtok,
  batch_input_rate_per_mtok = excluded.batch_input_rate_per_mtok,
  batch_output_rate_per_mtok = excluded.batch_output_rate_per_mtok,
  is_active = 1,
  source_url = excluded.source_url,
  source_label = excluded.source_label,
  notes = excluded.notes,
  updated_at = datetime('now');

-- ── Opus 4.8 — fill cache/batch/fast (base $5/$25 already correct) ───────────
UPDATE agentsam_model_pricing
SET
  input_rate_per_mtok = 5.0,
  output_rate_per_mtok = 25.0,
  cache_read_rate_per_mtok = 0.50,
  cache_write_5m_rate_per_mtok = 6.25,
  cache_write_1h_rate_per_mtok = 10.0,
  batch_input_rate_per_mtok = 2.5,
  batch_output_rate_per_mtok = 12.5,
  fast_mode_input_rate_per_mtok = 10.0,
  fast_mode_output_rate_per_mtok = 50.0,
  supports_prompt_cache = 1,
  supports_batch = 1,
  supports_fast_mode = 1,
  source_url = 'https://www.anthropic.com/pricing',
  source_label = 'Anthropic Claude API pricing',
  notes = 'Opus 4.8 $5/$25 per MTok. Cache 5m write=$6.25 read=$0.50; 1h write=$10; batch 50%; fast mode 2x ($10/$50).',
  updated_at = datetime('now')
WHERE provider = 'anthropic' AND model_key = 'claude-opus-4-8';

-- ── Haiku / Sonnet 4.6 — refresh source labels (rates already correct) ───────
UPDATE agentsam_model_pricing
SET
  source_url = 'https://www.anthropic.com/pricing',
  source_label = 'Anthropic Claude API pricing',
  updated_at = datetime('now')
WHERE provider = 'anthropic'
  AND model_key IN ('claude-haiku-4-5-20251001', 'claude-sonnet-4-6');

-- ── Catalog cost_per_1k* mirrors current intro / list prices ─────────────────
UPDATE agentsam_model_catalog
SET
  cost_per_1k_in = 0.002,
  cost_per_1k_out = 0.010,
  cost_per_1k_cached_in = 0.0002,
  cost_notes = 'intro $2/$10 per MTok thru 2026-08-31; then $3/$15. New tokenizer may bill ~35% more tokens vs Sonnet 4.6.',
  updated_at = unixepoch()
WHERE model_key = 'claude-sonnet-5';

UPDATE agentsam_model_catalog
SET
  cost_per_1k_in = 0.010,
  cost_per_1k_out = 0.050,
  cost_per_1k_cached_in = 0.001,
  cost_notes = '$10/$50 per MTok (anthropic.com/pricing 2026-07).',
  updated_at = unixepoch()
WHERE model_key = 'claude-fable-5';

UPDATE agentsam_model_catalog
SET
  cost_per_1k_in = 0.005,
  cost_per_1k_out = 0.025,
  cost_per_1k_cached_in = 0.0005,
  cost_notes = '$5/$25 per MTok; cache read $0.50/MTok; fast mode 2x.',
  updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-8';
