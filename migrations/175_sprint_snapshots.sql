-- 175: Weekly sprint snapshot rollup (baseline + schema).
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/175_sprint_snapshots.sql
--
-- Populated by a Sunday 00:00 UTC cron (worker) in a follow-up; this migration creates the table
-- and seeds one baseline row from live tables where they exist.

CREATE TABLE IF NOT EXISTS sprint_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  week_number INTEGER,
  cursor_replacement_pct REAL,
  roadmap_steps_complete INTEGER,
  roadmap_steps_total INTEGER,
  total_chats INTEGER,
  total_messages INTEGER,
  ai_spend_usd REAL,
  deploys_this_week INTEGER,
  deploy_failures INTEGER,
  outages INTEGER,
  total_retention_purged INTEGER,
  db_size_bytes INTEGER,
  deep_work_hours REAL,
  burnout_risk TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sprint_snapshots_date ON sprint_snapshots(snapshot_date DESC);

-- Baseline (idempotent). Adjust plan_id if your roadmap plan slug differs.
INSERT OR IGNORE INTO sprint_snapshots (
  id,
  snapshot_date,
  week_number,
  roadmap_steps_complete,
  roadmap_steps_total,
  total_chats,
  total_messages,
  ai_spend_usd,
  deploys_this_week,
  deploy_failures,
  outages,
  total_retention_purged,
  db_size_bytes,
  deep_work_hours,
  burnout_risk,
  cursor_replacement_pct,
  notes
)
SELECT
  'snap_baseline_2026_03_25',
  date('now'),
  cast(strftime('%W', 'now') AS integer),
  (SELECT COUNT(*) FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' AND lower(trim(COALESCE(status, ''))) IN ('completed', 'done')),
  (SELECT COUNT(*) FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1'),
  (SELECT COUNT(DISTINCT conversation_id) FROM agentsam_agent_run),
  (SELECT COUNT(*) FROM agentsam_agent_run),
  (SELECT COALESCE(SUM(metric_value), 0) FROM agent_telemetry WHERE typeof(created_at) = 'integer' AND created_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER)),
  (SELECT COUNT(*) FROM deployments WHERE created_at >= (strftime('%s', 'now') - 604800)),
  (SELECT COUNT(*) FROM deployments WHERE created_at >= (strftime('%s', 'now') - 604800) AND lower(trim(COALESCE(status, ''))) NOT IN ('success', 'ok', '')),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'Migration 175 baseline; cursor_replacement_pct / outages / retention / founder fields to be filled by weekly job. agent_telemetry.metric_value summed as ai_spend_usd proxy if populated.';
