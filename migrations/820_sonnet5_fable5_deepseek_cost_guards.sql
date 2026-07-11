-- 820: Sonnet 5 (active builder) + Fable 5 / Opus 4.8 ready-but-inactive;
-- DeepSeek V4 Agent arms; retire Jul-23 Codex + Sora; fix gpt-image-2 specialist tier.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/820_sonnet5_fable5_deepseek_cost_guards.sql
--
-- Cost guard: Opus 4.8 + Fable 5 catalog rows exist for pin/smoke later, but Thompson arms
-- stay is_active=0 (Fable) / is_paused=1 (Opus 4.8) until routing is proven cheap.

-- ── 1. Catalog: Claude Sonnet 5 (ACTIVE default builder) ─────────────────────
INSERT INTO agentsam_model_catalog (
  model_key, display_name, provider, tier, routing_lane, api_platform,
  anthropic_model_id, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, cost_per_1k_cached_in,
  supports_tools, supports_vision, supports_streaming, supports_json_mode,
  supports_reasoning, supports_adaptive_thinking, supports_effort_scaling,
  thinking_policy, is_active, is_degraded, cost_notes, updated_at
) VALUES (
  'claude-sonnet-5', 'Claude Sonnet 5', 'anthropic', 'power', 'standard', 'anthropic',
  'claude-sonnet-5', 1000000, 128000,
  0.002, 0.010, 0.0002,
  1, 1, 1, 1,
  0, 1, 1,
  'omitted', 1, 0,
  'intro pricing thru 2026-08-31 then ~$3/$15 per M; T2-T3 default builder',
  unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  tier = excluded.tier,
  routing_lane = excluded.routing_lane,
  api_platform = excluded.api_platform,
  anthropic_model_id = excluded.anthropic_model_id,
  context_window = excluded.context_window,
  max_output_tokens = excluded.max_output_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  cost_per_1k_cached_in = excluded.cost_per_1k_cached_in,
  supports_tools = excluded.supports_tools,
  supports_vision = excluded.supports_vision,
  supports_streaming = excluded.supports_streaming,
  supports_json_mode = excluded.supports_json_mode,
  supports_adaptive_thinking = excluded.supports_adaptive_thinking,
  supports_effort_scaling = excluded.supports_effort_scaling,
  thinking_policy = excluded.thinking_policy,
  is_active = 1,
  is_degraded = 0,
  cost_notes = excluded.cost_notes,
  updated_at = unixepoch();

-- ── 2. Catalog: Claude Fable 5 (READY — catalog active for pin; arms inactive) ─
-- tier=reasoning (CHECK has no 'frontier'); lane=reasoning = T5 escalation.
INSERT INTO agentsam_model_catalog (
  model_key, display_name, provider, tier, routing_lane, api_platform,
  anthropic_model_id, context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out, cost_per_1k_cached_in,
  supports_tools, supports_vision, supports_streaming, supports_json_mode,
  supports_reasoning, supports_adaptive_thinking, supports_effort_scaling,
  thinking_policy, is_active, is_degraded, cost_notes, updated_at
) VALUES (
  'claude-fable-5', 'Claude Fable 5', 'anthropic', 'reasoning', 'reasoning', 'anthropic',
  'claude-fable-5', 1000000, 128000,
  0.010, 0.050, 0.001,
  1, 1, 1, 1,
  1, 1, 1,
  'summarized', 1, 0,
  'T5 only; 30d retention required; refusal→fallback Opus 4.8; arms inactive until cost-proven',
  unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  tier = excluded.tier,
  routing_lane = excluded.routing_lane,
  api_platform = excluded.api_platform,
  anthropic_model_id = excluded.anthropic_model_id,
  context_window = excluded.context_window,
  max_output_tokens = excluded.max_output_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  cost_per_1k_cached_in = excluded.cost_per_1k_cached_in,
  supports_tools = excluded.supports_tools,
  supports_vision = excluded.supports_vision,
  supports_reasoning = excluded.supports_reasoning,
  supports_adaptive_thinking = excluded.supports_adaptive_thinking,
  supports_effort_scaling = excluded.supports_effort_scaling,
  thinking_policy = excluded.thinking_policy,
  is_active = 1,
  is_degraded = 0,
  cost_notes = excluded.cost_notes,
  updated_at = unixepoch();

-- ── 3. Sonnet 5 ACTIVE builder arms ──────────────────────────────────────────
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, model_key, task_type, mode, provider, priority, workspace_id,
  is_active, is_eligible, is_paused, supports_tools, success_alpha, success_beta,
  decayed_score, last_decay_at, updated_at
) VALUES
  ('ra_sonnet5_code_agent', 'claude-sonnet-5', 'code', 'agent', 'anthropic', 75, 'ws_inneranimalmedia', 1, 1, 0, 1, 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_sonnet5_debug_agent', 'claude-sonnet-5', 'debug', 'agent', 'anthropic', 75, 'ws_inneranimalmedia', 1, 1, 0, 1, 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_sonnet5_plan_agent', 'claude-sonnet-5', 'plan', 'agent', 'anthropic', 75, 'ws_inneranimalmedia', 1, 1, 0, 1, 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_sonnet5_search_code', 'claude-sonnet-5', 'search_code', 'agent', 'anthropic', 80, 'ws_inneranimalmedia', 1, 1, 0, 1, 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_sonnet5_chat_agent', 'claude-sonnet-5', 'chat', 'agent', 'anthropic', 65, 'ws_inneranimalmedia', 1, 1, 0, 1, 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_sonnet5_subagent_worker', 'claude-sonnet-5', 'subagent_worker', 'agent', 'anthropic', 70, 'ws_inneranimalmedia', 1, 1, 0, 1, 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_sonnet5_code_gen', 'claude-sonnet-5', 'code_gen', 'agent', 'anthropic', 72, 'ws_inneranimalmedia', 1, 1, 0, 1, 1, 1, 0.5, unixepoch(), unixepoch());

UPDATE agentsam_routing_arms SET
  is_active = 1, is_eligible = 1, is_paused = 0, priority = CASE id
    WHEN 'ra_sonnet5_search_code' THEN 80
    WHEN 'ra_sonnet5_code_agent' THEN 75
    WHEN 'ra_sonnet5_debug_agent' THEN 75
    WHEN 'ra_sonnet5_plan_agent' THEN 75
    WHEN 'ra_sonnet5_code_gen' THEN 72
    WHEN 'ra_sonnet5_subagent_worker' THEN 70
    WHEN 'ra_sonnet5_chat_agent' THEN 65
    ELSE priority END,
  updated_at = unixepoch()
WHERE id LIKE 'ra_sonnet5_%';

-- ── 4. Fable 5 arms READY but INACTIVE (Thompson will not draw) ───────────────
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, model_key, task_type, mode, provider, priority, workspace_id,
  is_active, is_eligible, is_paused, supports_tools, reasoning_effort,
  fallback_model_key, success_alpha, success_beta, decayed_score, last_decay_at, updated_at,
  pause_reason
) VALUES
  ('ra_fable5_high_risk', 'claude-fable-5', 'high_risk_review', 'agent', 'anthropic', 95, 'ws_inneranimalmedia',
   0, 1, 0, 1, 'high', 'claude-opus-4-8', 1, 1, 0.5, unixepoch(), unixepoch(),
   'cost_guard_inactive_until_routing_proven'),
  ('ra_fable5_migration', 'claude-fable-5', 'migration_approval_review', 'agent', 'anthropic', 92, 'ws_inneranimalmedia',
   0, 1, 0, 1, 'high', 'claude-opus-4-8', 1, 1, 0.5, unixepoch(), unixepoch(),
   'cost_guard_inactive_until_routing_proven'),
  ('ra_fable5_deep_reasoning_v2', 'claude-fable-5', 'deep_reasoning', 'agent', 'anthropic', 90, 'ws_inneranimalmedia',
   0, 1, 0, 1, 'high', 'claude-opus-4-8', 1, 1, 0.5, unixepoch(), unixepoch(),
   'cost_guard_inactive_until_routing_proven');

