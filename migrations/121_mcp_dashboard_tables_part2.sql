-- 121 part 2: seed data for existing schema (intent_slug, workflow_agent, no id)
INSERT OR IGNORE INTO mcp_command_suggestions (label, description, example_prompt, intent_slug, routed_to_agent, is_pinned, sort_order) VALUES
  ('Debug API', 'Inspect why an API returns an error', 'debug why /api/agent/chat returns 404', 'cmd_debug_api', 'mcp_agent_tester', 1, 0),
  ('Deploy worker', 'Deploy the worker to production', 'deploy the worker to production', 'cmd_deploy_worker', 'mcp_agent_operator', 1, 1),
  ('Plan a feature', 'Brainstorm and plan a new feature', 'plan a feature for user settings', 'cmd_plan_feature', 'mcp_agent_architect', 0, 2),
  ('Fix a bug', 'Write a fix for a bug', 'fix the bug in the login form', 'cmd_fix_bug', 'mcp_agent_builder', 0, 3);

INSERT OR IGNORE INTO agent_intent_patterns (intent_slug, display_name, description, triggers_json, workflow_agent, is_active) VALUES
  ('intent_deploy', 'Deploy to production', 'Deploy or release to production', '["deploy","production","release","ship"]', 'mcp_agent_operator', 1),
  ('intent_debug', 'Debug / fix', 'Debug errors and fix issues', '["debug","fix","inspect","why","error","404","500"]', 'mcp_agent_tester', 1),
  ('intent_build', 'Build / implement', 'Implement or build a feature', '["implement","write","code","build","add feature"]', 'mcp_agent_builder', 1),
  ('intent_plan', 'Plan / design', 'Plan or design a feature', '["plan","design","brainstorm","architecture"]', 'mcp_agent_architect', 1);
