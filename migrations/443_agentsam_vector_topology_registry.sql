-- 443: Unified vector topology — Supabase pgvector lane registry + Agent Sam Vectorize rows.
--
-- Apply:
--   cd /Users/samprimeaux/inneranimalmedia
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/443_agentsam_vector_topology_registry.sql

CREATE TABLE IF NOT EXISTS agentsam_pgvector_lane_registry (
  id TEXT PRIMARY KEY NOT NULL,
  schema_name TEXT NOT NULL DEFAULT 'agentsam',
  table_name TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  metric TEXT NOT NULL DEFAULT 'cosine',
  embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
  size_label TEXT,
  size_bytes INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_archive INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Supabase agentsam.* pgvector lanes (canonical for agentsam_vectorize_describe)
INSERT OR IGNORE INTO agentsam_pgvector_lane_registry (
  id, schema_name, table_name, purpose, dimensions, metric, embedding_model,
  size_label, size_bytes, is_active, is_archive, description
) VALUES
(
  'pgv_database_schema_1536',
  'agentsam',
  'agentsam_database_schema_oai3large_1536',
  'database_schema',
  1536,
  'cosine',
  'text-embedding-3-large',
  '11 MB',
  11534336,
  1,
  0,
  'Supabase agentsam schema catalog chunks @1536'
),
(
  'pgv_documents_1536',
  'agentsam',
  'agentsam_documents_oai3large_1536',
  'documents',
  1536,
  'cosine',
  'text-embedding-3-large',
  '5.1 MB',
  5347738,
  1,
  0,
  'Supabase course/document chunks @1536'
),
(
  'pgv_memory_1536',
  'agentsam',
  'agentsam_memory_oai3large_1536',
  'memory',
  1536,
  'cosine',
  'text-embedding-3-large',
  '1.8 MB',
  1887437,
  1,
  0,
  'Supabase curated memory lane @1536 (pairs with AGENTSAM_VECTORIZE_MEMORY)'
),
(
  'pgv_codebase_chunks_1536',
  'agentsam',
  'agentsam_codebase_chunks_oai3large_1536',
  'codebase_chunks',
  1536,
  'cosine',
  'text-embedding-3-large',
  '1.6 MB',
  1677722,
  1,
  0,
  'Supabase codebase chunk embeddings @1536'
),
(
  'pgv_schema_1536',
  'agentsam',
  'agentsam_schema_oai3large_1536',
  'schema',
  1536,
  'cosine',
  'text-embedding-3-large',
  '296 kB',
  303104,
  1,
  0,
  'Supabase structural schema snippets @1536'
),
(
  'pgv_codebase_files_1536',
  'agentsam',
  'agentsam_codebase_files_oai3large_1536',
  'codebase_files',
  1536,
  'cosine',
  'text-embedding-3-large',
  '32 kB',
  32768,
  1,
  0,
  'Supabase file-level codebase metadata @1536'
),
(
  'pgv_deep_archive_3072',
  'agentsam',
  'agentsam_deep_archive_oai3large_3072',
  'deep_archive',
  3072,
  'cosine',
  'text-embedding-3-large',
  '160 kB',
  163840,
  1,
  1,
  'High-resolution archive lane @3072 — query vectors must be 3072-d'
);

UPDATE agentsam_pgvector_lane_registry SET is_active = 1, updated_at = datetime('now')
WHERE id IN (
  'pgv_database_schema_1536',
  'pgv_documents_1536',
  'pgv_memory_1536',
  'pgv_codebase_chunks_1536',
  'pgv_schema_1536',
  'pgv_codebase_files_1536',
  'pgv_deep_archive_3072'
);

-- Agent Sam Vectorize specialty indexes (wrangler.production.toml bindings)
INSERT OR IGNORE INTO vectorize_index_registry (
  id, binding_name, index_name, display_name, source_type,
  dimensions, metric, is_preferred, is_active,
  description, use_cases, created_at, updated_at
) VALUES
(
  'vidx_agentsam_memory',
  'AGENTSAM_VECTORIZE_MEMORY',
  'agentsam-memory-oai3large-1536',
  'Agent Sam memory (1536)',
  'manual',
  1536,
  'cosine',
  0,
  1,
  'Curated memory Vectorize lane; pairs with agentsam_memory_oai3large_1536.',
  '["memory","semantic_recall"]',
  datetime('now'),
  datetime('now')
),
(
  'vidx_agentsam_code',
  'AGENTSAM_VECTORIZE_CODE',
  'agentsam-codebase-oai3large-1536',
  'Agent Sam codebase (1536)',
  'manual',
  1536,
  'cosine',
  0,
  1,
  'Codebase chunk Vectorize lane; pairs with agentsam_codebase_chunks_oai3large_1536.',
  '["codebase","code_search"]',
  datetime('now'),
  datetime('now')
),
(
  'vidx_agentsam_courses',
  'AGENTSAM_VECTORIZE_COURSES',
  'agentsam-courses-oai3large-1536',
  'Agent Sam courses (1536)',
  'manual',
  1536,
  'cosine',
  0,
  1,
  'Course/document Vectorize lane; pairs with agentsam_documents_oai3large_1536.',
  '["courses","documents"]',
  datetime('now'),
  datetime('now')
),
(
  'vidx_agentsam_schema',
  'AGENTSAM_VECTORIZE_SCHEMA',
  'agentsam-schema-oai3large-1536',
  'Agent Sam schema (1536)',
  'manual',
  1536,
  'cosine',
  0,
  1,
  'Schema snippet Vectorize lane; pairs with agentsam_schema_oai3large_1536.',
  '["schema","database_schema"]',
  datetime('now'),
  datetime('now')
);

UPDATE vectorize_index_registry SET
  binding_name = 'AGENTSAM_VECTORIZE_MEMORY',
  index_name = 'agentsam-memory-oai3large-1536',
  display_name = 'Agent Sam memory (1536)',
  dimensions = 1536,
  metric = 'cosine',
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_memory';

UPDATE vectorize_index_registry SET
  binding_name = 'AGENTSAM_VECTORIZE_CODE',
  index_name = 'agentsam-codebase-oai3large-1536',
  display_name = 'Agent Sam codebase (1536)',
  dimensions = 1536,
  metric = 'cosine',
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_code';

UPDATE vectorize_index_registry SET
  binding_name = 'AGENTSAM_VECTORIZE_COURSES',
  index_name = 'agentsam-courses-oai3large-1536',
  display_name = 'Agent Sam courses (1536)',
  dimensions = 1536,
  metric = 'cosine',
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_courses';

UPDATE vectorize_index_registry SET
  binding_name = 'AGENTSAM_VECTORIZE_SCHEMA',
  index_name = 'agentsam-schema-oai3large-1536',
  display_name = 'Agent Sam schema (1536)',
  dimensions = 1536,
  metric = 'cosine',
  is_active = 1,
  updated_at = datetime('now')
WHERE id = 'vidx_agentsam_schema';

UPDATE agentsam_tools
SET input_schema = '{"type":"object","properties":{"namespace":{"type":"string","description":"Optional CF index id, binding, or index_name filter"},"tier":{"type":"string","enum":["all","custom","supabase"],"default":"all","description":"all=both providers; custom=default CF index only; supabase=pgvector lanes only"},"provider":{"type":"string","enum":["cloudflare_vectorize","supabase_pgvector"],"description":"Filter to one provider"},"dimensions":{"type":"integer","enum":[1536,3072],"description":"Filter lanes by embedding width"},"purpose":{"type":"string","description":"Filter by lane purpose (memory, codebase, deep_archive, …)"}},"additionalProperties":false}',
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_vectorize_describe';
