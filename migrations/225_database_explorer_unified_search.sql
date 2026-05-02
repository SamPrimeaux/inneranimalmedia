-- Dashboard: SQL console history, saved snippets, unified-search analytics.
-- Apply with: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/225_database_explorer_unified_search.sql
--
-- Template variants that use query_text / database_type / workspace_id on these tables conflict
-- with this file. After 225, optional alignment: migrations/227_database_explorer_template_alignment.sql

CREATE TABLE IF NOT EXISTS ai_query_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  db_target TEXT NOT NULL DEFAULT 'd1',
  sql_text TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1,
  row_count INTEGER,
  error_message TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ai_query_history_user_created
  ON ai_query_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_query_snippets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sql_text TEXT NOT NULL,
  db_target TEXT NOT NULL DEFAULT 'd1',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ai_query_snippets_user_updated
  ON ai_query_snippets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_search_analytics (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  query TEXT NOT NULL,
  result_kind TEXT,
  opened_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ai_search_analytics_user_created
  ON ai_search_analytics(user_id, created_at DESC);
