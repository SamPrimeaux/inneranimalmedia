-- 431: agentsam_memory_search — optional query ({} valid); canonical D1 search schema.

UPDATE agentsam_tools
SET
  description = 'Search D1 agentsam_memory. Call with {} for recent memories, or pass query for substring match.',
  input_schema = '{"type":"object","properties":{"query":{"type":"string","description":"Natural language query to embed and search. Defaults to recent relevant workspace memory when omitted."},"namespace":{"type":"string","default":"agentsam-memory-oai3large-1536","description":"Legacy Vectorize namespace (D1 path ignores)."},"top_k":{"type":"integer","default":5,"maximum":20,"description":"Max results."},"filter":{"type":"object","description":"Optional metadata filter (ignored on D1 path)."},"provider":{"type":"string","enum":["cf","supabase","auto"],"default":"auto","description":"Legacy provider hint (D1 path ignores)."}},"additionalProperties":false}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search';
