-- 619: Intent → RAG lane order (schema-first, code-first, docs-first routing).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/619_agentsam_rag_intent_routes.sql

CREATE TABLE IF NOT EXISTS agentsam_rag_intent_routes (
  id TEXT PRIMARY KEY,
  intent_key TEXT NOT NULL UNIQUE,
  lane_order_json TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_rag_intent_routes_active
  ON agentsam_rag_intent_routes(is_active, intent_key);

INSERT OR IGNORE INTO agentsam_rag_intent_routes (id, intent_key, lane_order_json, description, is_active, updated_at)
VALUES
  ('rag_intent_schema', 'schema_question', '["schema_semantic_search","docs_knowledge_search","code_semantic_search"]', 'D1/Supabase table, migration, column questions', 1, unixepoch()),
  ('rag_intent_code', 'code_question', '["code_semantic_search","docs_knowledge_search","schema_semantic_search"]', 'Routes, components, handlers, files', 1, unixepoch()),
  ('rag_intent_docs', 'docs_question', '["docs_knowledge_search","memory_semantic_search","code_semantic_search"]', 'Runbooks, recipes, roadmaps, workflows', 1, unixepoch()),
  ('rag_intent_memory', 'memory_question', '["memory_semantic_search","docs_knowledge_search"]', 'Prior decisions, session recall', 1, unixepoch()),
  ('rag_intent_create_surfaces', 'create_surfaces', '["code_semantic_search","docs_knowledge_search","memory_semantic_search"]', 'Design Studio, CMS, Draw, Movie Mode shell', 1, unixepoch()),
  ('rag_intent_architecture', 'architecture_question', '["deep_archive_search","docs_knowledge_search","schema_semantic_search"]', 'Golden platform decisions (3072 archive)', 1, unixepoch());
