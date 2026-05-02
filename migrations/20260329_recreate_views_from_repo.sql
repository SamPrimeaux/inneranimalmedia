-- Restore views whose CREATE VIEW text exists in this repo (audit 2026-03-29).
-- Sources: migrations/158_mcp_tool_drift_view.sql, migrations/153_context_mem_mcp.sql (section 6).
-- project_quality_summary was recreated by migrations/20260329_fix_quality_checks_constraint.sql — do not duplicate here.
--
-- ~51 other views were dropped in the quality_checks migration; their definitions are NOT
-- in migrations/. Restore from a pre-2026-03-29 D1 export or Cloudflare backup if needed.
-- Worker.js grep: no runtime dependency on v_* names for core chat/deploy paths.
--
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/20260329_recreate_views_from_repo.sql

CREATE VIEW IF NOT EXISTS v_mcp_tool_drift AS
SELECT
  t.tool_name,
  t.tool_category,
  t.enabled,
  t.mcp_service_url,
  COALESCE(c.call_count, 0) AS total_calls,
  COALESCE(c.last_called, 'never') AS last_called,
  CASE
    WHEN COALESCE(c.call_count, 0) > 0 THEN 'active'
    WHEN t.enabled = 1 THEN 'registered_unused'
    ELSE 'disabled'
  END AS status
FROM mcp_registered_tools t
LEFT JOIN (
  SELECT
    tool_name,
    COUNT(*) AS call_count,
    MAX(created_at) AS last_called
  FROM mcp_tool_calls
  GROUP BY tool_name
) c ON c.tool_name = t.tool_name;

CREATE VIEW IF NOT EXISTS v_context_optimization_savings AS
SELECT
  DATE(created_at, 'unixepoch') AS date,
  COUNT(*) AS optimized_calls,
  SUM(original_input_tokens) AS original_tokens,
  SUM(input_tokens) AS optimized_tokens,
  SUM(tokens_saved) AS total_tokens_saved,
  ROUND(AVG(CAST(tokens_saved AS REAL) / NULLIF(original_input_tokens, 0) * 100), 2) AS avg_reduction_pct,
  SUM(cost_saved_usd) AS total_cost_saved_usd,
  model_used
FROM agent_telemetry
WHERE optimization_applied IS NOT NULL
GROUP BY DATE(created_at, 'unixepoch'), model_used;
