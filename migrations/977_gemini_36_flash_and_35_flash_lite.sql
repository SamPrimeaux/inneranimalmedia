-- 977: Gemini 3.6 Flash + Gemini 3.5 Flash-Lite GA (2026-07-21).
-- Catalog + picker + primary-workspace Thompson arms.
-- Pricing (paid Standard, per 1M tokens → catalog cost_per_1k = /1000):
--   gemini-3.6-flash:      $1.50 in / $7.50 out
--   gemini-3.5-flash-lite: $0.30 in / $2.50 out
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/977_gemini_36_flash_and_35_flash_lite.sql

-- ── 1) Catalog rows ──────────────────────────────────────────────────────────
INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier, google_model_id, api_platform,
  routing_lane, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, supports_tools, supports_vision,
  supports_streaming, supports_json_mode, supports_reasoning, supports_code_execution,
  is_active, updated_at
) VALUES
(
  'mdl_gemini36_flash',
  'gemini-3.6-flash',
  'Gemini 3.6 Flash',
  'google', 'flash', 'gemini-3.6-flash', 'gemini_api', 'agentic',
  1048576, 65536, 0.0015, 0.0075, 1, 1, 1, 1, 1, 1, 1, unixepoch()
),
(
  'mdl_gemini35_flash_lite',
  'gemini-3.5-flash-lite',
  'Gemini 3.5 Flash-Lite',
  'google', 'micro', 'gemini-3.5-flash-lite', 'gemini_api', 'cheap',
  1048576, 65536, 0.0003, 0.0025, 1, 1, 1, 1, 1, 1, 1, unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  google_model_id = excluded.google_model_id,
  api_platform = excluded.api_platform,
  routing_lane = excluded.routing_lane,
  context_window = excluded.context_window,
  max_output_tokens = excluded.max_output_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  supports_tools = excluded.supports_tools,
  supports_vision = excluded.supports_vision,
  supports_streaming = excluded.supports_streaming,
  supports_json_mode = excluded.supports_json_mode,
  supports_reasoning = excluded.supports_reasoning,
  supports_code_execution = excluded.supports_code_execution,
  is_active = 1,
  is_degraded = 0,
  degraded_reason = NULL,
  updated_at = unixepoch();

-- Keep 3.5 Flash selectable for pinned / manual use, but mark superseded for Auto.
UPDATE agentsam_model_catalog
SET degraded_reason = 'superseded_by_gemini-3.6-flash_ga_2026-07-21',
    cost_per_1k_in = 0.0015,
    cost_per_1k_out = 0.009,
    updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash';

-- ── 2) agentsam_ai picker / BYOK dispatch rows ───────────────────────────────
INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT
  'ai_gemini36_flash', '', 'Gemini 3.6 Flash', 'gemini_flash',
  'GA Flash — agentic speed/cost successor to Gemini 3.5 Flash.',
  'active', 'model',
  'gemini-3.6-flash', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY',
  1, 1, 0, 345, 'Google / Gemini', 1, 1, 1.5, 7.5, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3.6-flash' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT
  'ai_gemini35_flash_lite', '', 'Gemini 3.5 Flash-Lite', 'gemini_lite',
  'GA Flash-Lite — high-throughput cheap lane (classifiers, extraction, lite agents).',
  'active', 'model',
  'gemini-3.5-flash-lite', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY',
  1, 1, 0, 335, 'Google / Gemini', 1, 1, 0.3, 2.5, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3.5-flash-lite' AND mode = 'model');

UPDATE agentsam_ai
SET
  name = 'Gemini 3.6 Flash',
  api_platform = 'gemini_api',
  secret_key_name = 'GOOGLE_AI_API_KEY',
  status = 'active',
  show_in_picker = 1,
  picker_eligible = 1,
  picker_group = 'Google / Gemini',
  sort_order = 345,
  supports_tools = 1,
  input_rate_per_mtok = 1.5,
  output_rate_per_mtok = 7.5,
  updated_at = unixepoch()
WHERE model_key = 'gemini-3.6-flash' AND mode = 'model';

UPDATE agentsam_ai
SET
  name = 'Gemini 3.5 Flash-Lite',
  api_platform = 'gemini_api',
  secret_key_name = 'GOOGLE_AI_API_KEY',
  status = 'active',
  show_in_picker = 1,
  picker_eligible = 1,
  picker_group = 'Google / Gemini',
  sort_order = 335,
  supports_tools = 1,
  input_rate_per_mtok = 0.3,
  output_rate_per_mtok = 2.5,
  updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash-lite' AND mode = 'model';

-- Demote 3.5 Flash in picker (still selectable); keep 3.1 Flash-Lite as legacy cheap option.
UPDATE agentsam_ai
SET
  sort_order = 355,
  description = 'Superseded by Gemini 3.6 Flash (GA 2026-07-21). Kept for pinned runs.',
  updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash' AND mode = 'model';

UPDATE agentsam_ai
SET
  sort_order = 365,
  updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-flash-lite' AND mode = 'model';

-- ── 3) Routing arms — move Auto/agent flash + lite lanes to GA models ────────
UPDATE agentsam_routing_arms
SET model_key = 'gemini-3.6-flash', is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash'
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_routing_arms
SET model_key = 'gemini-3.5-flash-lite', updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-flash-lite'
  AND COALESCE(is_active, 1) = 1;

-- Unpause only the previously live cheap lanes (leave intentionally paused arms paused).
UPDATE agentsam_routing_arms
SET is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash-lite'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(is_paused, 0) = 1
  AND id IN (
    'ra_lite_chat_auto_ws',
    'ra_lite_cheap_summary_ws',
    'ra_lite_router_micro_ws',
    'ra_lite_summary_auto_ws'
  );

-- Unpause any primary-workspace arms already pointing at the new keys.
UPDATE agentsam_routing_arms
SET is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key IN ('gemini-3.6-flash', 'gemini-3.5-flash-lite')
  AND COALESCE(is_active, 1) = 1;
