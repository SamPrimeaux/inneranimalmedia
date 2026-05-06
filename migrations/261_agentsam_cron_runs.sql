-- 261: Add agentsam_cron_runs ledger (safe/additive).
-- Apply only after review:
--   npx wrangler d1 execute inneranimalmedia-business --remote -c ./wrangler.production.toml --file migrations/261_agentsam_cron_runs.sql
--
-- Verify:
--   npx wrangler d1 execute inneranimalmedia-business --remote -c ./wrangler.production.toml --command "
--   PRAGMA table_info(agentsam_cron_runs);
--   PRAGMA index_list(agentsam_cron_runs);
--   "

CREATE TABLE IF NOT EXISTS agentsam_cron_runs (
  id TEXT PRIMARY KEY DEFAULT ('acr_' || lower(hex(randomblob(8)))),
  job_name TEXT NOT NULL,
  cron_expression TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','skipped')),
  tenant_id TEXT,
  workspace_id TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  duration_ms INTEGER,
  rows_read INTEGER DEFAULT 0,
  rows_written INTEGER DEFAULT 0,
  error_message TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_cron_runs_job_started
ON agentsam_cron_runs(job_name, started_at);

CREATE INDEX IF NOT EXISTS idx_agentsam_cron_runs_scope_started
ON agentsam_cron_runs(tenant_id, workspace_id, started_at);

CREATE INDEX IF NOT EXISTS idx_agentsam_cron_runs_status_started
ON agentsam_cron_runs(status, started_at);

