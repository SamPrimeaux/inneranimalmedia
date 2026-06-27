-- Agent home atmospheric scene preferences (CSS / WebGL layer stack JSON).
-- Served by GET/PUT /api/agent/scene — see CURSOR_BACKEND_BRIEF.md Phase 1.

CREATE TABLE IF NOT EXISTS agent_home_scene (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  scene_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_home_scene_user
  ON agent_home_scene (user_id);

CREATE INDEX IF NOT EXISTS idx_agent_home_scene_ws
  ON agent_home_scene (workspace_id);
