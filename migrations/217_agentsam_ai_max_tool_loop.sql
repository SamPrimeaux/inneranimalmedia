-- Per-agent max tool loop cap (Anthropic chatWithToolsAnthropic). Worker reads model_policy_json.max_tool_loop.
-- json_patch requires JSON1; COALESCE handles NULL model_policy_json.
UPDATE agentsam_ai
SET model_policy_json = json_patch(COALESCE(model_policy_json, '{}'), '{"max_tool_loop":20}')
WHERE id = 'ai_sam_v1';
