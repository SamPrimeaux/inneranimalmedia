-- 668: Design Studio CAD script generation — Thompson arms + DeepSeek/Codex catalog fixes.
--
-- DeepSeek API (OpenAI-compatible): https://api.deepseek.com
-- DeepSeek API (Anthropic-compatible): https://api.deepseek.com/anthropic
-- Models: deepseek-v4-flash, deepseek-v4-pro
-- Secret: AGENTSAM_DEEPSEEK
--
-- Codex models use AGENTSAMGPT_SERVICEKEY (see openai-credentials.js).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/668_cad_script_routing_arms.sql

-- ── 1) Catalog: DeepSeek endpoints + Codex api_platform ─────────────────────
UPDATE agentsam_model_catalog
SET routing_lane = 'standard',
    cost_notes = 'secret=AGENTSAM_DEEPSEEK;api_base_openai=https://api.deepseek.com;api_base_anthropic=https://api.deepseek.com/anthropic;tools=1;thinking_policy=omitted',
    updated_at = unixepoch()
WHERE model_key = 'deepseek-v4-flash';

UPDATE agentsam_model_catalog
SET routing_lane = 'standard',
    cost_notes = 'secret=AGENTSAM_DEEPSEEK;api_base_openai=https://api.deepseek.com;api_base_anthropic=https://api.deepseek.com/anthropic;tools=1;thinking_policy=enabled',
    updated_at = unixepoch()
WHERE model_key = 'deepseek-v4-pro';

UPDATE agentsam_model_catalog
SET api_platform = 'openai_chat_completions',
    routing_lane = 'codex',
    updated_at = unixepoch()
WHERE model_key IN (
  'gpt-5-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.1-codex-max',
  'gpt-5.2-codex',
  'gpt-5.3-codex'
);

-- ── 2) agentsam_ai — Codex runtime rows (AGENTSAMGPT_SERVICEKEY) ────────────
INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, updated_at
)
SELECT
  'ai_gpt51_codex_mini',
  '',
  'GPT-5.1 Codex Mini',
  'codex_mini',
  'Cheap Codex lane for CAD script generation.',
  'active',
  'model',
  'gpt-5.1-codex-mini',
  'openai',
  'openai_chat_completions',
  'AGENTSAMGPT_SERVICEKEY',
  0,
  1,
  0,
  331,
  'OpenAI / Codex',
  1,
  1,
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gpt-5.1-codex-mini' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, updated_at
)
SELECT
  'ai_gpt51_codex',
  '',
  'GPT-5.1 Codex',
  'codex_standard',
  'Codex agentic code lane.',
  'active',
  'model',
  'gpt-5.1-codex',
  'openai',
  'openai_chat_completions',
  'AGENTSAMGPT_SERVICEKEY',
  0,
  1,
  0,
  332,
  'OpenAI / Codex',
  1,
  1,
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gpt-5.1-codex' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, updated_at
)
SELECT
  'ai_gpt52_codex',
  '',
  'GPT-5.2 Codex',
  'codex_standard',
  'Codex agentic code lane.',
  'active',
  'model',
  'gpt-5.2-codex',
  'openai',
  'openai_chat_completions',
  'AGENTSAMGPT_SERVICEKEY',
  0,
  1,
  0,
  333,
  'OpenAI / Codex',
  1,
  1,
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gpt-5.2-codex' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, secret_key_name,
  show_in_picker, picker_eligible, requires_human_approval, sort_order, picker_group, is_global,
  supports_tools, updated_at
)
SELECT
  'ai_gpt5_codex',
  '',
  'GPT-5 Codex',
  'codex_standard',
  'Codex agentic code lane.',
  'active',
  'model',
  'gpt-5-codex',
  'openai',
  'openai_chat_completions',
  'AGENTSAMGPT_SERVICEKEY',
  0,
  1,
  0,
  334,
  'OpenAI / Codex',
  1,
  1,
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'gpt-5-codex' AND mode = 'model');

UPDATE agentsam_ai
SET status = 'active',
    api_platform = 'openai_chat_completions',
    secret_key_name = 'AGENTSAMGPT_SERVICEKEY',
    picker_eligible = 1,
    show_in_picker = 0,
    updated_at = unixepoch()
