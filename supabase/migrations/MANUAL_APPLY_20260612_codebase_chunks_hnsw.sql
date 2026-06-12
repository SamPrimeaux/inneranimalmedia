-- MANUAL_APPLY: IVFFlat → HNSW on agentsam codebase chunks (interactive semantic search).
-- Run in Supabase SQL editor when ready (CONCURRENTLY cannot run inside a transaction).
-- Requires: agentsam.agentsam_codebase_chunks_oai3large_1536 with embedding vector(1536).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agentsam_codebase_chunks_embedding_hnsw
  ON agentsam.agentsam_codebase_chunks_oai3large_1536
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- After verifying query plans use HNSW, optionally drop legacy IVFFlat:
-- DROP INDEX CONCURRENTLY IF EXISTS agentsam.idx_agentsam_codebase_chunks_embedding;
