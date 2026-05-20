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

-- Scout classify: JSON-only lane (no route_key=chat tool-capable gate)
INSERT OR IGNORE INTO agentsam_route_requirements (
  id, route_key, task_type, mode, requires_tools, requires_vision, requires_json_mode,
  preferred_tier, max_tier, budget_priority, is_active, updated_at
) VALUES (
  'req_intent_classification_scout',
  'intent_classification',
  'intent_classification',
  'default',
  0, 0, 1,
  'micro', 'standard', 'cost',
  1, unixepoch()
);

UPDATE agentsam_subagent_profile
SET output_schema_json = json_set(
  COALESCE(output_schema_json, '{}'),
  '$.quickstart.route_key',
  'intent_classification'
),
updated_at = datetime('now')
WHERE id = 'qs_anthropic_scout';
