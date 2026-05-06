-- 262_fix_context_optimization_savings_view.sql
-- Repair stale context optimization savings view.
-- Old view referenced agent_telemetry.original_input_tokens, which no longer exists.

DROP VIEW IF EXISTS v_context_optimization_savings;

CREATE VIEW v_context_optimization_savings AS
SELECT
  tenant_id,
  workspace_id,
  user_id,
  person_uuid,
  provider,
  model_key,
  agent_id,
  compaction_strategy,
  date(compacted_at) AS day,
  COUNT(*) AS compaction_count,
  COALESCE(SUM(tokens_before), 0) AS tokens_before,
  COALESCE(SUM(tokens_after), 0) AS tokens_after,
  COALESCE(SUM(tokens_saved), 0) AS tokens_saved,
  CASE
    WHEN COALESCE(SUM(tokens_before), 0) = 0 THEN 0
    ELSE ROUND(CAST(SUM(tokens_saved) AS REAL) / SUM(tokens_before) * 100, 2)
  END AS avg_reduction_pct,
  COALESCE(SUM(cost_saved_usd), 0) AS cost_saved_usd,
  MIN(compacted_at) AS first_compacted_at,
  MAX(compacted_at) AS last_compacted_at
FROM agentsam_compaction_events
GROUP BY
  tenant_id,
  workspace_id,
  user_id,
  person_uuid,
  provider,
  model_key,
  agent_id,
  compaction_strategy,
  date(compacted_at);
