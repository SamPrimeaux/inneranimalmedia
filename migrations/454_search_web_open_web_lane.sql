-- 454: Align search_web catalog row with open_web_search builtin dispatcher (Tavily).
UPDATE agentsam_tools
SET
  tool_category = 'research.web',
  handler_type = 'ai',
  description = 'Open-web discovery (public internet). Lane: open_web_search. Uses Tavily when TAVILY_API_KEY is set. Not for repo grep, D1, or browser DOM.',
  handler_config = '{"execution_lane":"open_web_search","web_backend":"tavily","dispatch_target":"search_web","dispatcher":"search_web","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  capability_key = COALESCE(capability_key, 'open_web_search'),
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE tool_key = 'search_web';

UPDATE agentsam_tools
SET
  handler_config = '{"execution_lane":"open_web_search","web_backend":"tavily","dispatch_target":"search_web","dispatcher":"search_web","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  handler_type = 'ai',
  updated_at = unixepoch()
WHERE tool_name = 'search_web' AND handler_type = 'ai';
