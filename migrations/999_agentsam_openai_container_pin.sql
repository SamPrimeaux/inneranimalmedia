-- 999: Persist OpenAI hosted-shell container_id per agent run (container_reference reuse).
-- Companion to agentsam_pty_lane_pin — Job 3 scratch compute, not workspace PTY.

CREATE TABLE IF NOT EXISTS agentsam_openai_container_pin (
  agent_run_id   TEXT PRIMARY KEY,
  container_id   TEXT NOT NULL,
  workspace_id   TEXT,
  user_id        TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_openai_container_pin_ws_created
  ON agentsam_openai_container_pin (workspace_id, created_at);
