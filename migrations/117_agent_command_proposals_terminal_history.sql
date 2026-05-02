-- 117: Terminal audit — agent_command_proposals, terminal_history (Run in terminal approval trail)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/117_agent_command_proposals_terminal_history.sql
-- Purpose: When user clicks "Run in terminal", worker INSERTs here before sending to PTY so agents have audit trail and memory.

CREATE TABLE IF NOT EXISTS agent_command_proposals (
  id TEXT PRIMARY KEY,
  command_text TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_command_proposals_session ON agent_command_proposals(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_command_proposals_status_created ON agent_command_proposals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS terminal_history (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  content TEXT NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'user',
  session_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_terminal_history_session_created ON terminal_history(session_id, created_at DESC);
