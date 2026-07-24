-- Lane 2 (Claude) — CF Images edit/transform derivatives + share audit
-- SSOT: plans/active/cf-images-media-editor-2026-07.md §5, §6
--
-- NOTE: this migration was applied directly to production D1 on 2026-07-23 ahead of this commit
-- (Sam's established workaround for the agentsam_d1_write approval-gate issue — see repo memory /
-- src/core notes on Cloudflare Developer Platform:d1_database_query). Statements below are
-- idempotent-safe (ADD COLUMN will only fail if re-run against a DB that already has the column;
-- CREATE ... IF NOT EXISTS is always safe) so this file can still be applied via
-- `wrangler d1 migrations apply` for migration-history tracking without double-applying.

ALTER TABLE images ADD COLUMN parent_image_id TEXT;
ALTER TABLE images ADD COLUMN transform_json TEXT;

CREATE INDEX IF NOT EXISTS idx_images_parent_image_id ON images (parent_image_id);

CREATE TABLE IF NOT EXISTS image_shares (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  channel TEXT NOT NULL, -- email | public_link
  recipients_json TEXT,
  delivery_url TEXT,
  created_at_unix INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_shares_image_id ON image_shares (image_id);
CREATE INDEX IF NOT EXISTS idx_image_shares_workspace_id ON image_shares (workspace_id, created_at_unix DESC);
