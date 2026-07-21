-- MANUAL_APPLY (Supabase SQL editor — CONCURRENTLY cannot run in a transaction):
-- HNSW on AST symbol embeddings for signature ANN.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ast_symbols_embedding_hnsw
  ON agentsam.agentsam_codebase_ast_symbols_oai3large_1536
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
