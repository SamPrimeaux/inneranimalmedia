-- 462: Canonical semantic + database assistant tools; legacy unified RAG demoted.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/462_agentsam_semantic_database_tools.sql

-- ── Legacy unified RAG (admin/compat only) ───────────────────────────────────
UPDATE agentsam_tools
SET
  is_degraded = 1,
  description = COALESCE(description, '') || ' [LEGACY: public.search_all_context @ 1024 — admin/compat only; not normal Agent chat.]',
  handler_config = json_object(
    'dispatcher', 'legacy_unified_rag',
    'legacy_unified_rag', 1,
    'canonical_schema', 'public',
    'admin_only', 1
  ),
  updated_at = unixepoch()
WHERE tool_key IN ('knowledge_search', 'rag_search', 'ss_search_knowledge')
   OR tool_name IN ('knowledge_search', 'rag_search', 'ss_search_knowledge');

-- ── code_semantic_search ─────────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_code_semantic_search',
  'code_semantic_search', 'code_semantic_search', 'Code Semantic Search', 'research.semantic', 'ai',
  'Semantic search over indexed codebase chunks (agentsam @ 1536). Lane: code_semantic_search.',
  '{"type":"object","properties":{"query":{"type":"string","description":"Natural language code question"},"top_k":{"type":"integer","default":6}},"required":["query"]}',
  '{"dispatcher":"semantic_retrieval","semantic_lane":"code_semantic_search","execution_lane":"code_semantic_search","canonical_schema":"agentsam","legacy_unified_rag":false,"binding":"AGENTSAM_VECTORIZE_CODE"}',
  'code_semantic_search',
  'low', 0, 0, 1, 0, '["*"]', 12, 1, unixepoch()
);

-- ── schema_semantic_search ───────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_schema_semantic_search',
  'schema_semantic_search', 'schema_semantic_search', 'Schema Semantic Search', 'research.semantic', 'ai',
  'Semantic search over database schema index (agentsam @ 1536). Lane: schema_semantic_search.',
  '{"type":"object","properties":{"query":{"type":"string"},"top_k":{"type":"integer","default":6}},"required":["query"]}',
  '{"dispatcher":"semantic_retrieval","semantic_lane":"schema_semantic_search","execution_lane":"schema_semantic_search","canonical_schema":"agentsam","legacy_unified_rag":false,"binding":"AGENTSAM_VECTORIZE_SCHEMA"}',
  'schema_semantic_search',
  'low', 0, 0, 1, 0, '["*"]', 13, 1, unixepoch()
);

-- ── memory_semantic_search ───────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_memory_semantic_search',
  'memory_semantic_search', 'memory_semantic_search', 'Memory Semantic Search', 'research.semantic', 'ai',
  'Semantic search over project memory (agentsam @ 1536). Lane: memory_semantic_search.',
  '{"type":"object","properties":{"query":{"type":"string"},"top_k":{"type":"integer","default":6}},"required":["query"]}',
  '{"dispatcher":"semantic_retrieval","semantic_lane":"memory_semantic_search","execution_lane":"memory_semantic_search","canonical_schema":"agentsam","legacy_unified_rag":false,"binding":"AGENTSAM_VECTORIZE_MEMORY"}',
  'memory_semantic_search',
  'low', 0, 0, 1, 0, '["*"]', 14, 1, unixepoch()
);

-- ── docs_knowledge_search ────────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_docs_knowledge_search',
  'docs_knowledge_search', 'docs_knowledge_search', 'Docs Knowledge Search', 'research.semantic', 'ai',
  'Semantic search over IAM docs/knowledge (agentsam @ 1536). Lane: docs_knowledge_search.',
  '{"type":"object","properties":{"query":{"type":"string"},"top_k":{"type":"integer","default":6}},"required":["query"]}',
  '{"dispatcher":"semantic_retrieval","semantic_lane":"docs_knowledge_search","execution_lane":"docs_knowledge_search","canonical_schema":"agentsam","legacy_unified_rag":false,"binding":"AGENTSAM_VECTORIZE_COURSES"}',
  'docs_knowledge_search',
  'low', 0, 0, 1, 0, '["*"]', 15, 1, unixepoch()
);

