-- Per-agent system prompt override + tool invocation style policy
ALTER TABLE agentsam_ai ADD COLUMN system_prompt TEXT;
ALTER TABLE agentsam_ai ADD COLUMN tool_invocation_style TEXT
  DEFAULT 'balanced'
  CHECK(tool_invocation_style IN ('aggressive', 'balanced', 'conservative'));
