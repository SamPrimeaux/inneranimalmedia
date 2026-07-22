-- 983: In-app executable Phase 5 composites — auth_source on mcp handler_config
-- Fixes: skip_unexecutable_tool … handler_config.auth_source required

UPDATE agentsam_tools
SET
  handler_config = '{"operation":"repo_context","auth_source":"user_oauth_tokens","module":"agentsam-repo-context","export":"executeAgentsamRepoContext","route":"iam_main"}',
  dispatch_target = 'both',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_repo_context';

UPDATE agentsam_tools
SET
  handler_config = '{"operation":"ticket_work","auth_source":"user_oauth_tokens"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_ticket_work';

UPDATE agentsam_tools
SET
  handler_config = '{"operation":"ship_check","auth_source":"platform"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_ship_check';

UPDATE agentsam_tools
SET
  handler_config = '{"operation":"grep","auth_source":"user_oauth_tokens"}',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_grep', 'agentsam_github_grep');

UPDATE agentsam_tools
SET
  handler_config = '{"operation":"d1_upsert_safe","auth_source":"platform"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_d1_upsert_safe';

UPDATE agentsam_tools
SET
  handler_config = '{"operation":"d1_validate_migration","auth_source":"platform"}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_d1_validate_migration';