UPDATE agentsam_routing_arms SET
  is_active = 0,
  is_eligible = 1,
  is_paused = 0,
  fallback_model_key = 'claude-opus-4-8',
  reasoning_effort = 'high',
  pause_reason = 'cost_guard_inactive_until_routing_proven',
  updated_at = unixepoch()
WHERE id IN ('ra_fable5_high_risk', 'ra_fable5_migration', 'ra_fable5_deep_reasoning_v2');

-- Orphan arm pointed at missing catalog — retire
UPDATE agentsam_routing_arms SET
  is_active = 0,
  is_paused = 1,
  pause_reason = 'orphaned_replaced_by_ra_fable5_deep_reasoning_v2',
  updated_at = unixepoch()
WHERE id = 'arm_fable5_deep_reasoning';

-- ── 5. Pause ALL Opus 4.8 arms (ready in catalog, not Auto/Thompson) ──────────
UPDATE agentsam_routing_arms SET
  is_paused = 1,
  pause_reason = 'cost_guard_paused_until_routing_proven',
  updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-8';

-- ── 6. DeepSeek V4 Agent arms (native API — not Workers AI) ──────────────────
INSERT OR IGNORE INTO agentsam_routing_arms (
  id, model_key, task_type, mode, provider, priority, workspace_id,
  is_active, is_eligible, is_paused, supports_tools, reasoning_effort,
  fallback_model_key, success_alpha, success_beta, decayed_score, last_decay_at, updated_at
) VALUES
  ('ra_ds_flash_search_code', 'deepseek-v4-flash', 'search_code', 'agent', 'deepseek', 70, 'ws_inneranimalmedia',
   1, 1, 0, 1, 'medium', 'claude-sonnet-5', 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_ds_flash_subagent_worker', 'deepseek-v4-flash', 'subagent_worker', 'agent', 'deepseek', 68, 'ws_inneranimalmedia',
   1, 1, 0, 1, 'medium', 'claude-sonnet-5', 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_ds_flash_code', 'deepseek-v4-flash', 'code', 'agent', 'deepseek', 60, 'ws_inneranimalmedia',
   1, 1, 0, 1, 'high', 'claude-sonnet-5', 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_ds_pro_code', 'deepseek-v4-pro', 'code', 'agent', 'deepseek', 62, 'ws_inneranimalmedia',
   1, 1, 0, 1, 'high', 'claude-sonnet-5', 1, 1, 0.5, unixepoch(), unixepoch()),
  ('ra_ds_pro_debug', 'deepseek-v4-pro', 'debug', 'agent', 'deepseek', 62, 'ws_inneranimalmedia',
   1, 1, 0, 1, 'high', 'claude-sonnet-5', 1, 1, 0.5, unixepoch(), unixepoch());

