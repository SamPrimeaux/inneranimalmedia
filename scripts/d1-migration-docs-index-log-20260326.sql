-- Docs vector index tracking (D1). Run manually against inneranimalmedia-business.
-- Requires UNIQUE(key) so INSERT OR REPLACE in worker.js upserts one row per object key.

CREATE TABLE IF NOT EXISTS docs_index_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  chunk_count INTEGER,
  indexed_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  source TEXT DEFAULT 'r2',
  status TEXT DEFAULT 'indexed'
);

CREATE INDEX IF NOT EXISTS idx_docs_index_log_key ON docs_index_log(key);
