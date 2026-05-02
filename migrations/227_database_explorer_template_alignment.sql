-- 227: Align Database Explorer / unified-search tables with template columns + project_files.
--
-- Prerequisites: migrations/225_database_explorer_unified_search.sql MUST be applied first.
-- Do NOT run the alternate "225_database_explorer.sql" from external templates: it conflicts
-- with 225 (different column names: sql_text vs query_text, db_target vs database_type, etc.).
-- The worker reads the 225 shape; this migration only adds optional columns and project_files.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/227_database_explorer_template_alignment.sql

-- ai_query_history: template extras (canonical columns remain user_id, db_target, sql_text, ok, row_count, error_message, duration_ms)
ALTER TABLE ai_query_history ADD COLUMN workspace_id TEXT;
ALTER TABLE ai_query_history ADD COLUMN database_name TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_query_history_workspace_created
  ON ai_query_history(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_query_history_db_target_created
  ON ai_query_history(db_target, created_at DESC);

-- ai_query_snippets: description, tags, workspace (title + sql_text + db_target stay canonical)
ALTER TABLE ai_query_snippets ADD COLUMN workspace_id TEXT;
ALTER TABLE ai_query_snippets ADD COLUMN description TEXT;
ALTER TABLE ai_query_snippets ADD COLUMN tags TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_query_snippets_workspace_title
  ON ai_query_snippets(workspace_id, title);

-- ai_search_analytics: template-style columns alongside result_kind / opened_id
ALTER TABLE ai_search_analytics ADD COLUMN workspace_id TEXT;
ALTER TABLE ai_search_analytics ADD COLUMN result_type TEXT;
ALTER TABLE ai_search_analytics ADD COLUMN result_id TEXT;
ALTER TABLE ai_search_analytics ADD COLUMN position INTEGER;

CREATE INDEX IF NOT EXISTS idx_ai_search_analytics_workspace_created
  ON ai_search_analytics(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_search_analytics_query
  ON ai_search_analytics(query);

-- Optional file index for unified search / recent (populate from app or ingest jobs)
CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  content_hash TEXT,
  size_bytes INTEGER,
  last_modified INTEGER,
  last_accessed INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_project_files_workspace_access
  ON project_files(workspace_id, last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_project_files_name ON project_files(name);
CREATE INDEX IF NOT EXISTS idx_project_files_path ON project_files(path);

-- Verify
SELECT 'Migration 227 applied (template alignment + project_files).' AS status;
SELECT COUNT(*) AS table_hits FROM sqlite_master
WHERE type = 'table' AND name IN ('ai_query_history', 'ai_query_snippets', 'ai_search_analytics', 'project_files');
