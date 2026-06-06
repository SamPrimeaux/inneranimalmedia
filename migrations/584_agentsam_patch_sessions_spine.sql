-- agentsam_patch_sessions ↔ agentsam_agent_run + change_sets spine (idempotent)

ALTER TABLE agentsam_patch_sessions ADD COLUMN workspace_id TEXT;
ALTER TABLE agentsam_patch_sessions ADD COLUMN tenant_id TEXT;
ALTER TABLE agentsam_patch_sessions ADD COLUMN change_set_id TEXT;
ALTER TABLE agentsam_patch_sessions ADD COLUMN conversation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agentsam_patch_sessions_agent_run
  ON agentsam_patch_sessions(agent_run_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_patch_sessions_change_set
  ON agentsam_patch_sessions(change_set_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_patch_sessions_workspace
  ON agentsam_patch_sessions(workspace_id, created_at DESC);
