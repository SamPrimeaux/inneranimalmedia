-- Registry of runnable scripts for Agent Sam discovery (D1 inneranimalmedia-business).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/283_agentsam_scripts_registry.sql

CREATE TABLE IF NOT EXISTS agentsam_scripts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'ws_inneranimalmedia',
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('deploy','build','test','ingest','benchmark','maintenance','dev','dangerous','audit')),
  runner TEXT NOT NULL DEFAULT 'npm' CHECK(runner IN ('npm','bash','node','python','sql','wrangler')),
  requires_env INTEGER NOT NULL DEFAULT 1,
  owner_only INTEGER NOT NULL DEFAULT 1,
  safe_to_run INTEGER NOT NULL DEFAULT 1,
  run_before TEXT,
  run_after TEXT,
  never_run_with TEXT,
  preferred_for TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_agentsam_scripts_workspace_path
ON agentsam_scripts(workspace_id, path);
