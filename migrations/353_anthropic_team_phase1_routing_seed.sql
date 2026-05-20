-- 353: Anthropic specialized team — Haiku 4.5 scout, Sonnet 4.6 builder, Opus 4.7 boss (gated).
-- Training workspace: ws_inneranimalmedia. Thompson arms use logical model_key + anthropic_model_id API id.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/353_anthropic_team_phase1_routing_seed.sql
--
-- Verify:
--   SELECT model_key, anthropic_model_id, cost_notes FROM agentsam_model_catalog WHERE model_key LIKE 'anthropic_%';
--   SELECT task_type, mode, model_key, is_eligible, is_paused, workflow_agent FROM agentsam_routing_arms WHERE model_key LIKE 'anthropic_%' AND workspace_id='ws_inneranimalmedia' ORDER BY sort_order;

-- ═══════════════════════════════════════════════════════════════
-- 0. Retire legacy Anthropic catalog / picker rows (no Sonnet 4.5 / Opus 4.5–4.6 routing)
-- ═══════════════════════════════════════════════════════════════

UPDATE agentsam_model_catalog
SET is_active = 0,
    is_degraded = 1,
    degraded_reason = 'legacy_anthropic_retired_phase1',
    updated_at = unixepoch()
WHERE provider = 'anthropic'
  AND model_key NOT IN ('anthropic_haiku_4_5', 'anthropic_sonnet_4_6', 'anthropic_opus_4_7');

UPDATE agentsam_ai
SET status = 'deprecated',
    show_in_picker = 0,
    picker_eligible = 0,
    updated_at = unixepoch()
WHERE provider = 'anthropic'
  AND model_key IN (
    'claude-haiku-4.5',
    'claude-haiku-3.5',
    'claude-sonnet-4.5',
    'claude-sonnet-4.6',
    'claude-sonnet-3.7',
    'claude-sonnet-3.5',
    'claude-opus-4.1',
    'claude-opus-4.5',
    'claude-opus-4.6'
  );

UPDATE agentsam_ai
SET show_in_picker = 0,
    picker_eligible = 0,
    requires_human_approval = 1,
    updated_at = unixepoch()
WHERE model_key = 'claude-opus-4-7'
  AND mode = 'model';

UPDATE agentsam_routing_arms
SET is_paused = 1,
    is_eligible = 0,
    pause_reason = 'legacy_anthropic_retired_phase1',
    updated_at = unixepoch()
WHERE provider = 'anthropic'
  AND model_key NOT IN ('anthropic_haiku_4_5', 'anthropic_sonnet_4_6', 'anthropic_opus_4_7');

-- ═══════════════════════════════════════════════════════════════
-- 1. agentsam_model_catalog — three active Anthropic models
-- cost_notes: role_key;normal_routing;requires_approval;fallback_allowed;subagent_type
-- ═══════════════════════════════════════════════════════════════

INSERT INTO agentsam_model_catalog (
  id, model_key, display_name, provider, tier,
  anthropic_model_id, api_platform,
  context_window, max_output_tokens,
  cost_per_1k_in, cost_per_1k_out,
  supports_tools, supports_vision, supports_streaming, supports_json_mode, supports_reasoning,
  reasoning_effort, is_active, is_degraded, budget_exhausted,
  cost_notes, updated_at
) VALUES
(
  'mdl_anthropic_haiku_4_5',
  'anthropic_haiku_4_5',
  'Claude Haiku 4.5 (Scout)',
  'anthropic',
  'micro',
  'claude-haiku-4-5-20251001',
  'anthropic',
  200000,
  8192,
  0.0008,
  0.004,
  1, 1, 1, 1, 0,
  'low',
  1, 0, 0,
  'role_key=anthropic_scout;subagent_type=scout;normal_routing=1;requires_approval=0;fallback_allowed=1;cost_policy=cheap;api_platform_label=anthropic_messages',
  unixepoch()
),
(
  'mdl_anthropic_sonnet_4_6',
  'anthropic_sonnet_4_6',
  'Claude Sonnet 4.6 (Builder)',
  'anthropic',
  'standard',
  'claude-sonnet-4-6',
  'anthropic',
  1000000,
  128000,
  0.003,
  0.015,
  1, 1, 1, 1, 1,
  'medium',
  1, 0, 0,
  'role_key=anthropic_builder;subagent_type=builder;normal_routing=1;requires_approval=0;fallback_allowed=1;cost_policy=controlled;api_platform_label=anthropic_messages',
  unixepoch()
),
(
  'mdl_anthropic_opus_4_7',
  'anthropic_opus_4_7',
  'Claude Opus 4.7 (Boss Reviewer)',
  'anthropic',
  'reasoning',
  'claude-opus-4-7',
  'anthropic',
  200000,
  32000,
  0.015,
  0.075,
  1, 1, 1, 1, 1,
  'high',
  1, 0, 0,
  'role_key=anthropic_boss_reviewer;subagent_type=reviewer;normal_routing=0;requires_approval=1;fallback_allowed=0;cost_policy=extreme;api_platform_label=anthropic_messages',
  unixepoch()
)
ON CONFLICT(model_key) DO UPDATE SET
  display_name = excluded.display_name,
  provider = excluded.provider,
  tier = excluded.tier,
  anthropic_model_id = excluded.anthropic_model_id,
  api_platform = excluded.api_platform,
  context_window = excluded.context_window,
  max_output_tokens = excluded.max_output_tokens,
  cost_per_1k_in = excluded.cost_per_1k_in,
  cost_per_1k_out = excluded.cost_per_1k_out,
  supports_tools = excluded.supports_tools,
  supports_vision = excluded.supports_vision,
  supports_streaming = excluded.supports_streaming,
  supports_json_mode = excluded.supports_json_mode,
  supports_reasoning = excluded.supports_reasoning,
  reasoning_effort = excluded.reasoning_effort,
  is_active = 1,
  is_degraded = 0,
  degraded_reason = NULL,
  cost_notes = excluded.cost_notes,
  updated_at = unixepoch();

