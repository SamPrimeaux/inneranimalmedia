-- 455: D1 CHECK constraint has no 'builtin' — use ai + dispatcher for open-web tools.
UPDATE agentsam_tools
SET
  tool_category = 'research.web',
  handler_type = 'ai',
  description = 'Open-web discovery (public internet). Lane: open_web_search. Uses Tavily when TAVILY_API_KEY is set. Not for repo grep, D1, or browser DOM.',
  handler_config = '{"execution_lane":"open_web_search","web_backend":"tavily","dispatch_target":"search_web","dispatcher":"search_web","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE tool_key = 'search_web';

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_key, tool_code, tool_name, display_name, tool_category, handler_type,
  handler_config, risk_level, requires_approval, workspace_scope, is_active, is_degraded
) VALUES (
  'ast_web_fetch_global',
  'web_fetch', 'web_fetch', 'web_fetch', 'Web Fetch', 'research.web', 'ai',
  '{"execution_lane":"web_fetch","dispatch_target":"web_fetch","dispatcher":"web_fetch","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  'low', 0, '["*"]', 1, 0
);

UPDATE agentsam_tools
SET
  tool_key = 'web_fetch',
  display_name = 'Web Fetch',
  description = 'Fetch a known public URL and return text (no browser render). Use for docs pages, raw GitHub, API references.',
  tool_category = 'research.web',
  handler_type = 'ai',
  handler_config = '{"execution_lane":"web_fetch","dispatch_target":"web_fetch","dispatcher":"web_fetch","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE tool_name = 'web_fetch';
