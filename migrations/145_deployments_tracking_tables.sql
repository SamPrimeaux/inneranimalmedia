-- Deployment tracking: deployments, deployment_changes, work_sessions, activity_signals
-- Database: inneranimalmedia-business (D1)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/145_deployments_tracking_tables.sql

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  version TEXT NOT NULL,
  git_hash TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  deployed_by TEXT,
  environment TEXT NOT NULL DEFAULT 'production',
  duration_seconds INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_deployments_timestamp ON deployments(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_deployments_environment ON deployments(environment);

CREATE TABLE IF NOT EXISTS deployment_changes (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL,
  file_path TEXT,
  change_type TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (deployment_id) REFERENCES deployments(id)
);

CREATE INDEX IF NOT EXISTS idx_deployment_changes_deployment_id ON deployment_changes(deployment_id);

CREATE TABLE IF NOT EXISTS work_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS activity_signals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  signal_type TEXT,
  payload_json TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
