-- 122: Add project_id to agent_sessions for project awareness (RAG compact, dashboard)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/122_agent_sessions_project_id.sql

ALTER TABLE agent_sessions ADD COLUMN project_id TEXT DEFAULT 'inneranimalmedia';
