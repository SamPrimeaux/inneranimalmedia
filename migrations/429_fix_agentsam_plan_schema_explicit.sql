-- 429: agentsam_plan — explicit empty required[] (ChatGPT tools/list cache bust).
-- agentsam_memory_search — document D1 substring search (not Vectorize-only).

UPDATE agentsam_tools
SET
  description = 'Read active plan and tasks (call with {}), or create when goal is set. Schema v2 — goal optional.',
  input_schema = '{"type":"object","required":[],"properties":{"goal":{"type":"string","description":"When set, creates a new agentsam_plans row for this workspace."},"title":{"type":"string","description":"Optional title when creating a plan (defaults from goal)."},"context":{"type":"string","description":"Optional context stored in session_notes on create."},"create":{"type":"boolean","description":"Set true with goal to force create even if a plan already exists."}}}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_plan';

UPDATE agentsam_tools
SET
  description = 'Search D1 agentsam_memory by substring (key/value, case-insensitive). Use words from the saved memory text or key.',
  input_schema = '{"type":"object","required":["query"],"properties":{"query":{"type":"string","description":"Substring to match in memory key or value (case-insensitive). Use short phrases or words from the saved text."},"q":{"type":"string","description":"Alias for query"},"key_prefix":{"type":"string","description":"Optional key prefix filter e.g. mcp_memory_"},"limit":{"type":"integer","default":20,"maximum":50},"include_recent_if_empty":{"type":"boolean","default":true,"description":"When no substring match, include recent memories for this user"}}}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_search';
