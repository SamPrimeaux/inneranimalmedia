-- 265_agentsam_analytics_unique_workspace.sql
-- Restore UNIQUE(tenant_id, workspace_id, period, period_date) so analytics rows are one per workspace per bucket.
-- SQLite cannot ALTER a UNIQUE constraint; rebuild the table.
--
-- Apply remote:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business -c wrangler.production.toml --remote --file migrations/265_agentsam_analytics_unique_workspace.sql
-- -------------------------------------------------------------------

DROP TABLE IF EXISTS agentsam_analytics__new;

CREATE TABLE agentsam_analytics__new (
  id TEXT PRIMARY KEY DEFAULT ('aan_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '__tenant__',
  period TEXT NOT NULL CHECK(period IN ('session','daily','weekly','monthly','alltime')),
  period_date TEXT,

  top_tool TEXT,
  top_tool_calls INTEGER DEFAULT 0,
  most_failed_tool TEXT,
  most_failed_tool_failure_rate REAL DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  total_tool_successes INTEGER DEFAULT 0,
  total_tool_failures INTEGER DEFAULT 0,
  overall_tool_success_rate REAL DEFAULT 0,

  top_model TEXT,
  top_model_sessions INTEGER DEFAULT 0,
  top_provider TEXT,
  total_sessions INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  avg_cost_per_session REAL DEFAULT 0,
  avg_tokens_per_session REAL DEFAULT 0,
  cache_hit_rate REAL DEFAULT 0,
  cache_savings_usd REAL DEFAULT 0,

  tool_reliability_json TEXT DEFAULT '{}',
  model_breakdown_json TEXT DEFAULT '{}',
  broken_tools_json TEXT DEFAULT '[]',
  healthy_tools_json TEXT DEFAULT '[]',

  most_common_intent TEXT,
  avg_session_length_turns REAL DEFAULT 0,

  computed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  data_from INTEGER,
  data_to INTEGER,
  row_count_source INTEGER DEFAULT 0,
  notes TEXT,

  sla_breaches INTEGER DEFAULT 0,
  timed_out_calls INTEGER DEFAULT 0,
  time_tracked_seconds INTEGER DEFAULT 0,

  UNIQUE(tenant_id, workspace_id, period, period_date)
);

-- Deduplicate legacy rows that shared (tenant_id, period, period_date) by keeping the latest computed_at.
WITH normalized AS (
  SELECT
    id,
    tenant_id,
    COALESCE(NULLIF(TRIM(workspace_id), ''), '__tenant__') AS workspace_id,
    period,
    period_date,
    top_tool,
    top_tool_calls,
    most_failed_tool,
    most_failed_tool_failure_rate,
    total_tool_calls,
    total_tool_successes,
    total_tool_failures,
    overall_tool_success_rate,
    top_model,
    top_model_sessions,
    top_provider,
    total_sessions,
    total_input_tokens,
    total_output_tokens,
    total_cache_tokens,
    total_cost_usd,
    avg_cost_per_session,
    avg_tokens_per_session,
    cache_hit_rate,
    cache_savings_usd,
    tool_reliability_json,
    model_breakdown_json,
    broken_tools_json,
    healthy_tools_json,
    most_common_intent,
    avg_session_length_turns,
    computed_at,
    data_from,
    data_to,
    row_count_source,
    notes,
    sla_breaches,
    timed_out_calls,
    time_tracked_seconds
  FROM agentsam_analytics
),
dedup AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, workspace_id, period, period_date
      ORDER BY COALESCE(computed_at, 0) DESC, id
    ) AS rn
  FROM normalized
)
INSERT INTO agentsam_analytics__new (
  id,
  tenant_id,
  workspace_id,
  period,
  period_date,
  top_tool,
  top_tool_calls,
  most_failed_tool,
  most_failed_tool_failure_rate,
  total_tool_calls,
  total_tool_successes,
  total_tool_failures,
  overall_tool_success_rate,
  top_model,
  top_model_sessions,
  top_provider,
  total_sessions,
  total_input_tokens,
  total_output_tokens,
  total_cache_tokens,
  total_cost_usd,
  avg_cost_per_session,
  avg_tokens_per_session,
  cache_hit_rate,
  cache_savings_usd,
  tool_reliability_json,
  model_breakdown_json,
  broken_tools_json,
  healthy_tools_json,
  most_common_intent,
  avg_session_length_turns,
  computed_at,
  data_from,
  data_to,
  row_count_source,
  notes,
  sla_breaches,
  timed_out_calls,
  time_tracked_seconds
)
SELECT
  id,
  tenant_id,
  workspace_id,
  period,
  period_date,
  top_tool,
  top_tool_calls,
  most_failed_tool,
  most_failed_tool_failure_rate,
  total_tool_calls,
  total_tool_successes,
  total_tool_failures,
  overall_tool_success_rate,
  top_model,
  top_model_sessions,
  top_provider,
  total_sessions,
  total_input_tokens,
  total_output_tokens,
  total_cache_tokens,
  total_cost_usd,
  avg_cost_per_session,
  avg_tokens_per_session,
  cache_hit_rate,
  cache_savings_usd,
  tool_reliability_json,
  model_breakdown_json,
  broken_tools_json,
  healthy_tools_json,
  most_common_intent,
  avg_session_length_turns,
  computed_at,
  data_from,
  data_to,
  row_count_source,
  notes,
  sla_breaches,
  timed_out_calls,
  time_tracked_seconds
FROM dedup
WHERE rn = 1;

DROP TABLE agentsam_analytics;

ALTER TABLE agentsam_analytics__new RENAME TO agentsam_analytics;

CREATE INDEX IF NOT EXISTS idx_aan_tenant_workspace_period
  ON agentsam_analytics(tenant_id, workspace_id, period, period_date);

CREATE INDEX IF NOT EXISTS idx_aan_computed
  ON agentsam_analytics(computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_workspace
  ON agentsam_analytics(workspace_id, tenant_id, period);
