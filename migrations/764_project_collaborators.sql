-- 764: Per-project collaborators for share + stress-test collab lane.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/764_project_collaborators.sql

CREATE TABLE IF NOT EXISTS project_collaborators (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  tenant_id       TEXT NOT NULL,
  workspace_id    TEXT,
  email           TEXT NOT NULL,
  user_id         TEXT,
  role            TEXT NOT NULL DEFAULT 'editor',
  invited_by      TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_project_collaborators_project
  ON project_collaborators (project_id);

CREATE INDEX IF NOT EXISTS idx_project_collaborators_email
  ON project_collaborators (email);
