-- Backfill agentsam_execution_performance_metrics (last 30 days).
-- Safe to re-run: ON CONFLICT upserts by natural key.
-- source_table 'mixed' = agent runs + command runs without selected_command_id (FK-safe).

-- Agent runs → mixed / model_key
INSERT INTO agentsam_execution_performance_metrics (
  id, tenant_id, workspace_id, metric_date, metric_grain, source_table,
  model_key, intent_category,
  execution_count, success_count, failure_count, timeout_count,
  avg_duration_ms, min_duration_ms, max_duration_ms,
  total_tokens_consumed, input_tokens, output_tokens,
  total_cost_usd, avg_cost_usd, total_cost_cents,
  success_rate_percent, failure_rate_percent,
  sla_breach_count, sla_breach_rate_percent,
  last_computed_at
)
SELECT
  'epm_' || lower(hex(randomblob(8))),
  COALESCE(NULLIF(trim(ar.tenant_id), ''), 'platform'),
  COALESCE(ar.workspace_id, ''),
  date(ar.created_at),
  'daily',
  'mixed',
  COALESCE(ar.model_id, ''),
  COALESCE(ar.task_type, ''),
  COUNT(*),
  SUM(CASE WHEN ar.status = 'completed' THEN 1 ELSE 0 END),
  SUM(CASE WHEN ar.status = 'failed' THEN 1 ELSE 0 END),
  SUM(COALESCE(ar.timed_out, 0)),
  ROUND(AVG(
    CASE WHEN ar.completed_at IS NOT NULL AND ar.started_at IS NOT NULL
      THEN (julianday(ar.completed_at) - julianday(ar.started_at)) * 86400000
      ELSE NULL END
  )),
  CAST(MIN(
    CASE WHEN ar.completed_at IS NOT NULL AND ar.started_at IS NOT NULL
      THEN (julianday(ar.completed_at) - julianday(ar.started_at)) * 86400000
      ELSE NULL END
  ) AS INTEGER),
  CAST(MAX(
    CASE WHEN ar.completed_at IS NOT NULL AND ar.started_at IS NOT NULL
      THEN (julianday(ar.completed_at) - julianday(ar.started_at)) * 86400000
      ELSE NULL END
  ) AS INTEGER),
  SUM(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)),
  SUM(COALESCE(ar.input_tokens, 0)),
  SUM(COALESCE(ar.output_tokens, 0)),
  ROUND(SUM(COALESCE(ar.cost_usd, 0)), 6),
  ROUND(AVG(COALESCE(ar.cost_usd, 0)), 6),
  ROUND(SUM(COALESCE(ar.cost_usd, 0)) * 100, 4),
  ROUND(100.0 * SUM(CASE WHEN ar.status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2),
  ROUND(100.0 * SUM(CASE WHEN ar.status = 'failed' THEN 1 ELSE 0 END) / COUNT(*), 2),
  SUM(COALESCE(ar.sla_breach, 0)),
  ROUND(100.0 * SUM(COALESCE(ar.sla_breach, 0)) / COUNT(*), 2),
  unixepoch()
FROM agentsam_agent_run ar
WHERE date(ar.created_at) >= date('now', '-30 days')
GROUP BY
  COALESCE(NULLIF(trim(ar.tenant_id), ''), 'platform'),
  COALESCE(ar.workspace_id, ''),
  date(ar.created_at),
  COALESCE(ar.model_id, ''),
  COALESCE(ar.task_type, '')
ON CONFLICT(
  tenant_id, workspace_id, metric_date, metric_grain, source_table,
  command_id, command_slug, tool_name, tool_category, workflow_id,
  task_type, intent_category, model_key, provider, trigger_key
) DO UPDATE SET
  execution_count = excluded.execution_count,
  success_count = excluded.success_count,
  failure_count = excluded.failure_count,
  timeout_count = excluded.timeout_count,
  avg_duration_ms = excluded.avg_duration_ms,
  min_duration_ms = excluded.min_duration_ms,
  max_duration_ms = excluded.max_duration_ms,
  total_tokens_consumed = excluded.total_tokens_consumed,
  input_tokens = excluded.input_tokens,
  output_tokens = excluded.output_tokens,
  total_cost_usd = excluded.total_cost_usd,
  avg_cost_usd = excluded.avg_cost_usd,
  total_cost_cents = excluded.total_cost_cents,
  success_rate_percent = excluded.success_rate_percent,
  failure_rate_percent = excluded.failure_rate_percent,
  sla_breach_count = excluded.sla_breach_count,
  sla_breach_rate_percent = excluded.sla_breach_rate_percent,
  last_computed_at = unixepoch();

-- Command runs without selected_command_id → mixed / model_key + intent
INSERT INTO agentsam_execution_performance_metrics (
  id, tenant_id, workspace_id, metric_date, metric_grain, source_table,
  model_key, intent_category,
  execution_count, success_count, failure_count,
  avg_duration_ms, min_duration_ms, max_duration_ms,
  total_tokens_consumed, total_cost_usd, avg_cost_usd, total_cost_cents,
  success_rate_percent, failure_rate_percent,
  last_computed_at
)
SELECT
  'epm_' || lower(hex(randomblob(8))),
  COALESCE(NULLIF(trim(w.tenant_id), ''), 'platform'),
  acr.workspace_id,
  date(datetime(acr.created_at, 'unixepoch')),
  'daily',
  'mixed',
  COALESCE(acr.model_id, ''),
  COALESCE(acr.intent_category, acr.normalized_intent, ''),
  COUNT(*),
  SUM(CASE WHEN acr.success = 1 THEN 1 ELSE 0 END),
  SUM(CASE WHEN acr.success = 0 THEN 1 ELSE 0 END),
  ROUND(AVG(acr.duration_ms)),
  MIN(acr.duration_ms),
  MAX(acr.duration_ms),
  SUM(COALESCE(acr.input_tokens, 0) + COALESCE(acr.output_tokens, 0)),
  ROUND(SUM(COALESCE(acr.cost_usd, 0)), 6),
  ROUND(AVG(COALESCE(acr.cost_usd, 0)), 6),
  ROUND(SUM(COALESCE(acr.cost_usd, 0)) * 100, 4),
  ROUND(100.0 * SUM(CASE WHEN acr.success = 1 THEN 1 ELSE 0 END) / COUNT(*), 2),
  ROUND(100.0 * SUM(CASE WHEN acr.success = 0 THEN 1 ELSE 0 END) / COUNT(*), 2),
  unixepoch()
FROM agentsam_command_run acr
INNER JOIN agentsam_workspace w ON w.id = acr.workspace_id
WHERE acr.selected_command_id IS NULL
  AND datetime(acr.created_at, 'unixepoch') >= date('now', '-30 days')
GROUP BY
  COALESCE(NULLIF(trim(w.tenant_id), ''), 'platform'),
  acr.workspace_id,
  date(datetime(acr.created_at, 'unixepoch')),
  COALESCE(acr.model_id, ''),
  COALESCE(acr.intent_category, acr.normalized_intent, '')
ON CONFLICT(
  tenant_id, workspace_id, metric_date, metric_grain, source_table,
  command_id, command_slug, tool_name, tool_category, workflow_id,
  task_type, intent_category, model_key, provider, trigger_key
) DO UPDATE SET
  execution_count = excluded.execution_count,
  success_count = excluded.success_count,
  failure_count = excluded.failure_count,
  avg_duration_ms = excluded.avg_duration_ms,
  min_duration_ms = excluded.min_duration_ms,
  max_duration_ms = excluded.max_duration_ms,
  total_tokens_consumed = excluded.total_tokens_consumed,
  total_cost_usd = excluded.total_cost_usd,
  avg_cost_usd = excluded.avg_cost_usd,
  total_cost_cents = excluded.total_cost_cents,
  success_rate_percent = excluded.success_rate_percent,
  failure_rate_percent = excluded.failure_rate_percent,
  last_computed_at = unixepoch();
