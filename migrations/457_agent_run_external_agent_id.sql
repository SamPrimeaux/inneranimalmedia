-- Cursor cloud agent id (bc-*) for cross-system traceability
ALTER TABLE agentsam_agent_run ADD COLUMN external_agent_id TEXT DEFAULT NULL;
