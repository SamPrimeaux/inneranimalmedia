-- 164_agentsam_skill.sql — agentsam_skill for dashboard Skills CRUD (inneranimalmedia-business)
-- Run if table does not exist yet:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/164_agentsam_skill.sql

CREATE TABLE IF NOT EXISTS agentsam_skill (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'user',
  workspace_id TEXT,
  content_markdown TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agentsam_skill_user_name
  ON agentsam_skill(user_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_agentsam_skill_workspace
  ON agentsam_skill(workspace_id);
