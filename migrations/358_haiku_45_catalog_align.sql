-- 358: Align anthropic_haiku_4_5 with Claude Haiku 4.5 product sheet
-- API: claude-haiku-4-5-20251001 | 200k ctx | 64k max output | $1/$5 MTok
-- Capabilities: tools, vision, JSON, adaptive thinking, prompt cache — NO code execution, NO effort controls
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/358_haiku_45_catalog_align.sql

UPDATE agentsam_model_catalog SET
  display_name = 'Claude Haiku 4.5 (Scout)',
  anthropic_model_id = 'claude-haiku-4-5-20251001',
  context_window = 200000,
  max_output_tokens = 64000,
  cost_per_1k_in = 0.001,
  cost_per_1k_out = 0.005,
  supports_tools = 1,
  supports_vision = 1,
  supports_streaming = 1,
  supports_json_mode = 1,
  supports_reasoning = 1,
  reasoning_effort = NULL,
  supports_code_execution = 0,
  supports_compaction = 0,
  supports_effort_scaling = 0,
  thinking_policy = 'adaptive_only',
  routing_lane = 'scout',
  cost_notes = 'role_key=anthropic_scout;routing_lane=scout;api=claude-haiku-4-5-20251001;max_context=200000;max_output=64000;supports_code_execution=0;supports_effort=0;thinking_policy=adaptive_only;pricing_mtok_in=1;pricing_mtok_out=5',
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5';

UPDATE agentsam_ai SET
  context_max_tokens = 200000,
  output_max_tokens = 64000,
  thinking_mode = 'adaptive',
  effort = NULL,
  features_json = '{"role":"scout","compaction":false,"anthropic_code_execution":false,"thinking_policy":"adaptive_only","routing_lane":"scout","supports_effort_scaling":false,"prompt_caching":true}',
  updated_at = unixepoch()
WHERE model_key IN ('anthropic_haiku_4_5', 'claude-haiku-4-5-20251001') AND mode = 'model';

UPDATE agentsam_routing_arms SET
  reasoning_effort = NULL,
  updated_at = unixepoch()
WHERE model_key = 'anthropic_haiku_4_5';