-- ═══════════════════════════════════════════════════════════════
-- 2. agentsam_ai — picker + policy (logical model_key = catalog)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, show_in_picker, picker_eligible,
  requires_human_approval, sort_order, picker_group, is_global,
  updated_at
)
SELECT
  'ai_anthropic_haiku_4_5_scout',
  '',
  'Anthropic Haiku 4.5 Scout',
  'anthropic_scout',
  'Cheap classification, triage, summaries — pre-routing only.',
  'active',
  'model',
  'anthropic_haiku_4_5',
  'anthropic',
  'anthropic',
  1,
  1,
  0,
  15,
  'ANTHROPIC_SCOUT',
  1,
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'anthropic_haiku_4_5' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, show_in_picker, picker_eligible,
  requires_human_approval, sort_order, picker_group, is_global,
  updated_at
)
SELECT
  'ai_anthropic_sonnet_4_6_builder',
  '',
  'Anthropic Sonnet 4.6 Builder',
  'anthropic_builder',
  'Primary Anthropic production agent — code, tools, long context.',
  'active',
  'model',
  'anthropic_sonnet_4_6',
  'anthropic',
  'anthropic',
  1,
  1,
  0,
  25,
  'ANTHROPIC_BUILDER',
  1,
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'anthropic_sonnet_4_6' AND mode = 'model');

INSERT INTO agentsam_ai (
  id, tenant_id, name, role_name, description, status, mode,
  model_key, provider, api_platform, show_in_picker, picker_eligible,
  requires_human_approval, sort_order, picker_group, is_global,
  updated_at
)
SELECT
  'ai_anthropic_opus_4_7_boss',
  '',
  'Anthropic Opus 4.7 Boss',
  'anthropic_boss_reviewer',
  'Owner-gated premium review only — never Auto fallback.',
  'active',
  'model',
  'anthropic_opus_4_7',
  'anthropic',
  'anthropic',
  0,
  0,
  1,
  99,
  'ANTHROPIC_BOSS',
  1,
  unixepoch()
WHERE NOT EXISTS (SELECT 1 FROM agentsam_ai WHERE model_key = 'anthropic_opus_4_7' AND mode = 'model');

UPDATE agentsam_ai SET
  status = 'active',
  show_in_picker = 1,
  picker_eligible = 1,
  requires_human_approval = 0,
  role_name = 'anthropic_scout',
  picker_group = 'ANTHROPIC_SCOUT',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5' AND mode = 'model';

UPDATE agentsam_ai SET
  status = 'active',
  show_in_picker = 1,
  picker_eligible = 1,
  requires_human_approval = 0,
  role_name = 'anthropic_builder',
  picker_group = 'ANTHROPIC_BUILDER',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_sonnet_4_6' AND mode = 'model';

UPDATE agentsam_ai SET
  status = 'active',
  show_in_picker = 0,
  picker_eligible = 0,
  requires_human_approval = 1,
  role_name = 'anthropic_boss_reviewer',
  picker_group = 'ANTHROPIC_BOSS',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_opus_4_7' AND mode = 'model';

