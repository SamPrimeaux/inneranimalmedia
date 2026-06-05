-- 564: Google Gemini 3.x lane map — catalog, picker, Thompson arms, retire 2.x/dead IDs.
-- Includes changes from 563 (idempotent). Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/564_google_gemini3_lane_map.sql

-- ── 1) Retire shutdown / deprecated catalog rows ─────────────────────────────
UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'google_shutdown_2026-03-09_use_gemini-3.1-pro-preview',
    deprecated_after = '2026-03-09', updated_at = unixepoch()
WHERE model_key = 'gemini-3-pro-preview';

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'google_shutdown_2026-04-30_use_gemini-robotics-er-1.6-preview',
    deprecated_after = '2026-04-30', updated_at = unixepoch()
WHERE model_key = 'gemini-robotics-er-1.5-preview';

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'google_shutdown_2026-05-25_use_gemini-3.1-flash-lite',
    deprecated_after = '2026-05-25', updated_at = unixepoch()
WHERE model_key IN ('gemini-3.1-flash-lite-preview');

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'google_shutdown_2026-06-25_use_gemini-3.1-flash-image',
    deprecated_after = '2026-06-25', updated_at = unixepoch()
WHERE model_key = 'gemini-3.1-flash-image-preview';

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'google_shutdown_2026-06-25_use_gemini-3-pro-image',
    deprecated_after = '2026-06-25', updated_at = unixepoch()
WHERE model_key = 'gemini-3-pro-image-preview';

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'google_shutdown_2026-10-16_use_gemini-3.1-pro-preview',
    deprecated_after = '2026-10-16', updated_at = unixepoch()
WHERE model_key IN (
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
  'gemini-2.5-flash-image', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'
);

UPDATE agentsam_model_catalog
SET is_active = 0, is_degraded = 1,
    degraded_reason = 'legacy_deep_research_use_deep-research-preview-04-2026',
    updated_at = unixepoch()
WHERE model_key = 'deep-research-pro-preview-12-2025';

-- ── 2) Stable catalog rows (image lanes + aliases) ───────────────────────────
INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier, google_model_id, api_platform,
  routing_lane, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, supports_tools, supports_vision,
  supports_streaming, supports_json_mode, supports_reasoning, is_active, updated_at
) VALUES
(
  'mdl_gemini31_flash_image',
  'gemini-3.1-flash-image',
  'Gemini 3.1 Flash Image (Nano Banana 2)',
  'google', 'flash', 'gemini-3.1-flash-image', 'gemini_api', 'specialized',
  131072, 32768, 0.0005, 0.045, 0, 1, 1, 0, 0, 1, unixepoch()
),
(
  'mdl_gemini3_pro_image',
  'gemini-3-pro-image',
  'Gemini 3 Pro Image (Nano Banana Pro)',
  'google', 'power', 'gemini-3-pro-image', 'gemini_api', 'specialized',
  65536, 32768, 0.002, 0.134, 0, 1, 1, 0, 0, 1, unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  google_model_id = excluded.google_model_id,
  api_platform = excluded.api_platform,
  routing_lane = excluded.routing_lane,
  is_active = 1, is_degraded = 0, degraded_reason = NULL,
  updated_at = unixepoch();

-- ── 3) agentsam_ai — retire 2.x picker + fix 3.5 dispatch ───────────────────
UPDATE agentsam_ai
SET api_platform = 'gemini_api', secret_key_name = 'GOOGLE_AI_API_KEY', updated_at = unixepoch()
WHERE model_key = 'gemini-3.5-flash' AND mode = 'model';

UPDATE agentsam_ai
SET status = 'deprecated', show_in_picker = 0, picker_eligible = 0, updated_at = unixepoch()
WHERE mode = 'model' AND model_key IN (
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'
);

