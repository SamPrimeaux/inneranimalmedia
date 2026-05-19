-- Link slash-command runs to agentsam_agent_run (run spine parity with chat SSE).

ALTER TABLE agentsam_command_run ADD COLUMN agent_run_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_command_run_agent_run ON agentsam_command_run(agent_run_id) WHERE agent_run_id IS NOT NULL;
