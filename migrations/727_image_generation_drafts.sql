-- 727: Draft image generations — preview-only until user commits to library.
-- AI creates drafts. Users create canon.

CREATE TABLE IF NOT EXISTS image_generation_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  tenant_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  r2_key TEXT NOT NULL,
  r2_bucket TEXT NOT NULL DEFAULT 'inneranimalmedia',
  preview_url TEXT,
  purpose TEXT,
  prompt TEXT,
  provider TEXT,
  model TEXT,
  width INTEGER,
  height INTEGER,
  expires_at INTEGER NOT NULL,
  committed_image_id TEXT,
  committed_r2_key TEXT,
  committed_asset_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_generation_drafts_user_status
  ON image_generation_drafts(user_id, status, expires_at);
