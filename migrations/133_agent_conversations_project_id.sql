-- 133: Add project_id to agent_conversations (conversation-project link for "Add to Project")
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/133_agent_conversations_project_id.sql
-- If column already exists, SQLite returns "duplicate column name"; safe to ignore.

ALTER TABLE agent_conversations ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_project ON agent_conversations(project_id);
