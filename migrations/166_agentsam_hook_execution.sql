-- Hook run history for Settings Hooks tab (execution_count / last_ran_at on GET /api/agentsam/hooks)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/166_agentsam_hook_execution.sql

CREATE TABLE IF NOT EXISTS agentsam_hook_execution (
  id TEXT PRIMARY KEY,
  hook_id TEXT NOT NULL,
  ran_at INTEGER NOT NULL DEFAULT (unixepoch()),
  status TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_hook_ran
  ON agentsam_hook_execution(hook_id, ran_at DESC);
