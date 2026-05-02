-- 132: Add is_starred and index for agent_conversations (starred/favorites)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/132_agent_conversations_starred.sql

ALTER TABLE agent_conversations ADD COLUMN is_starred INTEGER DEFAULT 0;
CREATE INDEX idx_conversations_starred ON agent_conversations(user_id, is_starred, updated_at DESC);
