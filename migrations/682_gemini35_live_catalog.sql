-- 682: Gemini 3.5 + 3.x picker/catalog live — correct google_model_id, labels, api_platform.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/682_gemini35_live_catalog.sql

INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier, google_model_id, api_platform,
  routing_lane, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, supports_tools, supports_vision,
  supports_streaming, supports_json_mode, supports_reasoning, is_active, updated_at
) VALUES
(
  'mdl_gemini35_flash',
  'gemini-3.5-flash',
  'Gemini 3.5 Flash',
  'google', 'flash', 'gemini-3.5-flash', 'gemini_api', 'agentic',
  1048576, 65536, 0.0005, 0.003, 1, 1, 1, 0, 1, 1, unixepoch()
),
(
  'mdl_gemini31_pro_preview',
  'gemini-3.1-pro-preview',
  'Gemini 3.1 Pro Preview',
  'google', 'power', 'gemini-3.1-pro-preview', 'gemini_api', 'premium',
  1048576, 65536, 0.002, 0.012, 1, 1, 1, 0, 1, 1, unixepoch()
),
(
  'mdl_gemini31_flash_lite',
  'gemini-3.1-flash-lite',
  'Gemini 3.1 Flash Lite',
  'google', 'micro', 'gemini-3.1-flash-lite', 'gemini_api', 'cheap',
  1048576, 65536, 0.00025, 0.0015, 1, 0, 1, 0, 0, 1, unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  google_model_id = excluded.google_model_id,
  api_platform = excluded.api_platform,
  routing_lane = excluded.routing_lane,
  is_active = 1,
  is_degraded = 0,
  degraded_reason = NULL,
  supports_tools = excluded.supports_tools,
  supports_streaming = 1,
  updated_at = unixepoch();

UPDATE agentsam_ai
SET
  name = 'Gemini 3.5 Flash',
  api_platform = 'gemini_api',
  secret_key_name = 'GOOGLE_AI_API_KEY',
  status = 'active',
  show_in_picker = 1,
  picker_eligible = 1,
  picker_group = 'Google / Gemini',
  sort_order = 350,
  supports_tools = 1,
  updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash' AND mode = 'model';

UPDATE agentsam_ai
SET
  name = 'Gemini 3.1 Pro Preview',
  api_platform = 'gemini_api',
  secret_key_name = 'GOOGLE_AI_API_KEY',
  status = 'active',
  show_in_picker = 1,
  picker_eligible = 1,
  picker_group = 'Google / Gemini',
  sort_order = 360,
  supports_tools = 1,
  updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-pro-preview' AND mode = 'model';

UPDATE agentsam_ai
SET
  name = 'Gemini 3.1 Flash Lite',
  api_platform = 'gemini_api',
  secret_key_name = 'GOOGLE_AI_API_KEY',
  status = 'active',
  show_in_picker = 1,
  picker_eligible = 1,
  picker_group = 'Google / Gemini',
  sort_order = 340,
  supports_tools = 1,
  updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-flash-lite' AND mode = 'model';

-- Retire legacy 1.x / 2.x picker rows if any remain.
UPDATE agentsam_ai
SET status = 'deprecated', show_in_picker = 0, picker_eligible = 0, updated_at = unixepoch()
WHERE mode = 'model'
  AND model_key IN (
    'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro',
    'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro',
    'gemini-3-flash-preview'
  );

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'superseded_by_gemini-3.5-flash',
    updated_at = unixepoch()
WHERE model_key IN (
  'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro',
  'gemini-3-flash-preview'
);

-- Ensure primary workspace arms point at live 3.x models.
UPDATE agentsam_routing_arms
SET is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key IN ('gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite')
  AND COALESCE(is_active, 1) = 1;
