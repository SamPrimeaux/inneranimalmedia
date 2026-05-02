-- 125: Add name column to agent_conversations for auto-name and rename (chat naming)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/125_agent_conversations_name.sql
-- If column already exists, SQLite returns "duplicate column name"; safe to ignore.

ALTER TABLE agent_conversations ADD COLUMN name TEXT;
