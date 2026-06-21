-- Migration 658: Telemetry purge + rollup consolidation
-- Drops ~27,000 rows of raw log noise, keeps meaningful signal.

-- ── 1. agentsam_cron_runs ────────────────────────────────────────────────────
-- Keep only last 3 days of raw rows. Nightly rollup into agentsam_usage_rollups_daily
-- means we don't need individual run history beyond recent debugging window.
DELETE FROM agentsam_cron_runs
WHERE started_at < unixepoch('now', '-3 days');

-- ── 2. agentsam_performance_eto_events ──────────────────────────────────────
-- 94% never applied to Thompson. Roll up what's useful into agentsam_usage_rollups_daily
-- then purge. Keep last 2 days for any in-flight ETO pipeline runs.
INSERT OR REPLACE INTO agentsam_usage_rollups_daily (
  tenant_id, workspace_id, day,
  ai_calls, tokens_in, tokens_out, cost_usd,
  tool_calls, tool_successes, tool_failures,
  mcp_calls, error_count,
  provider_breakdown_json, top_tools_json,
  rollup_source, rolled_up_at
)
SELECT
  tenant_id,
  workspace_id,
  DATE(created_at) as day,
  SUM(CASE WHEN task_type NOT IN ('tool_call','tool_use') AND input_tokens > 0 THEN 1 ELSE 0 END) as ai_calls,
  SUM(input_tokens) as tokens_in,
  SUM(output_tokens) as tokens_out,
  ROUND(SUM(cost_usd), 6) as cost_usd,
  SUM(CASE WHEN task_type IN ('tool_call','tool_use') THEN 1 ELSE 0 END) as tool_calls,
  SUM(CASE WHEN task_type IN ('tool_call','tool_use') AND success = 1 THEN 1 ELSE 0 END) as tool_successes,
  SUM(CASE WHEN task_type IN ('tool_call','tool_use') AND failure = 1 THEN 1 ELSE 0 END) as tool_failures,
  0 as mcp_calls,
  SUM(failure) as error_count,
  '{"source":"eto_events"}' as provider_breakdown_json,
  '[]' as top_tools_json,
  'eto_rollup_migration658' as rollup_source,
  unixepoch() as rolled_up_at
FROM agentsam_performance_eto_events
WHERE DATE(created_at) < DATE('now', '-2 days')
  AND workspace_id IS NOT NULL
GROUP BY tenant_id, workspace_id, DATE(created_at)
HAVING SUM(success) > 0 OR SUM(cost_usd) > 0;

DELETE FROM agentsam_performance_eto_events
WHERE created_at < datetime('now', '-2 days');

-- ── 3. mcp_audit_log ────────────────────────────────────────────────────────
-- Route errors to agentsam_error_log before dropping.
-- tool_stats_compacted already has per-tool success/failure/latency aggregates.
-- agentsam_usage_rollups_daily.top_tools_json has daily top-tool counts.
-- Raw audit rows add nothing queryable that isn't already rolled up.
INSERT OR IGNORE INTO agentsam_error_log (
  id, workspace_id, tenant_id,
  error_type, error_message, source, source_id,
  context_json, created_at
)
SELECT
  'err_mcp_' || id,
  workspace_id,
  tenant_id,
  'mcp_tool_error',
  error_message,
  'mcp_audit_log',
  CAST(id as TEXT),
  json_object('tool_name', tool_name, 'latency_ms', latency_ms),
  created_at
FROM mcp_audit_log
WHERE status = 'error'
  AND error_message IS NOT NULL
  AND error_message != '';

DROP TABLE IF EXISTS mcp_audit_log;
