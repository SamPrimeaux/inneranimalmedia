-- 167: worker_analytics_errors — 5xx / error path logging from worker (jsonResponse + top-level fetch catch).
-- Apply when ready: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/167_worker_analytics_errors.sql

CREATE TABLE IF NOT EXISTS worker_analytics_errors (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER NOT NULL DEFAULT 500,
  error_message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_worker_analytics_errors_created ON worker_analytics_errors(created_at DESC);
