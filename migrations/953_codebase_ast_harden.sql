-- 953: AST-RAG schema harden — external edges, node identity, parent_node_id.
-- Apply after Phase 1 upsert settles (or wipe partial rows first).
--
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/953_codebase_ast_harden.sql

-- 1) Node identity + containment
CREATE UNIQUE INDEX IF NOT EXISTS idx_ast_nodes_identity
  ON codebase_ast_nodes (workspace_id, repo, file_path, node_name, node_type, line_start);

-- SQLite: ADD COLUMN is safe / idempotent-ish via try; use table rebuild only for edges FK nullability.
-- parent_node_id: nullable self-FK for method→class / nested arrows.
-- (SQLite ignores FK add on existing tables unless rebuilt; column still useful for Phase 2.)
ALTER TABLE codebase_ast_nodes ADD COLUMN parent_node_id TEXT;

-- 2) Rebuild codebase_dep_edges so target_node_id is nullable + target_external exists.
CREATE TABLE IF NOT EXISTS codebase_dep_edges_new (
  id TEXT PRIMARY KEY DEFAULT ('edge_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  repo TEXT NOT NULL,
  source_node_id TEXT NOT NULL REFERENCES codebase_ast_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT REFERENCES codebase_ast_nodes(id) ON DELETE CASCADE,
  target_external TEXT,
  edge_type TEXT NOT NULL CHECK(edge_type IN (
    'imports','calls','exports','extends','implements',
    'uses_hook','re_exports','type_references'
  )),
  source_file TEXT NOT NULL,
  target_file TEXT NOT NULL,
  is_external INTEGER NOT NULL DEFAULT 0,
  index_job_id TEXT REFERENCES agentsam_code_index_job(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(source_node_id, target_node_id, edge_type),
  CHECK (
    (is_external = 0 AND target_node_id IS NOT NULL AND target_external IS NULL)
    OR
    (is_external = 1 AND target_external IS NOT NULL AND target_node_id IS NULL)
  )
);

INSERT OR IGNORE INTO codebase_dep_edges_new (
  id, workspace_id, repo, source_node_id, target_node_id, target_external,
  edge_type, source_file, target_file, is_external, index_job_id, created_at
)
SELECT
  id, workspace_id, repo, source_node_id, target_node_id, NULL,
  edge_type, source_file, target_file, is_external, index_job_id, created_at
FROM codebase_dep_edges
WHERE COALESCE(is_external, 0) = 0 AND target_node_id IS NOT NULL;

DROP TABLE codebase_dep_edges;
ALTER TABLE codebase_dep_edges_new RENAME TO codebase_dep_edges;

CREATE INDEX IF NOT EXISTS idx_dep_edges_workspace_repo
  ON codebase_dep_edges (workspace_id, repo);
CREATE INDEX IF NOT EXISTS idx_dep_edges_source
  ON codebase_dep_edges (source_node_id);
CREATE INDEX IF NOT EXISTS idx_dep_edges_target
  ON codebase_dep_edges (target_node_id);
CREATE INDEX IF NOT EXISTS idx_dep_edges_type
  ON codebase_dep_edges (edge_type);
CREATE INDEX IF NOT EXISTS idx_dep_edges_external
  ON codebase_dep_edges (target_external);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dep_edges_external_identity
  ON codebase_dep_edges (source_node_id, edge_type, target_external)
  WHERE is_external = 1;
