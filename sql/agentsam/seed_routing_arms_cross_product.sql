-- Cross-product seed: agentsam_routing_arms rows for one workspace from agentsam_ai catalog.
-- workspace_id set for production seed (wrangler d1 execute ... --file).
-- Eligible models: active model rows; adjust WHERE to match agentsam_model_catalog rules after backfill.

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, workspace_id, task_type, mode, model_key, provider,
  success_alpha, success_beta, is_active, is_eligible, is_paused,
  decayed_score, updated_at
)
SELECT
  'ra_' || lower(hex(randomblob(8))),
  'ws_inneranimalmedia',
  d.task_type,
  d.mode,
  m.model_key,
  COALESCE(m.provider, 'unknown'),
  1.0,
  1.0,
  1,
  1,
  0,
  0.5,
  unixepoch()
FROM agentsam_ai m
CROSS JOIN (
  SELECT 'chat' AS task_type, 'auto' AS mode UNION ALL
  SELECT 'chat', 'agent' UNION ALL
  SELECT 'chat', 'ask' UNION ALL
  SELECT 'chat', 'plan' UNION ALL
  SELECT 'chat', 'debug' UNION ALL
  SELECT 'code/build', 'agent' UNION ALL
  SELECT 'code/debug', 'agent' UNION ALL
  SELECT 'plan', 'plan' UNION ALL
  SELECT 'deploy', 'agent' UNION ALL
  SELECT 'sql_d1_generation', 'agent' UNION ALL
  SELECT 'summary', 'auto' UNION ALL
  SELECT 'rag_query', 'auto' UNION ALL
  SELECT 'tool_use', 'agent'
) d
WHERE m.status = 'active'
  AND m.mode = 'model'
  AND COALESCE(trim(m.model_key), '') != ''
  AND COALESCE(m.picker_eligible, 1) = 1;
