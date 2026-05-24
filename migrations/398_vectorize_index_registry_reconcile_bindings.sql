-- 398: Reconcile vectorize_index_registry with wrangler.production.toml bindings.
--
-- wrangler.production.toml (2026-05) defines:
--   - VECTORIZE         -> ai-search-inneranimalmedia-autorag
--   - AGENTSAMVECTORIZE -> inneranimalmedia-vectors
--
-- vectorize_index_registry enforces UNIQUE(binding_name), so there can only be one row per binding.
-- This migration updates the existing VECTORIZE row to represent the 1024 AutoRAG lane, and
-- deactivates the legacy VECTORIZE_INDEX row (binding no longer exists in wrangler config).
--
-- Apply:
--   cd /Users/samprimeaux/inneranimalmedia
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/398_vectorize_index_registry_reconcile_bindings.sql

-- Ensure the AGENTSAMVECTORIZE lane exists (from migration 397) and is preferred.
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

-- Update the canonical VECTORIZE binding row to the 1024 AutoRAG lane.
-- (Historically this row was used for 768 "ai-search-inneranimalmedia-aisearch".)
UPDATE vectorize_index_registry
SET binding_name = 'VECTORIZE',
    index_name = 'ai-search-inneranimalmedia-autorag',
    display_name = 'AutoRAG / documents (1024)',
    source_type = 'autorag',
    dimensions = 1024,
    metric = 'cosine',
    is_preferred = 0,
    is_active = 1,
    description = 'AutoRAG / documents lane (1024). Tools: knowledge_search, rag_ingest, unifiedRagSearch. Tables: public.documents @1024.',
    use_cases = '["documents","knowledge","autorag","unified_rag"]',
    updated_at = datetime('now')
WHERE id = 'vidx_aisearch';

-- Deactivate the legacy binding row that no longer exists in wrangler.
UPDATE vectorize_index_registry
SET is_active = 0,
    is_preferred = 0,
    updated_at = datetime('now')
WHERE id = 'vidx_autorag'
  AND binding_name = 'VECTORIZE_INDEX';