-- Keep legacy API-id picker rows active for explicit manual picks (not Thompson auto on deprecated arms)
UPDATE agentsam_ai SET
  show_in_picker = 1,
  picker_eligible = 1,
  requires_human_approval = 0,
  status = 'active',
  updated_at = unixepoch()
WHERE model_key IN ('claude-haiku-4-5-20251001', 'claude-sonnet-4-6')
  AND mode = 'model';

-- ═══════════════════════════════════════════════════════════════
-- 3. agentsam_routing_arms — ws_inneranimalmedia (Thompson training workspace)
-- success_alpha/beta = 1.0 per migration 351 clean priors
-- ═══════════════════════════════════════════════════════════════

-- Scout (Haiku) — high priority on cheap task_types
INSERT OR REPLACE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  workflow_agent, tools_json, reasoning_effort,
  model_catalog_id, pause_reason, last_decay_at, updated_at
) VALUES
('ra_ws_scout_intent_class', 'intent_classification', 'auto', 'anthropic_haiku_4_5', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.85, 1, 0, 1, 0, 1, 220, 0, 'anthropic_scout', '["d1_query","context_search"]', 'low', 'mdl_anthropic_haiku_4_5', NULL, unixepoch(), unixepoch()),
('ra_ws_scout_task_detect', 'task_type_detection', 'auto', 'anthropic_haiku_4_5', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.85, 1, 0, 1, 0, 1, 220, 0, 'anthropic_scout', '["d1_query"]', 'low', 'mdl_anthropic_haiku_4_5', NULL, unixepoch(), unixepoch()),
('ra_ws_scout_tool_prefilter', 'tool_prefilter', 'agent', 'anthropic_haiku_4_5', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.82, 1, 0, 1, 0, 1, 210, 0, 'anthropic_scout', '["d1_query","tool_knowledge_search"]', 'low', 'mdl_anthropic_haiku_4_5', NULL, unixepoch(), unixepoch()),
('ra_ws_scout_cheap_summary', 'cheap_summary', 'ask', 'anthropic_haiku_4_5', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.80, 1, 0, 1, 0, 0, 200, 0, 'anthropic_scout', '["context_search"]', 'low', 'mdl_anthropic_haiku_4_5', NULL, unixepoch(), unixepoch()),
('ra_ws_scout_file_triage', 'file_relevance_triage', 'agent', 'anthropic_haiku_4_5', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.80, 1, 0, 1, 0, 1, 200, 0, 'anthropic_scout', '["workspace_search","workspace_read_file"]', 'low', 'mdl_anthropic_haiku_4_5', NULL, unixepoch(), unixepoch()),
('ra_ws_scout_sse_label', 'sse_state_labeling', 'auto', 'anthropic_haiku_4_5', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.78, 1, 0, 1, 0, 0, 190, 0, 'anthropic_scout', '[]', 'low', 'mdl_anthropic_haiku_4_5', NULL, unixepoch(), unixepoch());

