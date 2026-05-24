-- 397: Register dual Vectorize lanes in D1.
--
-- vectorize_index_registry.source_type has a CHECK constraint that (currently) only allows:
--   - 'r2_bucket'
--   - 'manual'
--   - 'autorag'
--
-- So we register:
--   - vidx_autorag_1024  -> source_type = 'autorag'
--   - vidx_agentsam_vectors -> source_type = 'manual'
--
-- Apply:
--   cd /Users/samprimeaux/inneranimalmedia
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/397_vectorize_index_registry_dual_lanes.sql

INSERT OR IGNORE INTO vectorize_index_registry (
  id, tenant_id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active,
  description, use_cases, created_at, updated_at
) VALUES
(
  'vidx_autorag_1024',
  'tenant_sam_primeaux',
  'VECTORIZE',
  'ai-search-inneranimalmedia-autorag',
  'AutoRAG / documents (1024)',
  'autorag',
  1024,
  'cosine',
  0,
  1,
  'Legacy RAG lane: public.documents, knowledge ingest, unifiedRagSearch. Env RAG_EMBEDDING_DIMENSIONS=1024. Do not write 1536-d vectors here.',
  '["documents","knowledge","autorag","unified_rag","session_summaries_1024"]',
  datetime('now'),
  datetime('now')
),
(
  'vidx_agentsam_vectors',
  'tenant_sam_primeaux',
  'AGENTSAMVECTORIZE',
  'inneranimalmedia-vectors',
  'Agent Sam memory + code (1536)',
  'manual',
  1536,
  'cosine',
  1,
  1,
  'Agent Sam lane: agent_memory, codebase_chunks, curated recall, codebase embed workflow. Describe() before embed. Same model at index + query.',
  '["agent_memory","codebase_chunks","codebase_search","semantic_recall","chat_memory"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry
SET binding_name = 'VECTORIZE',
    index_name = 'ai-search-inneranimalmedia-autorag',
    display_name = 'AutoRAG / documents (1024)',
    source_type = 'autorag',
    dimensions = 1024,
    metric = 'cosine',
    is_preferred = 0,
    is_active = 1,
    description = 'Legacy RAG lane (1024). Tools: knowledge_search, rag_ingest, unifiedRagSearch. Tables: public.documents @1024.',
    use_cases = '["documents","knowledge","autorag","unified_rag"]',
    updated_at = datetime('now')
WHERE id = 'vidx_autorag_1024';

UPDATE vectorize_index_registry
SET binding_name = 'AGENTSAMVECTORIZE',
    index_name = 'inneranimalmedia-vectors',
    display_name = 'Agent Sam memory + code (1536)',
    source_type = 'manual',
    dimensions = 1536,
    metric = 'cosine',
    is_preferred = 1,
    is_active = 1,
    description = 'Agent Sam lane (1536). Tools: agentsam_vectorize_*, searchCuratedAgentMemory, searchCodebase. Memory key: schema_agentsam_vectorize_embed_pipeline.',
    use_cases = '["agent_memory","codebase_chunks","codebase_search"]',
    updated_at = datetime('now')
WHERE id = 'vidx_agentsam_vectors';

