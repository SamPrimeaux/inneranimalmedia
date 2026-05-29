-- 458: Register fs_search_files (workspace_grep / PTY ripgrep — not Tavily).
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_code, tool_name, display_name, tool_category, handler_type,
  handler_config, risk_level, requires_approval, workspace_scope, is_active, is_degraded
) VALUES (
  'ast_fs_search_files_global',
  'fs_search_files', 'fs_search_files', 'fs_search_files', 'Search Files (rg)', 'research.code', 'ai',
  '{"execution_lane":"workspace_grep","dispatch_target":"fs_search_files","dispatcher":"fs_search_files","auth_source":"platform","not_browser":true,"not_workspace_search":false,"source_file":"src/core/fs-search-files.js"}',
  'low', 0, '["*"]', 1, 0
);

UPDATE agentsam_tools
SET
  tool_key = 'fs_search_files',
  tool_name = 'fs_search_files',
  display_name = 'Search Files (rg)',
  description = 'Ripgrep search in workspace repo (PTY). Lane: workspace_grep. Not for open-web or D1.',
  tool_category = 'research.code',
  handler_type = 'ai',
  handler_config = '{"execution_lane":"workspace_grep","dispatch_target":"fs_search_files","dispatcher":"fs_search_files","auth_source":"platform","not_browser":true,"not_workspace_search":false,"source_file":"src/core/fs-search-files.js"}',
  capability_key = COALESCE(capability_key, 'workspace_grep'),
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE tool_key = 'fs_search_files' OR tool_name = 'fs_search_files';
