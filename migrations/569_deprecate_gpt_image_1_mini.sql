-- 569: Retire OpenAI gpt-image-1-mini (provider deprecation); route fast OpenAI image gen to gpt-image-1.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/569_deprecate_gpt_image_1_mini.sql

-- ── 1) Catalog — deprecate mini; ensure gpt-image-1 active ───────────────────
UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'openai_deprecation_use_gpt-image-1',
    deprecated_after = '2026-06-04',
    updated_at = unixepoch()
WHERE model_key = 'gpt-image-1-mini';

INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier, openai_model_id, api_platform,
  routing_lane, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, supports_tools, supports_vision,
  supports_streaming, supports_json_mode, supports_reasoning, is_active, updated_at
) VALUES (
  'mdl_gpt_img1',
  'gpt-image-1',
  'GPT Image 1',
  'openai', 'standard', 'gpt-image-1', NULL,
  'specialized', 0, 0, 0.04, 0.04, 0, 0, 0, 0, 0, 1, unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  openai_model_id = excluded.openai_model_id,
  api_platform = excluded.api_platform,
  routing_lane = excluded.routing_lane,
  is_active = 1, is_degraded = 0, degraded_reason = NULL,
  deprecated_after = NULL,
  updated_at = unixepoch();

-- ── 2) agentsam_ai — retire mini; ensure gpt-image-1 dispatch row ────────────
UPDATE agentsam_ai
SET status = 'deprecated', show_in_picker = 0, picker_eligible = 0, updated_at = unixepoch()
WHERE mode = 'model' AND model_key = 'gpt-image-1-mini';

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gpt_image_1', '', 'GPT Image 1', 'openai_image', 'OpenAI Images — fast draft / edit lane (replaces gpt-image-1-mini).', 'active', 'model',
  'gpt-image-1', 'openai', 'openai_chat_completions', 'OPENAI_API_KEY', 0, 1, 0, 425, 'OpenAI / Media', 1, 0, 0.04, 0.04, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gpt-image-1' AND mode = 'model');

-- ── 3) Thompson arms — pause mini; add gpt-image-1 image_generation arm ───────
UPDATE agentsam_routing_arms
SET is_paused = 1, pause_reason = 'openai_gpt_image_1_mini_deprecation', updated_at = unixepoch()
WHERE model_key = 'gpt-image-1-mini'
  AND COALESCE(is_active, 1) = 1;

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES (
  'ra_img_openai_gpt1_ws', 'image_generation', 'agent', 'gpt-image-1', 'openai', 'ws_inneranimalmedia',
  1.5, 1.0, 0.58, 1, 0, 1, 0, 0, 40, 0, '[]', 'media', 'low', unixepoch(), unixepoch()
);

-- Legacy ai_models pricing table (if row exists)
UPDATE ai_models
SET updated_at = unixepoch()
WHERE model_key = 'gpt-image-1-mini' AND provider = 'openai';