-- ── 4) agentsam_ai — install non-picker lanes (routing-ready) ────────────────
INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini31_flash_lite', '', 'Gemini 3.1 Flash Lite', 'gemini_lite', 'Cheap classifier / extraction / routing lane.', 'active', 'model',
  'gemini-3.1-flash-lite', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 405, 'Google / Gemini', 1, 1, 0.25, 1.5, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3.1-flash-lite' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini31_pro_customtools', '', 'Gemini 3.1 Pro Custom Tools', 'gemini_customtools', 'Bash/custom-tool agent lane (view_file, search_code, terminal).', 'active', 'model',
  'gemini-3.1-pro-preview-customtools', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 412, 'Google / Gemini', 1, 1, 2.0, 12.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3.1-pro-preview-customtools' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini31_flash_image', '', 'Gemini 3.1 Flash Image', 'gemini_image_fast', 'Nano Banana 2 — fast image gen/edit.', 'active', 'model',
  'gemini-3.1-flash-image', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 420, 'Google / Media', 1, 0, 0.5, 3.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3.1-flash-image' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini3_pro_image', '', 'Gemini 3 Pro Image', 'gemini_image_pro', 'Nano Banana Pro — high-quality image/layout lane.', 'active', 'model',
  'gemini-3-pro-image', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 421, 'Google / Media', 1, 0, 2.0, 12.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3-pro-image' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini31_flash_tts', '', 'Gemini 3.1 Flash TTS', 'gemini_tts', 'Low-latency TTS preview lane.', 'active', 'model',
  'gemini-3.1-flash-tts-preview', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 422, 'Google / Media', 1, 0, 1.0, 20.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3.1-flash-tts-preview' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini_embedding_2', '', 'Gemini Embedding 2', 'gemini_embed_2', 'RAG / vector search embedding lane.', 'active', 'model',
  'models/gemini-embedding-2', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 430, 'Google / Embedding', 1, 0, 0.0, 0.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/gemini-embedding-2' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_deep_research_0426', '', 'Deep Research Preview', 'deep_research', 'Managed research agent — cited reports.', 'active', 'model',
  'deep-research-preview-04-2026', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 440, 'Google / Agents', 1, 1, 0.3, 2.5, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'deep-research-preview-04-2026' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_deep_research_max_0426', '', 'Deep Research Max Preview', 'deep_research_max', 'Maximum comprehensiveness research agent.', 'active', 'model',
  'deep-research-max-preview-04-2026', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 441, 'Google / Agents', 1, 1, 2.0, 12.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'deep-research-max-preview-04-2026' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini_computer_use', '', 'Gemini Computer Use Preview', 'gemini_computer_use', 'Browser/computer-control agent capability.', 'active', 'model',
  'models/gemini-2.5-computer-use-preview-10-2025', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 450, 'Google / Agents', 1, 1, 1.25, 10.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/gemini-2.5-computer-use-preview-10-2025' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_lyria3_clip', '', 'Lyria 3 Clip Preview', 'lyria_clip', 'Short music clips for MovieMode.', 'active', 'model',
  'models/lyria-3-clip-preview', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 460, 'Google / Media', 1, 0, 0.0, 0.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/lyria-3-clip-preview' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_lyria3_pro', '', 'Lyria 3 Pro Preview', 'lyria_pro', 'Full song generation for MovieMode.', 'active', 'model',
  'models/lyria-3-pro-preview', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY', 0, 1, 0, 461, 'Google / Media', 1, 0, 0.0, 0.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/lyria-3-pro-preview' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_veo31_gen', '', 'Veo 3.1 Generate Preview', 'veo31_std', 'Standard Veo 3.1 video generation.', 'active', 'model',
  'models/veo-3.1-generate-preview', 'google', 'vertex_ai', 'GOOGLE_AI_API_KEY', 0, 1, 0, 470, 'Google / Video', 1, 0, 0.0, 0.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/veo-3.1-generate-preview' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_veo31_lite', '', 'Veo 3.1 Lite Generate Preview', 'veo31_lite', 'Fast/cheap Veo 3.1 video generation.', 'active', 'model',
  'models/veo-3.1-lite-generate-preview', 'google', 'vertex_ai', 'GOOGLE_AI_API_KEY', 0, 1, 0, 471, 'Google / Video', 1, 0, 0.0, 0.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/veo-3.1-lite-generate-preview' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_veo31_fast', '', 'Veo 3.1 Fast Generate Preview', 'veo31_fast', 'Fast Veo 3.1 video generation.', 'active', 'model',
  'models/veo-3.1-fast-generate-preview', 'google', 'vertex_ai', 'GOOGLE_AI_API_KEY', 0, 1, 0, 472, 'Google / Video', 1, 0, 0.0, 0.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/veo-3.1-fast-generate-preview' AND mode = 'model');

