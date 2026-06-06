-- Migration 585: fix vectorize_sync_log.vectorize_index stale default
-- SQLite can't ALTER COLUMN DEFAULT, so rename → recreate → copy → drop.
-- The old default 'ai-search-iam-autorag' never existed as a real index.
-- All real rows have explicit values from vectorize_index_registry.index_name.
-- New default: NULL forces callers to supply the index explicitly.

PRAGMA foreign_keys = OFF;

ALTER TABLE vectorize_sync_log RENAME TO _vectorize_sync_log_old;

CREATE TABLE vectorize_sync_log (
  chunk_id       TEXT PRIMARY KEY,
  vectorize_index TEXT NOT NULL,           -- no default: must be explicit
  status         TEXT NOT NULL DEFAULT 'ok',
  synced_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO vectorize_sync_log (chunk_id, vectorize_index, status, synced_at)
SELECT chunk_id, vectorize_index, status, synced_at
FROM _vectorize_sync_log_old;

DROP TABLE _vectorize_sync_log_old;

PRAGMA foreign_keys = ON;

-- Verify
SELECT COUNT(*) AS migrated_rows FROM vectorize_sync_log;
