-- 452: Register search_web for Agent Sam web research (builtin Tavily).
INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name, tool_category, handler_type,
  description, handler_config, risk_level, requires_approval,
  is_active, is_degraded, workspace_scope, is_global, updated_at
) VALUES (
  'ast_search_web_global',
  'search_web', 'search_web', 'Web Search', 'research.web', 'builtin',
  'Search the public web via Tavily for live facts, pricing, and documentation.',
  '{"dispatcher":"search_web","source_file":"src/tools/builtin/web.js"}',
  'low', 0, 1, 0, '["*"]', 1, unixepoch()
);

UPDATE agentsam_tools
SET
  tool_key = 'search_web',
  handler_type = 'builtin',
  workspace_scope = '["*"]',
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE tool_name = 'search_web';
