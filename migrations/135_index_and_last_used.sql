-- 135 index + last_used: mcp_agent_sessions columns already exist; add unique index and mcp_services.last_used

CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_agent_sessions_conversation_id ON mcp_agent_sessions(conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE mcp_services ADD COLUMN last_used TEXT;