-- ── deep_archive_search ──────────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_deep_archive_search',
  'deep_archive_search', 'deep_archive_search', 'Deep Archive Search', 'research.semantic', 'ai',
  'Long-range archival semantic search (agentsam @ 3072). Lane: deep_archive_search.',
  '{"type":"object","properties":{"query":{"type":"string"},"top_k":{"type":"integer","default":4}},"required":["query"]}',
  '{"dispatcher":"semantic_retrieval","semantic_lane":"deep_archive_search","execution_lane":"deep_archive_search","canonical_schema":"agentsam","legacy_unified_rag":false}',
  'deep_archive_search',
  'low', 0, 0, 1, 0, '["*"]', 16, 1, unixepoch()
);

-- ── database_assistant ───────────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_database_assistant',
  'database_assistant', 'database_assistant', 'Database Assistant', 'database.hyperdrive', 'ai',
  'Inspect agentsam schema, run owner-gated read-only SQL, propose migrations (approval required for DDL).',
  '{"type":"object","properties":{"operation":{"type":"string","enum":["inspect_schema","list_tables","describe_table","run_readonly_sql","explain_table","propose_migration"]},"schema":{"type":"string","default":"agentsam"},"table":{"type":"string"},"sql":{"type":"string"},"migration_sql":{"type":"string"}},"required":["operation"]}',
  '{"dispatcher":"database_assistant","operation":"inspect_schema","canonical_schema":"agentsam","legacy_unified_rag":false}',
  'database_assistant',
  'medium', 0, 0, 1, 0, '["*"]', 17, 1, unixepoch()
);

-- ── hyperdrive_schema_inspect ────────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_hyperdrive_schema_inspect',
  'hyperdrive_schema_inspect', 'hyperdrive_schema_inspect', 'Hyperdrive Schema Inspect', 'database.hyperdrive', 'ai',
  'List agentsam tables and columns via Hyperdrive (read-only).',
  '{"type":"object","properties":{"schema":{"type":"string","default":"agentsam"},"table":{"type":"string"}}}',
  '{"dispatcher":"database_assistant","operation":"inspect_schema","canonical_schema":"agentsam","legacy_unified_rag":false}',
  'database_assistant',
  'low', 0, 0, 1, 0, '["*"]', 18, 1, unixepoch()
);

-- ── hyperdrive_readonly_query ───────────────────────────────────────────────
INSERT OR REPLACE INTO agentsam_tools (
  id, tool_key, tool_name, display_name, tool_category, handler_type,
  description, input_schema, handler_config, capability_key,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_degraded, workspace_scope, sort_priority, is_global, updated_at
) VALUES (
  'ast_hyperdrive_readonly_query',
  'hyperdrive_readonly_query', 'hyperdrive_readonly_query', 'Hyperdrive Readonly SQL', 'database.hyperdrive', 'ai',
  'Run policy-gated SELECT against agentsam schema via Hyperdrive.',
  '{"type":"object","properties":{"sql":{"type":"string","description":"SELECT or EXPLAIN only"},"schema":{"type":"string","default":"agentsam"}},"required":["sql"]}',
  '{"dispatcher":"database_assistant","operation":"run_readonly_sql","canonical_schema":"agentsam","legacy_unified_rag":false}',
  'database_assistant',
  'medium', 0, 0, 1, 0, '["*"]', 19, 1, unixepoch()
);

-- Ensure semantic tools are not degraded
UPDATE agentsam_tools
SET is_degraded = 0, is_active = 1, updated_at = unixepoch()
WHERE tool_key IN (
  'code_semantic_search',
  'schema_semantic_search',
  'memory_semantic_search',
  'docs_knowledge_search',
  'deep_archive_search',
  'database_assistant',
  'hyperdrive_schema_inspect',
  'hyperdrive_readonly_query'
);
