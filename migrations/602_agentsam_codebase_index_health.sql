-- Weekly codebase pgvector staleness snapshot (git newer than last_reindexed_at).

CREATE TABLE IF NOT EXISTS agentsam_codebase_index_health (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_key TEXT,
  checked_at INTEGER NOT NULL,
  week_start TEXT NOT NULL,
  total_indexed INTEGER NOT NULL DEFAULT 0,
  stale_index_count INTEGER NOT NULL DEFAULT 0,
  stale_files_json TEXT NOT NULL DEFAULT '[]',
  head_sha TEXT,
  repo TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_codebase_index_health_ws
  ON agentsam_codebase_index_health (workspace_id, checked_at DESC);
