-- migrations/427_oauth_missing_tool_rows.sql
-- Insert 9 missing agentsam_tools rows referenced by agentsam_mcp_oauth_tool_allowlist
-- All rows mirror handler_config shape from existing sibling rows (queried live)

INSERT OR IGNORE INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category, handler_type, handler_config, is_active, is_global)
VALUES

-- D1 surface (mirrors d1_query shape)
('agentsam_db_query',
 'agentsam_db_query', 'DB Query', 'platform', 'd1',
 '{"binding":"DB","operation":"query","database_id":"cf87b717-d4e2-4cf8-bab0-a81268e32d49","auth_source":"platform"}',
 1, 1),

('agentsam_db_schema',
 'agentsam_db_schema', 'DB Schema', 'platform', 'd1',
 '{"binding":"DB","operation":"schema","database_id":"cf87b717-d4e2-4cf8-bab0-a81268e32d49","auth_source":"platform"}',
 1, 1),

-- R2 surface (mirrors r2_list / r2_read / r2_write shape)
('agentsam_r2_list',
 'agentsam_r2_list', 'R2 List', 'storage', 'r2',
 '{"binding":"ASSETS","auth_source":"platform","operation":"list"}',
 1, 1),

('agentsam_r2_read',
 'agentsam_r2_read', 'R2 Read', 'storage', 'r2',
 '{"binding":"ASSETS","auth_source":"platform","operation":"read"}',
 1, 1),

('agentsam_r2_write',
 'agentsam_r2_write', 'R2 Write', 'storage', 'r2',
 '{"binding":"ASSETS","auth_source":"platform"}',
 1, 1),

-- GitHub surface (mirrors github_repos / github_create_pr shape)
('agentsam_github_repo_list',
 'agentsam_github_repo_list', 'GitHub Repo List', 'github', 'github',
 '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","repo_field":"workspace.github_repo","operation":"list_repos"}',
 1, 1),

('agentsam_github_pr_create',
 'agentsam_github_pr_create', 'GitHub PR Create', 'github', 'github',
 '{"handler":"github","auth_source":"user_oauth_tokens","provider":"github","repo_field":"workspace.github_repo","operation":"create_pr"}',
 1, 1),

-- Deploy status (mirrors deploy_status shape)
('agentsam_deploy_status',
 'agentsam_deploy_status', 'Deploy Status', 'deploy', 'mcp',
 '{"tool_name":"deploy_status","mcp_server":"inneranimalmedia","auth_source":"platform","binding":"internal"}',
 1, 1),

-- Memory save (mirrors agentsam_memory_write which exists; this is the public-facing alias row)
('agentsam_memory_save',
 'agentsam_memory_save', 'Memory Save', 'memory', 'mcp',
 '{"action":"memory_save","auth_source":"platform"}',
 1, 1);
