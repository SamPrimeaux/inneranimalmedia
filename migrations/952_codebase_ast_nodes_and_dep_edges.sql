-- 952: Codebase AST nodes + dependency edges (Graph/AST RAG Phase 1).
-- LIVE: already applied remotely (tables + indexes present). This file is the
-- git SSOT so local/sandbox D1 and future rebuilds stay aligned.
--
-- Apply (idempotent):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/952_codebase_ast_nodes_and_dep_edges.sql
--
-- Stack pairing (no new Vectorize / no new Supabase table):
--   D1 codebase_ast_nodes / codebase_dep_edges  → structural metadata
--   Vectorize AGENTSAM_VECTORIZE_CODE             → semantic cache (existing)
--   Supabase agentsam_codebase_chunks_oai3large_1536 → full chunk text (existing; add node_id TEXT later)

CREATE TABLE IF NOT EXISTS codebase_ast_nodes (
  id TEXT PRIMARY KEY DEFAULT ('node_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  file_path TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK(node_type IN (
    'function','class','method','arrow_function',
    'component','hook','export','import',
    'type_alias','interface','const','variable'
  )),
  node_name TEXT NOT NULL,
  signature TEXT,
  docstring TEXT,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  is_exported INTEGER NOT NULL DEFAULT 0,
  is_default_export INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'js' CHECK(language IN ('js','jsx','ts','tsx','mjs','cjs')),
  vectorize_id TEXT,
  embedding_model TEXT DEFAULT 'text-embedding-3-large',
  file_hash TEXT,
  index_job_id TEXT REFERENCES agentsam_code_index_job(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ast_nodes_workspace_repo
  ON codebase_ast_nodes (workspace_id, repo);
CREATE INDEX IF NOT EXISTS idx_ast_nodes_file
  ON codebase_ast_nodes (workspace_id, repo, file_path);
CREATE INDEX IF NOT EXISTS idx_ast_nodes_name
  ON codebase_ast_nodes (node_name);
CREATE INDEX IF NOT EXISTS idx_ast_nodes_type
  ON codebase_ast_nodes (node_type);

CREATE TABLE IF NOT EXISTS codebase_dep_edges (
  id TEXT PRIMARY KEY DEFAULT ('edge_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  source_node_id TEXT NOT NULL REFERENCES codebase_ast_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES codebase_ast_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK(edge_type IN (
    'imports','calls','exports','extends','implements',
    'uses_hook','re_exports','type_references'
  )),
  source_file TEXT NOT NULL,
  target_file TEXT NOT NULL,
  is_external INTEGER NOT NULL DEFAULT 0,
  index_job_id TEXT REFERENCES agentsam_code_index_job(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(source_node_id, target_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_dep_edges_workspace_repo
  ON codebase_dep_edges (workspace_id, repo);
CREATE INDEX IF NOT EXISTS idx_dep_edges_source
  ON codebase_dep_edges (source_node_id);
CREATE INDEX IF NOT EXISTS idx_dep_edges_target
  ON codebase_dep_edges (target_node_id);
CREATE INDEX IF NOT EXISTS idx_dep_edges_type
  ON codebase_dep_edges (edge_type);
