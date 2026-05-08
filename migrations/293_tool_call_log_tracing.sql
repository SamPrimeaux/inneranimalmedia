ALTER TABLE agentsam_tool_call_log ADD COLUMN span_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_tool_call_log ADD COLUMN trace_id TEXT DEFAULT NULL;
ALTER TABLE agentsam_tool_call_log ADD COLUMN batch_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_atcl_trace ON agentsam_tool_call_log(trace_id);

