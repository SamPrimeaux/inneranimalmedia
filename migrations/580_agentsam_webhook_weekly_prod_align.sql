-- Codify production agentsam_webhook_weekly rollup schema (endpoint + event_type + week_start_unix).
-- Prod may already match; legacy migration 263 tables are reshaped idempotently.

DROP TABLE IF EXISTS agentsam_webhook_weekly__align;

CREATE TABLE agentsam_webhook_weekly__align (
  id TEXT PRIMARY KEY DEFAULT ('whr_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  endpoint_id TEXT NOT NULL DEFAULT '__unknown__',
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  week_start_unix INTEGER NOT NULL,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_processed INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  last_processed_unix INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, workspace_id, endpoint_id, provider, event_type, week_start_unix)
);

INSERT OR IGNORE INTO agentsam_webhook_weekly__align (
  id,
  tenant_id,
  workspace_id,
  endpoint_id,
  provider,
  event_type,
  week_start_unix,
  total_received,
  total_processed,
  total_failed,
  total_cost_usd,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  id,
  tenant_id,
  COALESCE(workspace_id, ''),
  COALESCE(NULLIF(trim(endpoint_id), ''), '__unknown__'),
  provider,
  COALESCE(NULLIF(trim(event_type), ''), '__all__'),
  week_start_unix,
  COALESCE(total_received, 0),
  COALESCE(total_processed, 0),
  COALESCE(total_failed, 0),
  COALESCE(total_cost_usd, 0),
  COALESCE(metadata_json, '{}'),
  COALESCE(created_at, unixepoch()),
  COALESCE(updated_at, unixepoch())
FROM agentsam_webhook_weekly
WHERE week_start_unix IS NOT NULL;

DROP TABLE IF EXISTS agentsam_webhook_weekly;

ALTER TABLE agentsam_webhook_weekly__align RENAME TO agentsam_webhook_weekly;

CREATE INDEX IF NOT EXISTS idx_agentsam_webhook_weekly_week
  ON agentsam_webhook_weekly(week_start_unix DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_webhook_weekly_tenant_week
  ON agentsam_webhook_weekly(tenant_id, week_start_unix DESC);
