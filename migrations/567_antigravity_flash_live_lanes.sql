-- 567: Antigravity sandbox agent + Gemini 3.1 Flash Live (voice) lanes.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/567_antigravity_flash_live_lanes.sql

-- ── 1) Catalog — Flash Live (voice / live preview) ─────────────────────────
INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier, google_model_id, api_platform,
  routing_lane, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, supports_tools, supports_vision,
  supports_streaming, supports_json_mode, supports_reasoning, is_active, updated_at
) VALUES (
  'mdl_gemini31_flash_live',
  'gemini-3.1-flash-live-preview',
  'Gemini 3.1 Flash Live (Preview)',
  'google', 'flash', 'gemini-3.1-flash-live-preview', 'gemini_api', 'specialized',
  131072, 8192, 0.0005, 0.003, 0, 1, 1, 0, 0, 1, unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  google_model_id = excluded.google_model_id,
  api_platform = excluded.api_platform,
  routing_lane = excluded.routing_lane,
  is_active = 1, is_degraded = 0, degraded_reason = NULL,
  updated_at = unixepoch();

-- ── 2) agentsam_ai — non-picker specialty lanes ─────────────────────────────
INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_gemini31_flash_live', '', 'Gemini 3.1 Flash Live', 'gemini_flash_live',
  'Live/voice preview lane — browser speech-to-text companion; not default chat model.', 'active', 'model',
  'gemini-3.1-flash-live-preview', 'google', 'gemini_api', 'GOOGLE_AI_API_KEY',
  0, 0, 0, 425, 'Google / Voice', 1, 0, 0.5, 3.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gemini-3.1-flash-live-preview' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, input_rate_per_mtok, output_rate_per_mtok, updated_at
)
SELECT 'ai_antigravity_sandbox', '', 'Antigravity Sandbox Agent', 'antigravity_sandbox',
  'Remote Linux sandbox — repo clone/mount, install+test, research+artifact, scout reports. AgentSam validates output.', 'active', 'model',
  'models/antigravity-preview-05-2026', 'google', 'google_interactions', 'GOOGLE_AI_API_KEY',
  0, 0, 1, 455, 'Google / Agents', 1, 1, 2.0, 10.0, unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'models/antigravity-preview-05-2026' AND mode = 'model');

-- ── 3) Thompson routing arms (delegation-only — not chat picker) ─────────────
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES
  ('ra_antigravity_sandbox_ws', 'sandbox_agent', 'agent', 'models/antigravity-preview-05-2026', 'google', 'ws_inneranimalmedia',
   1.5, 1.0, 0.55, 1, 0, 1, 0, 1, 95, 0,
   '[]', 'antigravity_scout', 'high', unixepoch(), unixepoch()),
  ('ra_flash_live_voice_ws', 'voice_input', 'auto', 'gemini-3.1-flash-live-preview', 'google', 'ws_inneranimalmedia',
   1.5, 1.0, 0.60, 1, 0, 1, 0, 0, 80, 0,
   '[]', 'recall', 'low', unixepoch(), unixepoch());
