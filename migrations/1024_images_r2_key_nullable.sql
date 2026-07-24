-- CF Images hosted assets must not invent an R2 object key.
-- r2_key = R2 object path only (NULL when CF-hosted-only or Drive-browse not imported).
-- cloudflare_image_id = CF Images UUID only (NULL when R2-only).
-- SQLite: recreate table to drop NOT NULL on r2_key; UNIQUE still allows multiple NULLs.

PRAGMA foreign_keys = OFF;

CREATE TABLE images__r2_nullable (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  project_id TEXT,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  r2_key TEXT UNIQUE,
  cloudflare_image_id TEXT,
  url TEXT,
  thumbnail_url TEXT,
  alt_text TEXT,
  description TEXT,
  tags TEXT,
  metadata TEXT,
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  workspace_id TEXT,
  parent_image_id TEXT,
  transform_json TEXT
);

INSERT INTO images__r2_nullable (
  id, tenant_id, project_id, user_id, filename, original_filename,
  mime_type, size, width, height, r2_key, cloudflare_image_id,
  url, thumbnail_url, alt_text, description, tags, metadata, status,
  created_at, updated_at, workspace_id, parent_image_id, transform_json
)
SELECT
  id, tenant_id, project_id, user_id, filename, original_filename,
  mime_type, size, width, height,
  CASE
    WHEN r2_key IS NULL OR trim(r2_key) = '' THEN NULL
    WHEN r2_key LIKE '__cf_hosted__/%' THEN NULL
    ELSE r2_key
  END,
  cloudflare_image_id,
  url, thumbnail_url, alt_text, description, tags, metadata, status,
  created_at, updated_at, workspace_id, parent_image_id, transform_json
FROM images;

DROP TABLE images;
ALTER TABLE images__r2_nullable RENAME TO images;

CREATE INDEX IF NOT EXISTS idx_images_user_workspace_status
  ON images (user_id, workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_images_cloudflare_image_id
  ON images (cloudflare_image_id);
CREATE INDEX IF NOT EXISTS idx_images_parent_image_id
  ON images (parent_image_id);

PRAGMA foreign_keys = ON;
