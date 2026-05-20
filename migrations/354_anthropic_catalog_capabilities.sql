-- 354: Encode real Anthropic API capabilities in agentsam_model_catalog + sync agentsam_ai.
-- Haiku: 200k, no code_execution, no compaction, no effort scaling.
-- Sonnet 4.6: 1M ctx, compaction, effort, thinking enabled+adaptive.
-- Opus 4.7: 1M ctx, compaction, effort, adaptive thinking only (never type=enabled).
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/354_anthropic_catalog_capabilities.sql

ALTER TABLE agentsam_model_catalog ADD COLUMN supports_code_execution INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_model_catalog ADD COLUMN supports_compaction INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_model_catalog ADD COLUMN supports_effort_scaling INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_model_catalog ADD COLUMN thinking_policy TEXT NOT NULL DEFAULT 'omitted';
ALTER TABLE agentsam_model_catalog ADD COLUMN routing_lane TEXT NOT NULL DEFAULT 'unknown';

-- ─── Haiku scout ───
UPDATE agentsam_model_catalog SET
  display_name = 'Claude Haiku 4.5 (Scout)',
  context_window = 200000,
  max_output_tokens = 8192,
  supports_tools = 1,
  supports_vision = 1,
  supports_streaming = 1,
  supports_json_mode = 1,
  supports_reasoning = 0,
  reasoning_effort = NULL,
  supports_code_execution = 0,
  supports_compaction = 0,
  supports_effort_scaling = 0,
  thinking_policy = 'omitted',
  routing_lane = 'scout',
  cost_notes = 'role_key=anthropic_scout;routing_lane=scout;subagent_type=scout;normal_routing=1;requires_approval=0;max_context=200000;supports_code_execution=0;supports_compaction=0;supports_effort=0;thinking_policy=omitted;api=claude-haiku-4-5-20251001',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5';

-- ─── Sonnet workhorse ───
UPDATE agentsam_model_catalog SET
  display_name = 'Claude Sonnet 4.6 (Workhorse)',
  context_window = 1000000,
  max_output_tokens = 128000,
  supports_tools = 1,
  supports_vision = 1,
  supports_streaming = 1,
  supports_json_mode = 1,
  supports_reasoning = 1,
  reasoning_effort = 'medium',
  supports_code_execution = 1,
  supports_compaction = 1,
  supports_effort_scaling = 1,
  thinking_policy = 'adaptive_and_enabled',
  routing_lane = 'workhorse',
  cost_notes = 'role_key=anthropic_builder;routing_lane=workhorse;subagent_type=builder;normal_routing=1;max_context=1000000;supports_code_execution=1;supports_compaction=1;supports_effort=1;thinking_policy=adaptive_and_enabled;api=claude-sonnet-4-6',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_sonnet_4_6';

-- ─── Opus orchestrator / boss ───
UPDATE agentsam_model_catalog SET
  display_name = 'Claude Opus 4.7 (Orchestrator)',
  context_window = 1000000,
  max_output_tokens = 128000,
  supports_tools = 1,
  supports_vision = 1,
  supports_streaming = 1,
  supports_json_mode = 1,
  supports_reasoning = 1,
  reasoning_effort = 'medium',
  supports_code_execution = 1,
  supports_compaction = 1,
  supports_effort_scaling = 1,
  thinking_policy = 'adaptive_only',
  routing_lane = 'orchestrator',
  cost_notes = 'role_key=anthropic_boss_reviewer;routing_lane=orchestrator;subagent_type=reviewer;normal_routing=0;requires_approval=1;max_context=1000000;supports_code_execution=1;supports_compaction=1;supports_effort=1;thinking_policy=adaptive_only;api=claude-opus-4-7',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_opus_4_7';

-- Haiku scout arms: no heavy tools on builder task types (should not exist); light scout arms stay supports_tools=0 or 1 per task
UPDATE agentsam_routing_arms SET
  supports_tools = 0,
  reasoning_effort = NULL,
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5'
  AND task_type IN (
    'intent_classification', 'task_type_detection', 'cheap_summary', 'sse_state_labeling'
  );

UPDATE agentsam_routing_arms SET
  supports_tools = 1,
  reasoning_effort = NULL,
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5'
  AND task_type IN ('tool_prefilter', 'file_relevance_triage');

-- Builder arms: medium effort
UPDATE agentsam_routing_arms SET
  supports_tools = 1,
  reasoning_effort = 'medium',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_sonnet_4_6';

-- Boss arms: high effort, tools optional
UPDATE agentsam_routing_arms SET
  supports_tools = 1,
  reasoning_effort = 'high',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_opus_4_7';

-- agentsam_ai features_json + thinking_mode (logical + API id keys)
UPDATE agentsam_ai SET
  thinking_mode = 'adaptive',
  effort = NULL,
  features_json = '{"role":"scout","compaction":false,"anthropic_code_execution":false,"thinking_policy":"omitted","routing_lane":"scout","supports_effort_scaling":false}',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_haiku_4_5', 'claude-haiku-4-5-20251001') AND mode = 'model';

UPDATE agentsam_ai SET
  thinking_mode = 'adaptive',
  effort = 'medium',
  features_json = '{"role":"builder","compaction":true,"anthropic_code_execution":true,"thinking_policy":"adaptive_and_enabled","routing_lane":"workhorse","supports_effort_scaling":true}',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_sonnet_4_6', 'claude-sonnet-4-6') AND mode = 'model';

UPDATE agentsam_ai SET
  thinking_mode = 'adaptive',
  effort = 'medium',
  features_json = '{"role":"orchestrator","compaction":true,"anthropic_code_execution":true,"thinking_policy":"adaptive_only","routing_lane":"orchestrator","supports_effort_scaling":true}',
  requires_human_approval = 1,
  show_in_picker = 0,
  picker_eligible = 0,
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_opus_4_7', 'claude-opus-4-7') AND mode = 'model';
