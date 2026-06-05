-- 562: Session titling metadata for Agent Sam chat (replaces missing agent_conversations for display).
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/562_agentsam_chat_sessions.sql

CREATE TABLE IF NOT EXISTS agentsam_chat_sessions (
  conversation_id TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  workspace_id    TEXT,
  title           TEXT NOT NULL,
  github_repo     TEXT,
  model_key       TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user
  ON agentsam_chat_sessions (tenant_id, user_id, created_at DESC);
