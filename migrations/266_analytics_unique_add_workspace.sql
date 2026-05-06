PRAGMA foreign_keys = OFF;

CREATE TABLE agentsam_analytics_new (
  id                            TEXT    PRIMARY KEY DEFAULT ('aan_' || lower(hex(randomblob(8)))),
  tenant_id                     TEXT    NOT NULL,
  period                        TEXT    NOT NULL CHECK(period IN ('session','daily','weekly','monthly','alltime')),
  period_date                   TEXT,
  top_tool                      TEXT,
  top_tool_calls                INTEGER DEFAULT 0,
  most_failed_tool              TEXT,
  most_failed_tool_failure_rate REAL    DEFAULT 0,
  total_tool_calls              INTEGER DEFAULT 0,
  total_tool_successes          INTEGER DEFAULT 0,
  total_tool_failures           INTEGER DEFAULT 0,
  overall_tool_success_rate     REAL    DEFAULT 0,
  top_model                     TEXT,
  top_model_sessions            INTEGER DEFAULT 0,
  top_provider                  TEXT,
  total_sessions                INTEGER DEFAULT 0,
  total_input_tokens            INTEGER DEFAULT 0,
  total_output_tokens           INTEGER DEFAULT 0,
  total_cache_tokens            INTEGER DEFAULT 0,
  total_cost_usd                REAL    DEFAULT 0,
  avg_cost_per_session          REAL    DEFAULT 0,
  avg_tokens_per_session        REAL    DEFAULT 0,
  cache_hit_rate                REAL    DEFAULT 0,
  cache_savings_usd             REAL    DEFAULT 0,
  tool_reliability_json         TEXT    DEFAULT '{}',
  model_breakdown_json          TEXT    DEFAULT '{}',
  broken_tools_json             TEXT    DEFAULT '[]',
  healthy_tools_json            TEXT    DEFAULT '[]',
  most_common_intent            TEXT,
  avg_session_length_turns      REAL    DEFAULT 0,
  computed_at                   INTEGER NOT NULL DEFAULT (unixepoch()),
  data_from                     INTEGER,
  data_to                       INTEGER,
  row_count_source              INTEGER DEFAULT 0,
  notes                         TEXT,
  workspace_id                  TEXT,
  sla_breaches                  INTEGER DEFAULT 0,
  timed_out_calls               INTEGER DEFAULT 0,
  time_tracked_seconds          INTEGER DEFAULT 0,
  UNIQUE(tenant_id, workspace_id, period, period_date)
);

INSERT INTO agentsam_analytics_new SELECT
  id, tenant_id, period, period_date,
  top_tool, top_tool_calls, most_failed_tool, most_failed_tool_failure_rate,
  total_tool_calls, total_tool_successes, total_tool_failures, overall_tool_success_rate,
  top_model, top_model_sessions, top_provider, total_sessions,
  total_input_tokens, total_output_tokens, total_cache_tokens, total_cost_usd,
  avg_cost_per_session, avg_tokens_per_session, cache_hit_rate, cache_savings_usd,
  tool_reliability_json, model_breakdown_json, broken_tools_json, healthy_tools_json,
  most_common_intent, avg_session_length_turns,
  computed_at, data_from, data_to, row_count_source, notes,
  workspace_id, sla_breaches, timed_out_calls, time_tracked_seconds
FROM agentsam_analytics;

DROP TABLE agentsam_analytics;
ALTER TABLE agentsam_analytics_new RENAME TO agentsam_analytics;

CREATE INDEX idx_aan_computed        ON agentsam_analytics(computed_at);
CREATE INDEX idx_aan_period_date     ON agentsam_analytics(period_date);
CREATE INDEX idx_aan_tenant_period   ON agentsam_analytics(tenant_id, period);
CREATE INDEX idx_analytics_workspace ON agentsam_analytics(workspace_id, tenant_id, period);

PRAGMA foreign_keys = ON;
