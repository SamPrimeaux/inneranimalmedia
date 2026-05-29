-- 469: MCP memory_save/search input_schema — policy + state types, private PG path docs.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/469_agentsam_memory_mcp_save_schema.sql

UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","required":["key","value"],"additionalProperties":false,"properties":{"key":{"type":"string","description":"Stable memory key"},"value":{"type":"string","description":"Memory body"},"memory_type":{"type":"string","enum":["fact","preference","project","skill","error","decision","policy","state"]},"title":{"type":"string"},"summary":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"importance":{"type":"integer","minimum":1,"maximum":10},"is_pinned":{"type":"boolean"},"source":{"type":"string"},"ttl_days":{"type":"number"}}}',
  description = 'Save managed memory to D1 + private agentsam.agentsam_memory (not public.agent_memory). Types include policy and state.',
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_memory_save', 'agentsam_memory_write')
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"query":{"type":"string","description":"Substring search D1 + private PG"},"top_k":{"type":"integer","maximum":50},"memory_type":{"type":"string","enum":["fact","preference","project","skill","error","decision","policy","state"]}}}',
  description = 'Search managed memory (D1 + agentsam.agentsam_memory). No Vectorize required.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search'
  AND COALESCE(is_active, 1) = 1;
