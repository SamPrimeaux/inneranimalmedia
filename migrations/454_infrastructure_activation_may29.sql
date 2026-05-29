-- 454: Activate dormant Agent Sam infrastructure (RAG routes, hooks, tool cache policy, webhook column).
-- Apply each statement separately via wrangler d1 execute (file is one migration unit).

UPDATE agentsam_prompt_routes
SET include_rag = 1, updated_at = unixepoch()
WHERE route_key IN (
  'debug',
  'db_write',
  'db_read',
  'code_review',
  'cf_ops',
  'terminal_execution',
  'agent_spawn'
)
AND COALESCE(include_rag, 0) = 0;

UPDATE agentsam_hook
SET handler_type = 'agent_call',
    handler_config = '{"route_key":"debug","auto_escalate":true}'
WHERE id = 'hook_error_diagnose';

UPDATE agentsam_hook
SET handler_type = 'agent_call',
    handler_config = '{"route_key":"db_write","validate_only":true}'
WHERE id = 'hook_pre_commit_lint';

UPDATE agentsam_hook
SET handler_type = 'context_load',
    handler_config = '{"load":["context_digest","project_context"],"limit":3}'
WHERE id = 'hook_start_bootstrap';

INSERT OR IGNORE INTO agentsam_tool_policy_keys (id, policy_kind, tool_key, sort_order, notes) VALUES
  ('atpk_nc_agentsam_memory_save', 'non_cacheable', 'agentsam_memory_save', 60, 'write path'),
  ('atpk_nc_agentsam_memory_write', 'non_cacheable', 'agentsam_memory_write', 70, 'write path'),
  ('atpk_nc_agentsam_todo_add', 'non_cacheable', 'agentsam_todo_add', 80, 'write path'),
  ('atpk_nc_agentsam_r2_upload', 'non_cacheable', 'agentsam_r2_upload', 90, 'write path'),
  ('atpk_nc_agentsam_notify', 'non_cacheable', 'agentsam_notify', 100, 'write path');

ALTER TABLE agentsam_webhook_events ADD COLUMN workflow_run_id TEXT;
