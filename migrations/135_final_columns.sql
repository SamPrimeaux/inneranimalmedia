-- 135 final: conversation_id and last_activity already exist; add tool_calls_count, index, mcp_services.last_used

ALTER TABLE mcp_agent_sessions ADD COLUMN tool_calls_count INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_agent_sessions_conversation_id ON mcp_agent_sessions(conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE mcp_services ADD COLUMN last_used TEXT;
