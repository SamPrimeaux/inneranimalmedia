-- 998: Persist PTY lane pin for an agent run (fs_* write/read same host).
-- In-memory runContext is rebuilt per tool dispatch — pin cannot live on that object alone.
-- First writer wins (INSERT OR IGNORE). Scoped by agent_run_id.

CREATE TABLE IF NOT EXISTS agentsam_pty_lane_pin (
  agent_run_id   TEXT PRIMARY KEY,
  connection_id  TEXT NOT NULL,
  target_type    TEXT,
  workspace_id   TEXT,
  user_id        TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pty_lane_pin_ws_created
  ON agentsam_pty_lane_pin (workspace_id, created_at);
