-- 978: Seed agentsam_model_pricing for Gemini 3.6 Flash + 3.5 Flash-Lite.
-- 977 catalogued/picker-wired them; usage cost lookup reads agentsam_model_pricing first
-- and was warning `no rates for model` → cost_usd=0 on chat turns.
-- Rates (Google AI paid Standard, USD per 1M tokens, 2026-07-21):
--   gemini-3.6-flash:      $1.50 in / $7.50 out
--   gemini-3.5-flash-lite: $0.30 in / $2.50 out
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/978_gemini_36_35_flash_lite_model_pricing.sql

INSERT INTO agentsam_model_pricing (
  id, provider, model_key, pricing_kind, currency,
  input_rate_per_mtok, output_rate_per_mtok,
  supports_prompt_cache, supports_batch, supports_fast_mode,
  effective_from, effective_to, is_active,
  source_url, source_label, notes, created_at, updated_at
) VALUES
(
  'google:gemini-3.6-flash:standard',
  'google', 'gemini-3.6-flash', 'standard', 'USD',
  1.5, 7.5,
  0, 0, 0,
  '2026-07-21 00:00:00', NULL, 1,
  'https://ai.google.dev/gemini-api/docs/pricing',
  'Gemini Developer API pricing',
  'GA 3.6 Flash workhorse — agentic coding / knowledge work.',
  datetime('now'), datetime('now')
),
(
  'google:gemini-3.5-flash-lite:standard',
  'google', 'gemini-3.5-flash-lite', 'standard', 'USD',
  0.3, 2.5,
  0, 0, 0,
  '2026-07-21 00:00:00', NULL, 1,
  'https://ai.google.dev/gemini-api/docs/pricing',
  'Gemini Developer API pricing',
  'GA 3.5 Flash-Lite — high-throughput cheap lane.',
  datetime('now'), datetime('now')
)
ON CONFLICT(id) DO UPDATE SET
  input_rate_per_mtok = excluded.input_rate_per_mtok,
  output_rate_per_mtok = excluded.output_rate_per_mtok,
  is_active = 1,
  effective_from = excluded.effective_from,
  source_url = excluded.source_url,
  source_label = excluded.source_label,
  notes = excluded.notes,
  updated_at = datetime('now');
