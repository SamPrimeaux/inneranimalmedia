-- 376: Dotted capability aliases for memory / RAG / drive / wrangler lanes + route requirements

INSERT INTO agentsam_capability_aliases (
  abstract_capability,
  match_kind,
  match_value,
  capability_lane,
  priority,
  requires_approval,
  is_mutation,
  rationale
)
VALUES
  ('memory.search', 'tool_key', 'agent_memory_search', 'memory', 10, 0, 0, 'Semantic search over Supabase agent_memory.'),
  ('memory.write', 'tool_key', 'agent_memory_write', 'memory', 10, 1, 1, 'Write/update agent_memory rows (approval-gated).'),

  ('rag.search', 'tool_key', 'knowledge_search', 'research', 10, 0, 0, 'RAG search maps to knowledge_search.'),
  ('rag.ingest', 'tool_key', 'rag_ingest', 'research', 10, 0, 1, 'Ingest documents into RAG index (mutation, no approval).'),
  ('rag.status', 'tool_key', 'rag_status', 'research', 10, 0, 0, 'RAG pipeline status.'),
  ('rag.embed', 'tool_key', 'ai_embed', 'research', 10, 0, 0, 'Embed text for RAG / vector pipelines.'),

  ('drive.read', 'tool_key', 'gdrive_fetch', 'integrate', 10, 0, 0, 'Read Google Drive file by id.'),
  ('drive.list', 'tool_key', 'gdrive_list', 'integrate', 10, 0, 0, 'List Google Drive files/folders.'),

  ('wrangler.d1.query', 'tool_key', 'd1_query', 'data', 10, 0, 0, 'Wrangler D1 read/query.'),
  ('wrangler.d1.schema', 'tool_key', 'd1_schema_introspect', 'data', 10, 0, 0, 'Wrangler D1 schema introspection.'),
  ('wrangler.d1.write', 'tool_key', 'd1_write', 'data', 10, 1, 1, 'Wrangler D1 write (approval-gated).'),
  ('wrangler.d1.migrate', 'tool_key', 'd1_migrations_draft', 'data', 10, 1, 1, 'Draft D1 migrations (approval-gated).'),
  ('wrangler.cli', 'tool_key', 'terminal_wrangler', 'terminal', 10, 1, 1, 'Run wrangler CLI via terminal (approval-gated).')
ON CONFLICT (abstract_capability, match_kind, match_value)
DO UPDATE SET
  capability_lane = excluded.capability_lane,
  priority = excluded.priority,
  requires_approval = excluded.requires_approval,
  is_mutation = excluded.is_mutation,
  rationale = excluded.rationale,
  is_active = 1,
  updated_at = datetime('now');

-- agent_general / chat / general: memory lane tools
UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["think","research","inspect","memory"]',
  optional_capability_keys_json = '["memory.read","memory.search","memory.write","context.search","browser.inspect","d1.read","mcp.catalog.read"]'
WHERE route_key IN ('agent_general', 'general', 'chat');

-- agent_research: RAG + knowledge dotted keys
UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["research","think","inspect"]',
  optional_capability_keys_json = '["knowledge.search","rag.search","rag.ingest","rag.status","rag.embed","context.search","d1.read","browser.inspect","mcp.catalog.read"]'
WHERE route_key = 'agent_research';

-- agent_database: wrangler D1 dotted keys + existing hyperdrive/d1 aliases
UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["develop","inspect","observe","data"]',
  optional_capability_keys_json = '["wrangler.d1.query","wrangler.d1.schema","wrangler.d1.write","wrangler.d1.migrate","d1.schema","d1.explain","d1.write","d1.batch_write","hyperdrive.read","hyperdrive.schema","hyperdrive.explain"]'
WHERE route_key = 'agent_database';

-- agent_terminal: wrangler CLI
UPDATE agentsam_route_requirements
SET
  allowed_lanes_json = '["develop","observe","operate","terminal"]',
  optional_capability_keys_json = '["terminal.execute","wrangler.cli","logs.read","github.read","d1.read","r2.read"]'
WHERE route_key = 'agent_terminal';

-- agent_tool_orchestration: Google Drive integrate lane
UPDATE agentsam_route_requirements
SET
  optional_capability_keys_json = '["mcp.tool.inspect","workflow.run","agent.run","d1.read","logs.read","drive.read","drive.list"]'
WHERE route_key = 'agent_tool_orchestration';
