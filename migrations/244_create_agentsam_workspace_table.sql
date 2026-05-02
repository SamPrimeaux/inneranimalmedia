-- 244: Create agentsam_workspace table to satisfy FK references.
-- Some legacy tables reference agentsam_workspace(workspace_id); newer schema uses workspaces/tenant_workspaces.
-- This migration creates a minimal compatibility table to avoid broken foreign keys.

CREATE TABLE IF NOT EXISTS agentsam_workspace (
  workspace_id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO agentsam_workspace (workspace_id, display_name)
VALUES ('ws_inneranimalmedia', 'Inner Animal Media');

