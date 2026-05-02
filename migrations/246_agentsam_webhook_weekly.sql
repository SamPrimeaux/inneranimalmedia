CREATE TABLE IF NOT EXISTS agentsam_webhook_weekly (
  id TEXT PRIMARY KEY DEFAULT ('aww_' || lower(hex(randomblob(8)))),
  tenant_id TEXT NOT NULL DEFAULT 'tenant_sam_primeaux',
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  total_events INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  per_source_json TEXT DEFAULT '{}',
  per_event_type_json TEXT DEFAULT '{}',
  rolled_up_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, week_start)
);

