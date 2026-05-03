-- 250: IAM default workspace — model + primary subagent pointers on agentsam_workspace
-- Safe to run once per environment (ALTER may error if columns already exist; re-run only UPDATE portion if needed).

ALTER TABLE agentsam_workspace ADD COLUMN default_model_id TEXT;
ALTER TABLE agentsam_workspace ADD COLUMN primary_subagent_id TEXT;
ALTER TABLE agentsam_workspace ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch());

UPDATE agentsam_workspace
SET
  default_model_id = 'claude-haiku-4-5-20251001',
  primary_subagent_id = 'asp_agent_sam',
  updated_at = unixepoch()
WHERE workspace_id = 'ws_inneranimalmedia';
