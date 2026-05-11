-- Execution audit trail for agentsam_scripts (every invoke should insert/update a row).
-- Requires agentsam_scripts (see migrations/283_agentsam_scripts_registry.sql).
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/295_agentsam_script_runs.sql

CREATE TABLE IF NOT EXISTS agentsam_script_runs (
  id              TEXT PRIMARY KEY DEFAULT ('sr_' || lower(hex(randomblob(8)))),
  script_id       TEXT NOT NULL REFERENCES agentsam_scripts(id),
  workspace_id    TEXT NOT NULL,
  triggered_by    TEXT NOT NULL DEFAULT 'agent',
  trigger_source  TEXT NOT NULL DEFAULT 'agent_sam'
    CHECK(trigger_source IN ('agent_sam','cursor','manual','github_push','scheduled','cicd')),
  cicd_run_id     TEXT,
  git_commit_sha  TEXT,
  git_branch      TEXT DEFAULT 'main',
  environment     TEXT NOT NULL DEFAULT 'production'
    CHECK(environment IN ('production','sandbox','staging','dev')),
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','passed','failed','skipped','cancelled')),
  exit_code       INTEGER,
  duration_ms     INTEGER,
  output_summary  TEXT,
  error_message   TEXT,
  cost_usd        REAL DEFAULT 0,
  started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_agentsam_script_runs_workspace_started
  ON agentsam_script_runs(workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_script_runs_script_started
  ON agentsam_script_runs(script_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_script_runs_status_started
  ON agentsam_script_runs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_script_runs_trigger_source
  ON agentsam_script_runs(trigger_source, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_script_runs_cicd
  ON agentsam_script_runs(cicd_run_id)
  WHERE cicd_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_script_runs_git_sha
  ON agentsam_script_runs(git_commit_sha)
  WHERE git_commit_sha IS NOT NULL;