-- ── 7. Retire OpenAI Codex Jul-23 set + Sora ─────────────────────────────────
UPDATE agentsam_model_catalog SET
  is_active = 0,
  is_degraded = 1,
  degraded_reason = CASE
    WHEN model_key LIKE 'gpt-5%codex%' THEN 'openai_codex_shutdown_2026-07-23'
    WHEN model_key LIKE 'sora-2%' THEN 'openai_sora2_shutdown_2026-09-24'
    ELSE degraded_reason END,
  deprecated_after = CASE
    WHEN model_key LIKE 'gpt-5%codex%' AND model_key != 'gpt-5.3-codex' THEN '2026-07-23'
    WHEN model_key LIKE 'sora-2%' THEN '2026-09-24'
    ELSE deprecated_after END,
  updated_at = unixepoch()
WHERE model_key IN (
  'gpt-5-codex', 'gpt-5.1-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini', 'gpt-5.2-codex',
  'sora-2', 'sora-2-pro'
);

UPDATE agentsam_routing_arms SET
  is_active = 0,
  is_paused = 1,
  pause_reason = 'model_catalog_retired',
  updated_at = unixepoch()
WHERE model_key IN (
  'gpt-5-codex', 'gpt-5.1-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini', 'gpt-5.2-codex',
  'sora-2', 'sora-2-pro'
);

-- Keep gpt-5.3-codex active as surviving code specialist (if present)

-- ── 8. gpt-image-2 is image gen, not LM power ────────────────────────────────
UPDATE agentsam_model_catalog SET
  tier = 'standard',
  routing_lane = 'specialized',
  cost_notes = COALESCE(cost_notes, '') || ' | image_generation_specialist_not_lm_power',
  updated_at = unixepoch()
WHERE model_key IN ('gpt-image-2', 'gpt-image-2-2026-04-21');
