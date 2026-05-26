-- Design Studio scene_snapshots (D1 metadata + R2 entity blobs).
-- Idempotent: table may already exist on production.

CREATE TABLE IF NOT EXISTS scene_snapshots (
  id TEXT PRIMARY KEY DEFAULT ('scene_' || lower(hex(randomblob(8)))),
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled Scene',
  project_type TEXT NOT NULL DEFAULT 'SANDBOX',
  entity_count INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  r2_bucket TEXT NOT NULL DEFAULT 'inneranimalmedia',
  public_url TEXT,
  thumbnail_r2_key TEXT,
  thumbnail_url TEXT,
  tags TEXT DEFAULT '[]',
  description TEXT,
  is_autosave INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_scene_snapshots_ws_user
  ON scene_snapshots (workspace_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_scene_snapshots_ws_autosave
  ON scene_snapshots (workspace_id, user_id, is_autosave);
