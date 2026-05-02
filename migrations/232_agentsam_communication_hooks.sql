-- 232: Agent Sam Communication Hooks
-- Enables tracking of sent iMessages and Emails to handle replies as follow-up actions.

-- SQLite doesn't support ALTER TABLE for constraints, so we recreate the table to expand the triggers.
-- We also add columns for communication state tracking.

CREATE TABLE IF NOT EXISTS agentsam_hook_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'system', -- 'system', 'imessage', 'resend'
  external_id TEXT DEFAULT '',            -- chatGuid or email address
  trigger TEXT NOT NULL,
  command TEXT NOT NULL DEFAULT '',       -- command or target prompt
  target_id TEXT NOT NULL DEFAULT '',    -- sessionId or conversationId
  metadata TEXT DEFAULT '{}',             -- JSON blob for context (original message id, subject, etc)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (trigger IN ('start', 'stop', 'pre_deploy', 'post_deploy', 'pre_commit', 'error', 'imessage_reply', 'email_reply'))
);

-- Copy existing data if it exists
INSERT INTO agentsam_hook_new (id, user_id, workspace_id, trigger, command, is_active, created_at)
SELECT id, user_id, workspace_id, trigger, command, is_active, created_at
FROM agentsam_hook;

DROP TABLE agentsam_hook;
ALTER TABLE agentsam_hook_new RENAME TO agentsam_hook;

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_user_ws
  ON agentsam_hook(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_external_provider
  ON agentsam_hook(external_id, provider);
