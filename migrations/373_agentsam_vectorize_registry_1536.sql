-- 373: Register AGENTSAMVECTORIZE → inneranimalmedia-vectors (1536 cosine) in D1 dashboard registry.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/373_agentsam_vectorize_registry_1536.sql

INSERT OR IGNORE INTO vectorize_index_registry (
  id,
  tenant_id,
  binding_name,
  index_name,
  display_name,
  source_type,
  source_r2_bucket,
  source_r2_prefix,
  dimensions,
  metric,
  is_preferred,
  is_active,
  stored_vectors,
  queries_30d,
  avg_latency_ms,
  description,
  use_cases,
  created_at,
  updated_at
) VALUES (
  'vidx_agentsam_vectors',
  'tenant_sam_primeaux',
  'AGENTSAMVECTORIZE',
  'inneranimalmedia-vectors',
  'Agent Sam — semantic memory & code (1536)',
  'vectorize',
  NULL,
  NULL,
  1536,
  'cosine',
  1,
  1,
  0,
  0,
  0,
  'Cloudflare Vectorize index for Agent Sam curated memory (public.agent_memory) and 1536-d code_chunks. Worker binding env.AGENTSAMVECTORIZE. Embeddings: OpenAI text-embedding-3-large @1536. Distinct from VECTORIZE / ai-search-inneranimalmedia-autorag @1024.',
  '["agent_memory","code_chunks","semantic_recall","chat_context"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry
SET
  binding_name = 'AGENTSAMVECTORIZE',
  index_name = 'inneranimalmedia-vectors',
  display_name = 'Agent Sam — semantic memory & code (1536)',
  source_type = 'vectorize',
  dimensions = 1536,
  metric = 'cosine',
  is_preferred = 1,
  is_active = 1,
  description = 'Cloudflare Vectorize index for Agent Sam curated memory (public.agent_memory) and 1536-d code_chunks. Worker binding env.AGENTSAMVECTORIZE. Embeddings: OpenAI text-embedding-3-large @1536. Distinct from VECTORIZE / ai-search-inneranimalmedia-autorag @1024.',
  use_cases = '["agent_memory","code_chunks","semantic_recall","chat_context"]',
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_vectors';
