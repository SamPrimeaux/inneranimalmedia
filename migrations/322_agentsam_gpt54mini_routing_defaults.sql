-- 322: Make gpt-5.4-mini the deterministic default for chat routing + turn off Thompson by default.
-- Run against prod D1 when ready:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/322_agentsam_gpt54mini_routing_defaults.sql

UPDATE agentsam_feature_flag
SET enabled_globally = 0
WHERE flag_key = 'thompson_routing_enabled';

-- Global routing arms (empty workspace_id): first match for any workspace-specific arms still wins in code.
INSERT OR IGNORE INTO agentsam_routing_arms
  (id, task_type, mode, model_key, provider, workspace_id,
   success_alpha, success_beta, decayed_score,
   is_eligible, is_paused, is_active, budget_exhausted,
   supports_tools, priority, total_executions,
   tools_json, workflow_agent, reasoning_effort,
   last_decay_at, updated_at)
VALUES
  ('ra_chat_auto_gpt54mini_g','chat','auto','gpt-5.4-mini','openai','',
   2.0, 1.0, 0.95,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","tool_knowledge_search","context_*","workspace_read_file","workspace_search","terminal_execute"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch()),
  ('ra_chat_agent_gpt54mini_g','chat','agent','gpt-5.4-mini','openai','',
   2.0, 1.0, 0.95,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","tool_knowledge_search","context_*","workspace_read_file","workspace_search","terminal_execute"]',
   'toolbox', 'medium', unixepoch(), unixepoch()),
  ('ra_chat_ask_gpt54mini_g','chat','ask','gpt-5.4-mini','openai','',
   2.0, 1.0, 0.95,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","context_search","knowledge_search"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch());

UPDATE agentsam_model_catalog SET
  api_platform = 'openai_responses',
  openai_model_id = COALESCE(NULLIF(TRIM(openai_model_id), ''), 'gpt-5.4-mini'),
  supports_tools = COALESCE(supports_tools, 1),
  supports_streaming = COALESCE(supports_streaming, 1),
  is_active = 1
WHERE lower(trim(model_key)) = 'gpt-5.4-mini';

-- Same arms for the seeded dev workspace used in migration 311 (workspace-scoped query wins over global '').
INSERT OR IGNORE INTO agentsam_routing_arms
  (id, task_type, mode, model_key, provider, workspace_id,
   success_alpha, success_beta, decayed_score,
   is_eligible, is_paused, is_active, budget_exhausted,
   supports_tools, priority, total_executions,
   tools_json, workflow_agent, reasoning_effort,
   last_decay_at, updated_at)
VALUES
  ('ra_chat_auto_gpt54mini_ws','chat','auto','gpt-5.4-mini','openai','ws_inneranimalmedia',
   2.0, 1.0, 0.95,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","tool_knowledge_search","context_*","workspace_read_file","workspace_search","terminal_execute"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch()),
  ('ra_chat_agent_gpt54mini_ws','chat','agent','gpt-5.4-mini','openai','ws_inneranimalmedia',
   2.0, 1.0, 0.95,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","tool_knowledge_search","context_*","workspace_read_file","workspace_search","terminal_execute"]',
   'toolbox', 'medium', unixepoch(), unixepoch()),
  ('ra_chat_ask_gpt54mini_ws','chat','ask','gpt-5.4-mini','openai','ws_inneranimalmedia',
   2.0, 1.0, 0.95,
   1, 0, 1, 0,
   1, 100, 0,
   '["d1_query","context_search","knowledge_search"]',
   'agent_sam_core', 'medium', unixepoch(), unixepoch());
