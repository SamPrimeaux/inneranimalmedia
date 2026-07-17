-- 920: Make Tavily search_web part of the in-app Agent Sam working spine.
-- The session profile is the D1 SSOT; cached pre-920 sessions are invalidated in
-- agent-session-context.js when search_web is absent.

UPDATE agentsam_tools
SET
  description = 'Search the public web through Tavily for current facts, releases, pricing, news, and official documentation. Use query for discovery; use web_fetch only when a URL is already known.',
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"query":{"type":"string","minLength":1,"description":"Public-web search query"},"search_depth":{"type":"string","enum":["basic","advanced"],"default":"basic"},"max_results":{"type":"integer","minimum":1,"maximum":10,"default":5},"include_domains":{"type":"array","items":{"type":"string"}},"exclude_domains":{"type":"array","items":{"type":"string"}},"include_answer":{"type":"boolean","default":false},"include_raw_content":{"type":"boolean","default":false},"include_images":{"type":"boolean","default":false},"topic":{"type":"string","enum":["general","news","finance"],"default":"general"}},"required":["query"]}',
  handler_type = 'websearch',
  handler_key = 'open_web_search',
  capability_key = 'web.search',
  handler_config = '{"execution_lane":"open_web_search","web_backend":"tavily","dispatch_target":"search_web","dispatcher":"search_web","auth_source":"platform","not_browser":true,"not_workspace_search":true,"source_file":"src/tools/builtin/web.js"}',
  is_active = 1,
  is_degraded = 0,
  updated_at = unixepoch()
WHERE tool_key = 'search_web' OR tool_name = 'search_web';

UPDATE agentsam_tool_profiles
SET
  tool_keys_json = json_insert(tool_keys_json, '$[#]', 'search_web'),
  notes = '920: Operator in-app spine includes Tavily search_web with platform credential injection.',
  updated_at = unixepoch()
WHERE profile_key = 'in_app_agent_cf_github'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(agentsam_tool_profiles.tool_keys_json)
    WHERE value = 'search_web'
  );

UPDATE agentsam_prompt_routes
SET
  intent_labels = '["web_search","open_web_search"]',
  trigger_keywords = '["search the web","web search","websearch","find online","most recent","latest","current news"]',
  tool_keys = '["search_web","web_fetch"]',
  updated_at = unixepoch()
WHERE route_key = 'web_search';
