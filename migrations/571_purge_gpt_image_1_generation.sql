-- 571: Purge OpenAI gpt-image-1 generation family (provider deprecated entire gen).
-- Replace routing with gpt-image-2, gemini-3.x-image, imagen-4 — never deactivate-only.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/571_purge_gpt_image_1_generation.sql

-- ── 1) Remove retired models from control plane ─────────────────────────────
DELETE FROM agentsam_model_drift_signals
WHERE model_key IN ('gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5');

DELETE FROM agentsam_model_routing_memory
WHERE model_key IN ('gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5');

DELETE FROM agentsam_model_pricing
WHERE model_key IN ('gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5');

DELETE FROM agentsam_routing_arms
WHERE model_key IN ('gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5');

DELETE FROM agentsam_ai
WHERE model_key IN ('gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5');

DELETE FROM agentsam_model_catalog
WHERE model_key IN ('gpt-image-1', 'gpt-image-1-mini', 'gpt-image-1.5');

-- ── 2) Ensure gpt-image-2 catalog + dispatch row ─────────────────────────────
INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier, openai_model_id, api_platform,
  routing_lane, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, supports_tools, supports_vision,
  supports_streaming, supports_json_mode, supports_reasoning, is_active, updated_at
) VALUES (
  'mdl_gpt_img2',
  'gpt-image-2',
  'GPT Image 2',
  'openai', 'standard', 'gpt-image-2', NULL,
  'specialized', 0, 0, 0.005, 0.03, 0, 0, 0, 0, 0, 1, unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  openai_model_id = excluded.openai_model_id,
  routing_lane = excluded.routing_lane,
  is_active = 1, is_degraded = 0, degraded_reason = NULL,
  deprecated_after = NULL,
  updated_at = unixepoch();

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gpt_image_2', '', 'GPT Image 2', 'openai_image', 'OpenAI Images — gpt-image-2 (replaces retired gpt-image-1 gen).', 'active', 'model',
  'gpt-image-2', 'openai', 'openai_chat_completions', 'OPENAI_API_KEY', 0, 1, 0, 420, 'OpenAI / Media', 1, 0, 0.03, 0.03, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gpt-image-2' AND mode = 'model');

UPDATE agentsam_ai
SET status = 'active', show_in_picker = 0, picker_eligible = 1, updated_at = unixepoch()
WHERE model_key = 'gpt-image-2' AND mode = 'model';

INSERT OR REPLACE INTO agentsam_model_pricing (
  id, provider, model_key, pricing_kind, currency,
  input_rate_per_mtok, output_rate_per_mtok,
  supports_prompt_cache, supports_batch, supports_fast_mode,
  source_url, source_label, notes, is_active, routing_eligible, updated_at
) VALUES (
  'openai:gpt-image-2:image',
  'openai', 'gpt-image-2', 'image', 'USD',
  8.0, 30.0,
  0, 0, 0,
  'https://platform.openai.com/docs/pricing',
  'OpenAI Images API',
  'OpenAI gpt-image-2 — canonical OpenAI image lane after gpt-image-1 gen retirement.',
  1, 1, datetime('now')
);

-- ── 3) Thompson arms — OpenAI + CMS cover on live models only ─────────────────
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES (
  'ra_img_openai_gpt2_ws', 'image_generation', 'agent', 'gpt-image-2', 'openai', 'ws_inneranimalmedia',
  1.5, 1.0, 0.58, 1, 0, 1, 0, 0, 38, 0, '[]', 'media', 'low', unixepoch(), unixepoch()
);

UPDATE agentsam_routing_arms
SET model_key = 'gpt-image-2', provider = 'openai', is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE id = 'ra_7d90fdbf31ab3c7b' AND task_type = 'image_generation';

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES (
  'ra_cover_gpt_image_2', 'cms_theme_cover', 'agent', 'gpt-image-2', 'openai', 'ws_inneranimalmedia',
  1.5, 1.0, 0.55, 1, 0, 1, 0, 0, 40, 0, '[]', 'media', 'low', unixepoch(), unixepoch()
),
(
  'ra_cover_gemini_flash_ws', 'cms_theme_cover', 'agent', 'gemini-3.1-flash-image', 'google', 'ws_inneranimalmedia',
  1.5, 1.0, 0.60, 1, 0, 1, 0, 0, 42, 0, '[]', 'media', 'low', unixepoch(), unixepoch()
);

-- ── 4) imgx tool copy — no gpt-image-1 references ───────────────────────────
UPDATE agentsam_tools
SET description = 'Generate an image from a text prompt. provider=openai uses gpt-image-2; provider=google uses Gemini image (gemini-3.x-image) or Imagen 4; provider=workers-ai uses Flux. If provider is omitted, Google flash image is preferred when configured, otherwise OpenAI gpt-image-2.',
    updated_at = unixepoch()
WHERE tool_key = 'imgx_generate_image';
