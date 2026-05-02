-- NOTE: agent_sessions.name pre-existed (cid:3), omitted here.
-- Verified via PRAGMA table_info(agent_sessions) on 2026-04-04.
--
-- Apply BEFORE deploying worker:
--   wrangler d1 migrations apply inneranimalmedia-business --config wrangler.production.toml

ALTER TABLE agent_sessions ADD COLUMN r2_key TEXT;
ALTER TABLE agent_messages ADD COLUMN r2_key TEXT;
ALTER TABLE agent_messages ADD COLUMN r2_bucket TEXT
  DEFAULT 'iam-platform';

CREATE INDEX IF NOT EXISTS idx_agent_messages_r2
  ON agent_messages(conversation_id, r2_key);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_r2
  ON agent_sessions(r2_key);