-- Builder (Sonnet) — production task_types
INSERT OR REPLACE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  workflow_agent, tools_json, reasoning_effort,
  model_catalog_id, pause_reason, last_decay_at, updated_at
) VALUES
('ra_ws_build_code_patch', 'agentic_code_patch', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.88, 1, 0, 1, 0, 1, 180, 0, 'anthropic_builder',
 '["d1_query","tool_knowledge_search","workspace_read_file","workspace_search","terminal_execute"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_cf_worker', 'cloudflare_worker_debug', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.88, 1, 0, 1, 0, 1, 175, 0, 'anthropic_builder',
 '["d1_query","workspace_read_file","workspace_search","terminal_execute"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_db_schema', 'database_schema_reasoning', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.86, 1, 0, 1, 0, 1, 170, 0, 'anthropic_builder', '["d1_query"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_long_ctx', 'long_context_repo_reasoning', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.90, 1, 0, 1, 0, 1, 185, 0, 'anthropic_builder',
 '["workspace_read_file","workspace_search","d1_query"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_wf_plan', 'workflow_plan_generation', 'plan', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.84, 1, 0, 1, 0, 1, 165, 0, 'anthropic_builder', '["d1_query","knowledge_search"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_tool_chain', 'tool_chain_planning', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.84, 1, 0, 1, 0, 1, 165, 0, 'anthropic_builder', '["d1_query","tool_knowledge_search"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_d1_supa', 'supabase_d1_alignment', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.86, 1, 0, 1, 0, 1, 170, 0, 'anthropic_builder', '["d1_query"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_chat', 'chat', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.82, 1, 0, 1, 0, 1, 160, 0, 'anthropic_builder',
 '["d1_query","tool_knowledge_search","workspace_read_file","workspace_search","terminal_execute"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch()),
('ra_ws_build_code_route', 'code', 'agent', 'anthropic_sonnet_4_6', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.88, 1, 0, 1, 0, 1, 180, 0, 'anthropic_builder',
 '["workspace_read_file","workspace_search","terminal_execute","d1_query"]', 'medium', 'mdl_anthropic_sonnet_4_6', NULL, unixepoch(), unixepoch());

-- Boss (Opus) — NOT auto-routed: is_eligible=0, is_paused=1; explicit task_type pin + approval only
INSERT OR REPLACE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  workflow_agent, tools_json, reasoning_effort,
  model_catalog_id, pause_reason, fallback_model_key, last_decay_at, updated_at
) VALUES
('ra_ws_boss_owner_check', 'owner_approved_boss_check', 'agent', 'anthropic_opus_4_7', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.0, 0, 1, 1, 0, 1, 10, 0, 'anthropic_boss_reviewer', '["d1_query"]', 'high', 'mdl_anthropic_opus_4_7', 'owner_gated_not_auto_route', NULL, unixepoch(), unixepoch()),
('ra_ws_boss_predeploy', 'final_predeploy_sanity_check', 'agent', 'anthropic_opus_4_7', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.0, 0, 1, 1, 0, 1, 10, 0, 'anthropic_boss_reviewer', '["d1_query"]', 'high', 'mdl_anthropic_opus_4_7', 'owner_gated_not_auto_route', NULL, unixepoch(), unixepoch()),
('ra_ws_boss_security', 'security_sensitive_review', 'agent', 'anthropic_opus_4_7', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.0, 0, 1, 1, 0, 0, 10, 0, 'anthropic_boss_reviewer', '[]', 'high', 'mdl_anthropic_opus_4_7', 'owner_gated_not_auto_route', NULL, unixepoch(), unixepoch()),
('ra_ws_boss_migration', 'migration_approval_review', 'agent', 'anthropic_opus_4_7', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.0, 0, 1, 1, 0, 1, 10, 0, 'anthropic_boss_reviewer', '["d1_query"]', 'high', 'mdl_anthropic_opus_4_7', 'owner_gated_not_auto_route', NULL, unixepoch(), unixepoch()),
('ra_ws_boss_high_risk', 'high_risk_review', 'agent', 'anthropic_opus_4_7', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.0, 0, 1, 1, 0, 1, 10, 0, 'anthropic_boss_reviewer', '[]', 'high', 'mdl_anthropic_opus_4_7', 'owner_gated_not_auto_route', NULL, unixepoch(), unixepoch()),
('ra_ws_boss_arbitration', 'multi_agent_arbitration', 'agent', 'anthropic_opus_4_7', 'anthropic', 'ws_inneranimalmedia',
 1.0, 1.0, 0.0, 0, 1, 1, 0, 1, 10, 0, 'anthropic_boss_reviewer', '[]', 'high', 'mdl_anthropic_opus_4_7', 'owner_gated_not_auto_route', NULL, unixepoch(), unixepoch());

