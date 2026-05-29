-- 456: Explicit open_web_search / web_fetch metadata on handler_config (handler_type stays 'ai' until 457).
-- D1 CHECK on handler_type does NOT allow 'builtin' or 'websearch' until table rebuild (457).

UPDATE agentsam_tools
SET
  handler_config = '{"execution_lane":"open_web_search","web_backend":"tavily","dispatch_target":"search_web","dispatcher":"search_web","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  capability_key = COALESCE(capability_key, 'open_web_search'),
  updated_at = unixepoch()
WHERE tool_key = 'search_web';

UPDATE agentsam_tools
SET
  handler_config = '{"execution_lane":"web_fetch","dispatch_target":"web_fetch","dispatcher":"web_fetch","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  updated_at = unixepoch()
WHERE tool_key = 'web_fetch';
