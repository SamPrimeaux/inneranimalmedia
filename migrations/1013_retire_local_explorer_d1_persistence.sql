-- 1013: Local Explorer is browser-only — remove sentinel + borrowed agent-state rows.
-- Folder open/recent is IndexedDB handle + localStorage name. agentsam_workspace /
-- agentsam_workspace_state are for curated product workspaces and live agent sessions.

DELETE FROM agentsam_workspace_state
WHERE id LIKE 'uws:%'
   OR workspace_type = 'local_explorer'
   OR workspace_id = 'ws_local_explorer';

DELETE FROM agentsam_workspace WHERE id = 'ws_local_explorer';
DELETE FROM workspaces WHERE id = 'ws_local_explorer';

-- Restore full 1:1 uniqueness (partial uws: exception no longer needed)
DROP INDEX IF EXISTS uidx_agentsam_workspace_state_workspace;
CREATE UNIQUE INDEX uidx_agentsam_workspace_state_workspace
  ON agentsam_workspace_state(workspace_id);
