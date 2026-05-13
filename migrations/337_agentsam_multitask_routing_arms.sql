-- 337: Seed routing arms for heuristic task_type `multitask` (long-horizon / orchestration-style prompts).
-- Apply remote when ready:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/337_agentsam_multitask_routing_arms.sql

INSERT OR IGNORE INTO agentsam_routing_arms
  (id, task_type, mode, model_key, provider, workspace_id,
   success_alpha, success_beta, decayed_score,
   is_eligible, is_paused, is_active, budget_exhausted,
   supports_tools, priority, total_executions,
   tools_json, workflow_agent, reasoning_effort,
   last_decay_at, updated_at)
VALUES
  ('ra_multitask_gpt54mini_ws', 'multitask', 'agent', 'gpt-5.4-mini', 'openai', 'ws_inneranimalmedia',
   2.0, 1.0, 0.667,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","workspace_read_file","workspace_search","terminal_execute","knowledge_search","tool_knowledge_search","context_*"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch()),
  ('ra_multitask_gemini_flash_ws', 'multitask', 'agent', 'gemini-2.5-flash', 'google', 'ws_inneranimalmedia',
   2.0, 1.0, 0.667,
   1, 0, 1, 0,
   1, 90, 0,
   '["d1_query","workspace_read_file","workspace_search","terminal_execute","knowledge_search","tool_knowledge_search","context_*"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch());

INSERT OR IGNORE INTO agentsam_routing_arms
  (id, task_type, mode, model_key, provider, workspace_id,
   success_alpha, success_beta, decayed_score,
   is_eligible, is_paused, is_active, budget_exhausted,
   supports_tools, priority, total_executions,
   tools_json, workflow_agent, reasoning_effort,
   last_decay_at, updated_at)
VALUES
  ('ra_multitask_gpt54mini_g', 'multitask', 'agent', 'gpt-5.4-mini', 'openai', '',
   2.0, 1.0, 0.667,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","workspace_read_file","workspace_search","terminal_execute","knowledge_search","tool_knowledge_search","context_*"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch()),
  ('ra_multitask_gemini_flash_g', 'multitask', 'agent', 'gemini-2.5-flash', 'google', '',
   2.0, 1.0, 0.667,
   1, 0, 1, 0,
   1, 90, 0,
   '["d1_query","workspace_read_file","workspace_search","terminal_execute","knowledge_search","tool_knowledge_search","context_*"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch());
