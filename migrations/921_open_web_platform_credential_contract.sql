-- 921: Name the Tavily Wrangler secret for generic catalog credential
-- resolution. URL fetch is platform-internal and intentionally bindingless.

UPDATE agentsam_tools
SET
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.auth_source', 'platform',
    '$.env_key', 'TAVILY_API_KEY'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'search_web' OR tool_name = 'search_web';

UPDATE agentsam_tools
SET
  handler_config = json_set(
    COALESCE(handler_config, '{}'),
    '$.auth_source', 'platform',
    '$.platform_bindingless', json('true')
  ),
  updated_at = unixepoch()
WHERE tool_key = 'web_fetch' OR tool_name = 'web_fetch';
