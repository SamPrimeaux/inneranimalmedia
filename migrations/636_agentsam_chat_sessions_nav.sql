-- 636: Chat session nav — star, project link, message_count, archive + orphan run cleanup.
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/636_agentsam_chat_sessions_nav.sql

ALTER TABLE agentsam_chat_sessions ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agentsam_chat_sessions ADD COLUMN project_id TEXT;
ALTER TABLE agentsam_chat_sessions ADD COLUMN message_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agentsam_chat_sessions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_starred
  ON agentsam_chat_sessions (tenant_id, user_id, is_starred, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_project
  ON agentsam_chat_sessions (project_id) WHERE project_id IS NOT NULL AND trim(project_id) != '';

-- Orphan agent runs (no chat_sessions row) are ignored by GET /api/agent/sessions — UI lists chat_sessions only.
-- Hard DELETE hits FK children in prod; mark abandoned instead of deleting.
UPDATE agentsam_agent_run
SET status = 'cancelled',
    conversation_id = NULL,
    completed_at = COALESCE(completed_at, datetime('now'))
WHERE conversation_id IS NOT NULL
  AND trim(conversation_id) != ''
  AND conversation_id NOT IN (SELECT conversation_id FROM agentsam_chat_sessions)
  AND status NOT IN ('running', 'queued', 'pending_handoff', 'cancelled');
