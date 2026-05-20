-- 355: Anthropic smoketest — catalog dispatch + scout quickstart route hint
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/355_anthropic_smoketest_routing_fixes.sql

-- Gemini models: dispatch expects gemini_api (not google_ai)
UPDATE agentsam_model_catalog
SET api_platform = 'gemini_api',
    updated_at = unixepoch()
WHERE lower(trim(COALESCE(api_platform, ''))) = 'google_ai'
  AND is_active = 1;

UPDATE agentsam_ai
SET api_platform = 'gemini',
    updated_at = unixepoch()
WHERE lower(trim(COALESCE(api_platform, ''))) IN ('google_ai', 'google')
  AND status = 'active'
  AND mode = 'model';

-- FK: agentsam_route_requirements.route_key -> agentsam_prompt_routes.route_key
INSERT OR IGNORE INTO agentsam_prompt_routes (
  route_key,
  display_name,
  intent_labels,
  command_categories,
  trigger_keywords,
  prompt_layer_keys,
  tool_categories,
  tool_keys,
  max_tools,
  preferred_model,
  fallback_model,
  include_rag,
  include_active_plan,
  include_recent_memory,
  memory_limit,
  include_workspace_ctx,
  token_budget,
  is_active,
  priority,
  tenant_id
)
VALUES (
  'intent_classification',
  'Intent classification (scout)',
  '["intent_classification","classify","triage"]',
  '["chat"]',
  '["classify","intent","triage"]',
  '["core_identity"]',
  '[]',
  '[]',
  0,
  'anthropic_haiku_4_5',
  NULL,
  0,
  0,
  0,
  0,
  0,
  2000,
  1,
  50,
  ''
);

INSERT INTO agentsam_route_requirements (
  route_key,
  task_type,
  mode,
  requires_tools,
  requires_vision,
  requires_json_mode,
  requires_streaming,
  preferred_tier,
  max_tier,
  budget_priority,
  preferred_providers,
  blocked_providers,
  allowed_lanes_json,
  required_capability_keys_json,
  optional_capability_keys_json,
  blocked_capability_keys_json,
  approval_policy_json,
  max_tools,
  is_active
)
SELECT
  'intent_classification',
  'intent_classification',
  'default',
  0,
  0,
  1,
  0,
  'micro',
  'standard',
  'cost',
  '["anthropic"]',
  '[]',
  '["think"]',
  '[]',
  '[]',
  '["worker.deploy","terminal.execute"]',
  '{"default":"allow","read":"allow"}',
  0,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_route_requirements WHERE route_key = 'intent_classification'
);

UPDATE agentsam_subagent_profile
SET output_schema_json = json_set(
  COALESCE(output_schema_json, '{}'),
  '$.quickstart.route_key',
  'intent_classification'
),
updated_at = datetime('now')
WHERE id = 'qs_anthropic_scout';
