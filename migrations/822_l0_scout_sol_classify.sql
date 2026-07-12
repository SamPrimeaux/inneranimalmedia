-- 822: L0 Scout — intent_classification primary = gpt-5.6-sol (2026-07-11)
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/822_l0_scout_sol_classify.sql

INSERT OR REPLACE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  workflow_agent, tools_json, reasoning_effort,
  model_catalog_id, pause_reason, last_decay_at, updated_at
) VALUES (
  'ra_l0_scout_sol_intent',
  'intent_classification',
  'auto',
  'gpt-5.6-sol',
  'openai',
  'ws_inneranimalmedia',
  1.0, 1.0, 0.90,
  1, 0, 1, 0,
  1, 250, 0,
  'l0_scout',
  '["d1_query","context_search"]',
  'medium',
  'mdl_gpt56_sol',
  NULL,
  unixepoch(),
  unixepoch()
);

-- Fallback only — not primary
UPDATE agentsam_routing_arms SET
  priority = 150,
  updated_at = unixepoch()
WHERE id = 'ra_gpt56luna_gate'
  AND task_type = 'gate';

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  workflow_agent, tools_json, reasoning_effort,
  model_catalog_id, pause_reason, last_decay_at, updated_at
)
SELECT
  'ra_l0_scout_luna_intent_fallback',
  'intent_classification',
  'auto',
  'gpt-5.6-luna',
  'openai',
  'ws_inneranimalmedia',
  1.0, 1.0, 0.75,
  1, 0, 1, 0,
  1, 150, 0,
  'l0_scout',
  '["d1_query","context_search"]',
  'low',
  (SELECT id FROM agentsam_model_catalog WHERE model_key = 'gpt-5.6-luna' LIMIT 1),
  NULL,
  unixepoch(),
  unixepoch()
WHERE EXISTS (SELECT 1 FROM agentsam_model_catalog WHERE model_key = 'gpt-5.6-luna');

UPDATE agentsam_routing_arms SET
  is_paused = 1,
  pause_reason = 'l0_scout_sol_primary_2026-07-11',
  updated_at = unixepoch()
WHERE task_type = 'intent_classification'
  AND mode = 'auto'
  AND model_key NOT IN ('gpt-5.6-sol', 'gpt-5.6-luna')
  AND COALESCE(is_paused, 0) = 0;
