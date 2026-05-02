CREATE TABLE IF NOT EXISTS deployments_weekly_rollup (
  id TEXT PRIMARY KEY DEFAULT ('dwk_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  total_deploys INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  per_worker_json TEXT DEFAULT '{}',
  top_triggered_by TEXT,
  notes TEXT,
  rolled_up_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, week_start)
);

