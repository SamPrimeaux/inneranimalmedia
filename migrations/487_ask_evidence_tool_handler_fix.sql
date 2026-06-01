-- 487: Ask evidence tool fixes — catalog handlers + ask route max_tools=8

UPDATE agentsam_tools SET
  handler_type = 'ai',
  handler_config = '{"dispatcher":"legacy_unified_rag","legacy_unified_rag":true,"execution_lane":"docs_knowledge_search","semantic_lane":"docs_knowledge_search","platform_bindingless":true}',
  updated_at = unixepoch()
WHERE tool_key = 'knowledge_search';

UPDATE agentsam_tools SET
  handler_config = '{"operation":"memory_search","auth_source":"platform","binding":"DB","module":"memory","private_pg_search":true,"platform_bindingless":true}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search';

UPDATE agentsam_prompt_routes SET
  max_tools = 8
WHERE route_key = 'ask';

UPDATE agentsam_route_requirements SET
  max_tools = 8,
  optional_capability_keys_json = '["memory.read","context.search","code.search","github.read","workspace.read","d1.read","d1.schema","browser.inspect","mcp.catalog.read"]'
WHERE route_key = 'ask';
