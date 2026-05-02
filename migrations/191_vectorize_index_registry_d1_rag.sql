-- 191: vectorize_index_registry — placeholder manual row (historical id vidx_d1_cosine_knowledge).
-- Run 192 after this on fresh DBs to relabel TOOLS/agent workspace (vidx_tools_agent_workspace).
-- binding_name must be UNIQUE; VECTORIZE / VECTORIZE_INDEX / VECTORIZE_DOCS already used.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/191_vectorize_index_registry_d1_rag.sql

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
  'vidx_d1_cosine_knowledge',
  'tenant_sam_primeaux',
  'MANUAL_D1_RAG',
  'd1-ai_knowledge_chunks',
  'D1 cosine RAG (ai_knowledge_chunks)',
  'manual',
  NULL,
  NULL,
  768,
  'cosine',
  0,
  1,
  0,
  0,
  0,
  'Not a Vectorize binding. Documents the custom RAG path: Workers AI embeddings and cosine similarity on D1 ai_knowledge_chunks; complements autorag Vectorize rows for routing and dashboards.',
  '["rag_ingest","rag_query","agent_context","iam_pipeline_docs"]',
  datetime('now'),
  datetime('now')
);
