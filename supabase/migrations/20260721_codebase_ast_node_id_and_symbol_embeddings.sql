-- Supabase: link codebase chunks ↔ AST nodes + symbol-signature embeddings for Graph RAG hydrate.
-- Apply via Supabase SQL editor / MCP apply_migration (not D1 wrangler).
--
-- Hydrate pattern (Worker Hyperdrive):
--   1) D1: AST search + graph expand → node_ids[]
--   2) PG:  SELECT c.content, c.file_path, c.node_id
--           FROM agentsam.agentsam_codebase_chunks_oai3large_1536 c
--           WHERE c.node_id = ANY($1::text[])
--   OR symbol ANN:
--           SELECT * FROM agentsam.agentsam_codebase_ast_symbols_oai3large_1536
--           ORDER BY embedding <=> $query LIMIT k
--           then join chunks on node_id / file_path+line overlap

ALTER TABLE agentsam.agentsam_codebase_chunks_oai3large_1536
  ADD COLUMN IF NOT EXISTS node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agentsam_codebase_chunks_node_id
  ON agentsam.agentsam_codebase_chunks_oai3large_1536 (node_id)
  WHERE node_id IS NOT NULL;

-- Symbol / signature embeddings (HNSW) — separate from file chunks.
-- Embed node.signature (+ short docstring) @1536; store node_id as PK link to D1.
CREATE TABLE IF NOT EXISTS agentsam.agentsam_codebase_ast_symbols_oai3large_1536 (
  node_id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  repo TEXT NOT NULL,
  file_path TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_name TEXT NOT NULL,
  signature TEXT,
  line_start INTEGER,
  line_end INTEGER,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ast_symbols_workspace_repo
  ON agentsam.agentsam_codebase_ast_symbols_oai3large_1536 (workspace_id, repo);

CREATE INDEX IF NOT EXISTS idx_ast_symbols_file
  ON agentsam.agentsam_codebase_ast_symbols_oai3large_1536 (workspace_id, repo, file_path);

-- HNSW cannot run inside some migration wrappers — also provided as MANUAL_APPLY below.
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ast_symbols_embedding_hnsw
--   ON agentsam.agentsam_codebase_ast_symbols_oai3large_1536
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