WHERE model_key = 'gpt-5.3-codex' AND mode = 'model';

-- ── 3) Retire paused legacy codex arms (wrong task_types) ───────────────────
UPDATE agentsam_routing_arms
SET is_paused = 1,
    is_eligible = 0,
    pause_reason = 'superseded_by_designstudio_cad_script_668',
    updated_at = unixepoch()
WHERE id IN ('arm_codex_code', 'arm_codex_sql', 'arm_codex_worker');

-- ── 4) Thompson arms — task_type designstudio_cad_script ────────────────────
INSERT OR REPLACE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  workflow_agent, tools_json, reasoning_effort,
  fallback_model_key, max_cost_per_call_usd,
  model_catalog_id, pause_reason, last_decay_at, updated_at
) VALUES
('ra_cad_ds_deepseek_flash', 'designstudio_cad_script', 'agent', 'deepseek-v4-flash', 'deepseek', 'ws_inneranimalmedia',
 1.0, 1.0, 0.90, 1, 0, 1, 0, 0, 92, 0, 'cad_script', '[]', 'medium',
 'gpt-5.4-nano', 0.15, 'mdl_deepseek_v4_flash', NULL, unixepoch(), unixepoch()),
('ra_cad_ds_deepseek_pro', 'designstudio_cad_script', 'agent', 'deepseek-v4-pro', 'deepseek', 'ws_inneranimalmedia',
 1.0, 1.0, 0.92, 1, 0, 1, 0, 0, 90, 0, 'cad_script', '[]', 'high',
 'deepseek-v4-flash', 0.30, 'mdl_deepseek_v4_pro', NULL, unixepoch(), unixepoch()),
('ra_cad_ds_sonnet', 'designstudio_cad_script', 'agent', 'claude-sonnet-4-6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.88, 1, 0, 1, 0, 0, 88, 0, 'cad_script', '[]', 'medium',
 'deepseek-v4-pro', 0.75, NULL, NULL, unixepoch(), unixepoch()),
('ra_cad_ds_codex_53', 'designstudio_cad_script', 'agent', 'gpt-5.3-codex', 'openai', 'ws_inneranimalmedia',
 1.0, 1.0, 0.86, 1, 0, 1, 0, 0, 86, 0, 'cad_script', '[]', 'medium',
 'gpt-5.1-codex-mini', 0.80, 'mdl_gpt53_codex', NULL, unixepoch(), unixepoch()),
('ra_cad_ds_codex_52', 'designstudio_cad_script', 'agent', 'gpt-5.2-codex', 'openai', 'ws_inneranimalmedia',
 1.0, 1.0, 0.84, 1, 0, 1, 0, 0, 84, 0, 'cad_script', '[]', 'medium',
 'gpt-5.1-codex-mini', 0.75, NULL, NULL, unixepoch(), unixepoch()),
('ra_cad_ds_codex_mini', 'designstudio_cad_script', 'agent', 'gpt-5.1-codex-mini', 'openai', 'ws_inneranimalmedia',
 1.0, 1.0, 0.82, 1, 0, 1, 0, 0, 80, 0, 'cad_script', '[]', 'low',
 'gpt-5.4-nano', 0.20, NULL, NULL, unixepoch(), unixepoch()),
('ra_cad_ds_gpt54mini', 'designstudio_cad_script', 'agent', 'gpt-5.4-mini', 'openai', 'ws_inneranimalmedia',
 1.0, 1.0, 0.80, 1, 0, 1, 0, 0, 78, 0, 'cad_script', '[]', 'medium',
 'gpt-5.4-nano', 0.25, NULL, NULL, unixepoch(), unixepoch()),
('ra_cad_ds_gemini_flash', 'designstudio_cad_script', 'agent', 'gemini-3.5-flash', 'google', 'ws_inneranimalmedia',
 1.0, 1.0, 0.78, 1, 0, 1, 0, 0, 76, 0, 'cad_script', '[]', 'medium',
 'gpt-5.4-nano', 0.20, NULL, NULL, unixepoch(), unixepoch());