-- ── 5) Repoint legacy 2.5 routing arms → 3.x lanes (by id — avoids unique dupes) ─
-- Remove duplicate agent/agent 3.5 arm so canonical ra_agent_agent_gemini_flash_ws can repoint.
DELETE FROM agentsam_routing_arms WHERE id = 'ra_balanced_35flash';

UPDATE agentsam_routing_arms
SET model_key = 'gemini-3.5-flash', is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE id = 'ra_agent_agent_gemini_flash_ws';

-- Pause 2.5 Pro arms (3.1 Pro arms already exist for plan/research/debug/cms).
UPDATE agentsam_routing_arms
SET is_paused = 1, pause_reason = 'gemini_2x_deprecation', updated_at = unixepoch()
WHERE id IN ('ra_cms_gemini_pro', 'ra_9347521cd6c2d24f', 'ra_a2412e419b781c2e', 'ra_d714f72ec1b89041');

-- Unpause existing 3.x arms (Thompson-ready).
UPDATE agentsam_routing_arms
SET is_paused = 0, pause_reason = NULL, updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND model_key IN ('gemini-3.5-flash', 'gemini-3.1-pro-preview')
  AND COALESCE(is_active, 1) = 1;

-- Pause any remaining 2.5 arms.
UPDATE agentsam_routing_arms
SET is_paused = 1, pause_reason = 'gemini_2x_deprecation', updated_at = unixepoch()
WHERE model_key LIKE 'gemini-2.5%'
  AND COALESCE(is_active, 1) = 1;