-- ═══════════════════════════════════════════════════════════════
-- 4. Platform-global subagent profiles (Quickstart + MCP gallery)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO agentsam_subagent_profile (
  id, user_id, workspace_id, tenant_id, slug, display_name, description,
  instructions_markdown, allowed_tool_globs, default_model_id, is_active, is_platform_global,
  sort_order, agent_type, output_schema_json, created_at, updated_at
) VALUES
(
  'qs_anthropic_scout',
  'platform', '', '',
  'anthropic-scout',
  'Anthropic Scout (Haiku 4.5)',
  'Pre-routing classification, triage, and cheap JSON — protects budget before Sonnet/others run.',
  'You are the Anthropic Scout. Classify task_type, estimate risk, list required tools, and recommend routing lane. Output compact JSON only. Do not implement patches.',
  '["read","glob","grep"]',
  'anthropic_haiku_4_5',
  1, 1, 5, 'scout',
  '{"quickstart":{"task_type":"intent_classification","route_key":"chat","model_hint":"anthropic_haiku_4_5"},"anthropic_team":{"role_key":"anthropic_scout","model_key":"anthropic_haiku_4_5","normal_routing":true}}',
  datetime('now'), datetime('now')
),
(
  'qs_anthropic_builder',
  'platform', '', '',
  'anthropic-builder',
  'Anthropic Builder (Sonnet 4.6)',
  'Primary Anthropic production agent for code, Worker debug, D1/Supabase alignment, and tool workflows.',
  'Quickstart: Anthropic Builder (Sonnet 4.6). Implement or debug in this repo with full tool access. Capture tokens, latency, and routing_arm_id on ws_inneranimalmedia.',
  '["read","write","glob","grep","terminal"]',
  'anthropic_sonnet_4_6',
  1, 1, 6, 'builder',
  '{"quickstart":{"task_type":"agentic_code_patch","route_key":"code","model_hint":"anthropic_sonnet_4_6","quickstart_batch":"anthropic_smoketest_quickstart"},"anthropic_team":{"role_key":"anthropic_builder","model_key":"anthropic_sonnet_4_6","normal_routing":true}}',
  datetime('now'), datetime('now')
),
(
  'qs_anthropic_boss',
  'platform', '', '',
  'anthropic-boss',
  'Anthropic Boss (Opus 4.7)',
  'Owner-gated premium review only. Never used as Auto fallback.',
  'Boss review: compressed facts in, decision + risks + exact next steps out. Require explicit owner approval before running.',
  '["read"]',
  'anthropic_opus_4_7',
  1, 1, 99, 'reviewer',
  '{"quickstart":{"task_type":"owner_approved_boss_check","route_key":"deploy_validation","model_hint":"anthropic_opus_4_7"},"anthropic_team":{"role_key":"anthropic_boss_reviewer","model_key":"anthropic_opus_4_7","normal_routing":false,"requires_approval":true}}',
  datetime('now'), datetime('now')
)
ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
  display_name = excluded.display_name,
  description = excluded.description,
  instructions_markdown = excluded.instructions_markdown,
  default_model_id = excluded.default_model_id,
  is_active = excluded.is_active,
  is_platform_global = excluded.is_platform_global,
  sort_order = excluded.sort_order,
  agent_type = excluded.agent_type,
  output_schema_json = excluded.output_schema_json,
  updated_at = datetime('now');

-- ═══════════════════════════════════════════════════════════════
-- 5. Eval suites (phase-1 regression harness for test agents)
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO agentsam_eval_suites (
  id, tenant_id, name, description, provider, mode, task_type, is_active, created_by
) VALUES
(
  'evs_anthropic_phase1_scout',
  'tenant_sam_primeaux',
  'Anthropic Phase-1 — Scout (Haiku)',
  'Classification, triage, cheap JSON. Model: anthropic_haiku_4_5 → API claude-haiku-4-5-20251001.',
  'anthropic',
  'auto',
  'intent_classification',
  1,
  'migration_353'
),
(
  'evs_anthropic_phase1_builder',
  'tenant_sam_primeaux',
  'Anthropic Phase-1 — Builder (Sonnet)',
  'Production coding + tool workflows on ws_inneranimalmedia. Model: anthropic_sonnet_4_6.',
  'anthropic',
  'agent',
  'agentic_code_patch',
  1,
  'migration_353'
),
(
  'evs_anthropic_phase1_boss',
  'tenant_sam_primeaux',
  'Anthropic Phase-1 — Boss (Opus, gated)',
  'Manual/approval-only boss reviews. Model: anthropic_opus_4_7. Never Auto route.',
  'anthropic',
  'agent',
  'owner_approved_boss_check',
  1,
  'migration_353'
);

INSERT OR IGNORE INTO agentsam_eval_cases (
  id, suite_id, tenant_id, input_prompt, expected_output, grading_criteria, tags, sort_order
) VALUES
(
  'evc_scout_intent_deploy',
  'evs_anthropic_phase1_scout',
  'tenant_sam_primeaux',
  'Classify: "Fix dashboard chunk 404 after deploy" — return JSON with task_type, mode, risk_level, tools_required.',
  '{"task_type":"deploy","mode":"agent","risk_level":"medium","tools_required":true}',
  'JSON valid; task_type mentions deploy; risk_level medium or high',
  '["scout","intent","deploy"]',
  10
),
(
  'evc_builder_worker_health',
  'evs_anthropic_phase1_builder',
  'tenant_sam_primeaux',
  'Explain how to verify Worker + dashboard deploy success without health-only false positive. List exact curl checks.',
  'health plus dashboard chunk 200',
  'Mentions /health AND dashboard static assets or R2 chunks; rejects health-only',
  '["builder","deploy","cloudflare"]',
  10
),
(
  'evc_boss_migration_gate',
  'evs_anthropic_phase1_boss',
  'tenant_sam_primeaux',
  'Review: migration adds auth_users.tenant_id NOT NULL without backfill. Approve or block with reasons.',
  'block',
  'Must flag missing backfill or tenant scope risk; structured decision',
  '["boss","migration","security"]',
  10
);
