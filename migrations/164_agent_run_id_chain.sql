-- Wire agent_run_id + conversation_id into all activity log tables
-- Enables full run-level trace: agent_run → tools → hooks → approvals → executions

ALTER TABLE agentsam_tool_call_log ADD COLUMN agent_run_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_tool_call_log ADD COLUMN conversation_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_tool_chain ADD COLUMN agent_run_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_tool_chain ADD COLUMN conversation_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_hook_execution ADD COLUMN agent_run_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_hook_execution ADD COLUMN conversation_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN agent_run_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN conversation_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_execution_steps ADD COLUMN agent_run_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_approval_queue ADD COLUMN agent_run_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_approval_queue ADD COLUMN conversation_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tool_call_log_agent_run ON agentsam_tool_call_log(agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tool_chain_agent_run ON agentsam_tool_chain(agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hook_execution_agent_run ON agentsam_hook_execution(agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mcp_tool_execution_agent_run ON agentsam_mcp_tool_execution(agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_steps_agent_run ON agentsam_execution_steps(agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_queue_agent_run ON agentsam_approval_queue(agent_run_id) WHERE agent_run_id IS NOT NULL;
