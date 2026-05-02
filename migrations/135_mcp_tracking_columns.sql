-- 135: MCP tracking columns (agent sessions + services)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/135_mcp_tracking_columns.sql
-- Purpose: Link mcp_agent_sessions to conversation_id; track last_used on mcp_services.

-- mcp_agent_sessions: link to chat conversation and track activity
ALTER TABLE mcp_agent_sessions ADD COLUMN conversation_id TEXT;
ALTER TABLE mcp_agent_sessions ADD COLUMN last_activity TEXT;
ALTER TABLE mcp_agent_sessions ADD COLUMN tool_calls_count INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_agent_sessions_conversation_id ON mcp_agent_sessions(conversation_id) WHERE conversation_id IS NOT NULL;

-- mcp_services: last time the service was used (for health/activity)
ALTER TABLE mcp_services ADD COLUMN last_used TEXT;
