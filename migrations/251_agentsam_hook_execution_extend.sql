-- Extend agentsam_hook_execution for webhook hook runs, CICD hooks, audit/telemetry, and Settings UI.
-- Supersedes the minimal shape from 166_agentsam_hook_execution.sql for production parity with Worker/API INSERTs.
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/251_agentsam_hook_execution_extend.sql

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE agentsam_hook_execution__new (
  id TEXT PRIMARY KEY NOT NULL,
  hook_id TEXT,
  subscription_id TEXT,
  webhook_event_id TEXT,
  tenant_id TEXT,
  user_id TEXT,
  actor_role_id TEXT,
  attempt INTEGER DEFAULT 1,
  status TEXT,
  event_type TEXT,
  message TEXT,
  metadata_json TEXT,
  run_id TEXT,
  result_json TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT,
  completed_at TEXT,
  ran_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER DEFAULT (unixepoch()),
  output TEXT,
  error_detail TEXT
);

INSERT INTO agentsam_hook_execution__new (
  id, hook_id, ran_at, status, error_message, created_at
)
SELECT
  id,
  hook_id,
  ran_at,
  status,
  error_message,
  COALESCE(ran_at, unixepoch())
FROM agentsam_hook_execution;

DROP TABLE agentsam_hook_execution;
ALTER TABLE agentsam_hook_execution__new RENAME TO agentsam_hook_execution;

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_hook_ran
  ON agentsam_hook_execution(hook_id, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_created_at
  ON agentsam_hook_execution(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_tenant
  ON agentsam_hook_execution(tenant_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_user
  ON agentsam_hook_execution(user_id, ran_at DESC);

COMMIT;

PRAGMA foreign_keys = ON;
