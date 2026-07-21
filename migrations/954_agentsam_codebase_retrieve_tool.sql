-- 954: Register agentsam_codebase_retrieve (Phase 4 surface) — inactive until executor wired.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/954_agentsam_codebase_retrieve_tool.sql
--
-- Runtime: src/core/codebase-ast-retrieve.js → retrieveCodebaseAstContext
-- Phase 2 must populate agentsam_codebase_ast_symbols_* before this tool is useful.

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, handler_key, handler_config,
  description, input_schema,
  risk_level, requires_approval, requires_confirmation,
  is_active, is_global, workspace_scope, oauth_visible, dispatch_target,
  sort_priority, updated_at
) VALUES (
  'ast_agentsam_codebase_retrieve',
  'agentsam_codebase_retrieve',
  'agentsam_codebase_retrieve',
  'Codebase AST retrieve',
  'local',
  'code',
  'agentsam_codebase_retrieve',
  '{"module":"codebase-ast-retrieve","export":"retrieveCodebaseAstContext","operation":"retrieve"}',
  'Graph RAG over codebase: symbol ANN (pgvector) → D1 dependency expand → Hyperdrive chunk hydrate by node_id. Prefer before code edits.',
  '{"type":"object","properties":{"query":{"type":"string","description":"Natural language or symbol query"},"top_k":{"type":"integer","minimum":1,"maximum":32},"repo":{"type":"string"},"expand":{"type":"boolean","default":true},"hydrate":{"type":"boolean","default":true}},"required":["query"],"additionalProperties":false}',
  'low',
  0,
  0,
  0,
  1,
  '["*"]',
  0,
  'internal',
  55,
  unixepoch()
);

-- Prefer activate after catalog-tool-executor wires the handler:
-- UPDATE agentsam_tools SET is_active = 1, oauth_visible = 1, updated_at = unixepoch()
-- WHERE tool_key = 'agentsam_codebase_retrieve';

INSERT OR IGNORE INTO agentsam_pgvector_lane_registry (
  id, schema_name, table_name, purpose, dimensions, metric, embedding_model,
  size_label, is_active, is_archive, description
) VALUES (
  'pgv_codebase_ast_symbols_1536',
  'agentsam',
  'agentsam_codebase_ast_symbols_oai3large_1536',
  'codebase_ast_symbols',
  1536,
  'cosine',
  'text-embedding-3-large',
  NULL,
  1,
  0,
  'AST symbol/signature embeddings for Graph RAG (pairs with D1 codebase_ast_nodes)'
);
