-- 470: Fix memory tool schema split (save vs vector write) + sync agentsam_mcp_tools mirror.
-- 469 incorrectly applied managed-memory schema to agentsam_memory_write (Vectorize lane).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/470_agentsam_memory_mcp_schema_refresh.sql

-- agentsam_memory_save — private managed memory (D1 + agentsam.agentsam_memory)
UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","required":["key","value"],"additionalProperties":false,"properties":{"key":{"type":"string","description":"Stable memory key"},"value":{"type":"string","description":"Memory body"},"memory_type":{"type":"string","enum":["fact","preference","project","skill","error","decision","policy","state"]},"title":{"type":"string"},"summary":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"importance":{"type":"integer","minimum":1,"maximum":10},"is_pinned":{"type":"boolean"},"source":{"type":"string"},"ttl_days":{"type":"number"}}}',
  description = 'Save private managed memory (D1 + agentsam.agentsam_memory). Use policy/state types. Not Vectorize.',
  handler_config = '{"operation":"memory_write","auth_source":"platform","module":"memory","private_pg_mirror":true}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_save'
  AND COALESCE(is_active, 1) = 1;

-- agentsam_memory_write — Vectorize / semantic lane only (restore)
UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","properties":{"content":{"type":"string","description":"Text to embed and store in Vectorize (semantic/RAG). Not private managed KV — use agentsam_memory_save."},"namespace":{"type":"string","default":"agentsam-memory-oai3large-1536","description":"Target writable Vectorize index"},"source":{"type":"string"},"tags":{"type":"array","items":{"type":"string"}},"metadata":{"type":"object"},"provider":{"type":"string","enum":["cf","supabase","both"],"default":"cf"}},"required":["content"],"additionalProperties":false}',
  description = 'Vectorize semantic memory write (embed + index). For operational private memory use agentsam_memory_save or /api/agent/memory/private/* — not this tool.',
  handler_config = '{"operation":"memory_write","auth_source":"platform","module":"memory","vectorize_lane":true}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_write'
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_tools
SET
  input_schema = '{"type":"object","additionalProperties":false,"properties":{"query":{"type":"string","description":"Substring search D1 + private PG"},"top_k":{"type":"integer","maximum":50},"memory_type":{"type":"string","enum":["fact","preference","project","skill","error","decision","policy","state"]}}}',
  description = 'Search private managed memory (D1 + agentsam.agentsam_memory). No Vectorize required.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search'
  AND COALESCE(is_active, 1) = 1;

-- Mirror agentsam_mcp_tools from agentsam_tools (ChatGPT tools/list used stale mirror rows)
UPDATE agentsam_mcp_tools
SET
  input_schema = (SELECT input_schema FROM agentsam_tools t WHERE t.tool_key = agentsam_mcp_tools.tool_key LIMIT 1),
  description = (SELECT description FROM agentsam_tools t WHERE t.tool_key = agentsam_mcp_tools.tool_key LIMIT 1),
  handler_config = (SELECT handler_config FROM agentsam_tools t WHERE t.tool_key = agentsam_mcp_tools.tool_key LIMIT 1),
  updated_at = unixepoch()
WHERE tool_key IN ('agentsam_memory_save', 'agentsam_memory_search', 'agentsam_memory_write')
  AND EXISTS (SELECT 1 FROM agentsam_tools t WHERE t.tool_key = agentsam_mcp_tools.tool_key);
