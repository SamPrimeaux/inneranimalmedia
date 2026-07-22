-- 997: agentsam_data_quality_snapshots — offline profiler append-only store
-- Additive / non-fatal: profiler failures must never mutate production app tables.
-- Companion copy lives in inneranimalmedia-ml/migrations/ (Python job owner).

CREATE TABLE IF NOT EXISTS agentsam_data_quality_snapshots (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  app_key         TEXT NOT NULL,
  database_name   TEXT,
  database_id     TEXT NOT NULL,
  table_name      TEXT NOT NULL,
  column_name     TEXT NOT NULL,
  metric          TEXT NOT NULL,
  metric_value    REAL,
  metric_detail   TEXT,
  row_count       INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_dq_snap_run
  ON agentsam_data_quality_snapshots (run_id);

CREATE INDEX IF NOT EXISTS idx_dq_snap_table_metric
  ON agentsam_data_quality_snapshots (app_key, table_name, column_name, metric, created_at);

CREATE INDEX IF NOT EXISTS idx_dq_snap_created
  ON agentsam_data_quality_snapshots (created_at);
