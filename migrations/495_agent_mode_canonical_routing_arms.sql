-- 495: Canonical (task_type=agent, mode=agent) arms for composer Auto — complements chat/code arms.
-- Workspace default_model_id (agentsam_workspace) still wins via resolveProfileModel Path B when set.
-- Idempotent INSERT OR IGNORE.

INSERT OR IGNORE INTO agentsam_routing_arms (
  id, task_type, mode, model_key, provider, workspace_id,
  success_alpha, success_beta, decayed_score,
  is_eligible, is_paused, is_active, budget_exhausted,
  supports_tools, priority, total_executions,
  tools_json, workflow_agent, reasoning_effort,
  last_decay_at, updated_at
) VALUES
  ('ra_agent_agent_gpt54mini_ws', 'agent', 'agent', 'gpt-5.4-mini', 'openai', 'ws_inneranimalmedia',
   2.0, 1.0, 0.92, 1, 0, 1, 0, 1, 120, 0,
   '["d1_query","fs_read_file","fs_search_files","terminal_execute"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch()),
  ('ra_agent_agent_gpt54nano_ws', 'agent', 'agent', 'gpt-5.4-nano', 'openai', 'ws_inneranimalmedia',
   2.0, 1.0, 0.90, 1, 0, 1, 0, 1, 115, 0,
   '["d1_query","fs_read_file","fs_search_files"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch()),
  ('ra_agent_agent_gemini_flash_ws', 'agent', 'agent', 'gemini-2.5-flash', 'google', 'ws_inneranimalmedia',
   1.5, 1.0, 0.88, 1, 0, 1, 0, 1, 110, 0,
   '["d1_query","fs_read_file","fs_search_files"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch());