-- ── 6) New Thompson arms — cheap / customtools / media / research ────────────
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES
  ('ra_lite_intent_ws', 'intent_classification', 'auto', 'gemini-3.1-flash-lite', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.70, 1, 0, 1, 0, 1, 90, 0, '[]', 'router', 'low', unixepoch(), unixepoch()),
  ('ra_lite_router_micro_ws', 'router_micro', 'auto', 'gemini-3.1-flash-lite', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.70, 1, 0, 1, 0, 1, 90, 0, '[]', 'router', 'low', unixepoch(), unixepoch()),
  ('ra_lite_cheap_summary_ws', 'cheap_summary', 'auto', 'gemini-3.1-flash-lite', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.68, 1, 0, 1, 0, 1, 85, 0, '[]', 'recall', 'low', unixepoch(), unixepoch()),
  ('ra_lite_chat_auto_ws', 'chat', 'auto', 'gemini-3.1-flash-lite', 'google', 'ws_inneranimalmedia',
   1.8, 1.0, 0.62, 1, 0, 1, 0, 1, 15, 0, '[]', 'agent_sam_core', 'low', unixepoch(), unixepoch()),
  ('ra_lite_summary_auto_ws', 'summary', 'auto', 'gemini-3.1-flash-lite', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.65, 1, 0, 1, 0, 0, 20, 0, '[]', 'recall', 'low', unixepoch(), unixepoch()),
  ('ra_customtools_agent_ws', 'agent', 'agent', 'gemini-3.1-pro-preview-customtools', 'google', 'ws_inneranimalmedia',
   1.8, 1.0, 0.72, 1, 0, 1, 0, 1, 108, 0,
   '["fs_read_file","fs_search_files","terminal_execute","d1_query"]', 'toolbox', 'high', unixepoch(), unixepoch()),
  ('ra_customtools_code_ws', 'code', 'agent', 'gemini-3.1-pro-preview-customtools', 'google', 'ws_inneranimalmedia',
   1.8, 1.0, 0.70, 1, 0, 1, 0, 1, 72, 0,
   '["fs_read_file","fs_search_files","terminal_execute","d1_query"]', 'toolbox', 'high', unixepoch(), unixepoch()),
  ('ra_customtools_terminal_ws', 'terminal_execution', 'agent', 'gemini-3.1-pro-preview-customtools', 'google', 'ws_inneranimalmedia',
   1.8, 1.0, 0.70, 1, 0, 1, 0, 1, 88, 0,
   '["terminal_execute","platform_info","d1_query"]', 'toolbox', 'high', unixepoch(), unixepoch()),
  ('ra_img_flash_ws', 'image_generation', 'agent', 'gemini-3.1-flash-image', 'google', 'ws_inneranimalmedia',
   1.5, 1.0, 0.60, 1, 0, 1, 0, 0, 35, 0, '[]', 'media', 'low', unixepoch(), unixepoch()),
  ('ra_img_pro_ws', 'image_generation', 'agent', 'gemini-3-pro-image', 'google', 'ws_inneranimalmedia',
   1.5, 1.0, 0.58, 1, 0, 1, 0, 0, 55, 0, '[]', 'media', 'medium', unixepoch(), unixepoch()),
  ('ra_embed_gemini2_ws', 'embeddings', 'auto', 'models/gemini-embedding-2', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.75, 1, 0, 1, 0, 0, 80, 0, '[]', 'rag', 'low', unixepoch(), unixepoch()),
  ('ra_research_deep_ws', 'research', 'agent', 'deep-research-preview-04-2026', 'google', 'ws_inneranimalmedia',
   1.2, 1.0, 0.55, 1, 0, 1, 0, 1, 48, 0, '[]', 'research', 'high', unixepoch(), unixepoch()),
  ('ra_research_deep_max_ws', 'research', 'agent', 'deep-research-max-preview-04-2026', 'google', 'ws_inneranimalmedia',
   1.0, 1.0, 0.50, 1, 0, 1, 0, 1, 42, 0, '[]', 'research', 'high', unixepoch(), unixepoch()),
  ('ra_browser_computer_use_ws', 'browser', 'agent', 'models/gemini-2.5-computer-use-preview-10-2025', 'google', 'ws_inneranimalmedia',
   1.2, 1.0, 0.52, 1, 0, 1, 0, 1, 28, 0, '[]', 'browser', 'medium', unixepoch(), unixepoch()),
  ('ra_music_lyria_clip_ws', 'music_generation', 'auto', 'models/lyria-3-clip-preview', 'google', 'ws_inneranimalmedia',
   1.5, 1.0, 0.55, 1, 0, 1, 0, 0, 20, 0, '[]', 'media', 'low', unixepoch(), unixepoch()),
  ('ra_music_lyria_pro_ws', 'music_generation', 'auto', 'models/lyria-3-pro-preview', 'google', 'ws_inneranimalmedia',
   1.3, 1.0, 0.52, 1, 0, 1, 0, 0, 30, 0, '[]', 'media', 'medium', unixepoch(), unixepoch()),
  ('ra_debug_agent_gemini35', 'debug', 'agent', 'gemini-3.5-flash', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.68, 1, 0, 1, 0, 1, 70, 0,
   '["fs_read_file","d1_query","terminal_execute"]', 'toolbox', 'medium', unixepoch(), unixepoch()),
  ('ra_terminal_agent_gemini35', 'terminal_execution', 'agent', 'gemini-3.5-flash', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.68, 1, 0, 1, 0, 1, 88, 0,
   '["terminal_execute","platform_info","d1_query"]', 'toolbox', 'medium', unixepoch(), unixepoch());

-- Pause legacy Veo 2.x / 3.0 arms — prefer 3.1 preview lanes for MovieMode.
UPDATE agentsam_routing_arms
SET is_paused = 1, pause_reason = 'veo_3_1_upgrade', updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia'
  AND task_type = 'video_generation'
  AND model_key IN ('models/veo-2.0-generate-001', 'models/veo-3.0-generate-001', 'models/veo-3.0-fast-generate-001');
