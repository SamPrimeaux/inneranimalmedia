-- Migration 162: Panel column for MCP dashboard agent identity (D1-safe: no inline CHECK)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/162_mcp_agent_sessions_panel.sql

ALTER TABLE mcp_agent_sessions ADD COLUMN panel TEXT;

UPDATE mcp_agent_sessions SET panel = 'agent_sam' WHERE panel IS NULL;
