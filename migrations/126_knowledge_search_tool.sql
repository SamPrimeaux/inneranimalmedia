-- 126: knowledge_search tool for Agent Sam (built-in; uses AI.autorag)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/126_knowledge_search_tool.sql
-- Purpose: Agent can search IAM knowledge base via env.AI.autorag('inneranimalmedia-aisearch').search().

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  created_at,
  updated_at
) VALUES (
  'tool_knowledge_search',
  'knowledge_search',
  'query',
  'builtin',
  'Search IAM knowledge base for technical docs, architecture, decisions, and context. Use when you need information beyond agent_memory_index.',
  '{"type":"object","properties":{"query":{"type":"string","description":"Search query"},"max_results":{"type":"number","description":"Max results (1-10)","default":5}},"required":["query"]}',
  0,
  1,
  unixepoch(),
  unixepoch()
);
