-- 140: CI/DI workflow run history (autorag sync, post-merge, cron, etc.)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/140_ci_di_workflow_runs.sql
-- Purpose: Record workflow runs (e.g. autorag_sync from post-merge hook or cron) for audit and dashboard.

CREATE TABLE IF NOT EXISTS ci_di_workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  details_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ci_di_workflow_runs_workflow_triggered ON ci_di_workflow_runs(workflow_name, triggered_at DESC);

-- workflow_name: e.g. 'autorag_sync', 'deploy', 'overnight'
-- trigger_type: e.g. 'post-merge', 'cron', 'manual', 'api'
-- status: 'running', 'success', 'failure'
