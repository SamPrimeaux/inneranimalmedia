-- 118: R2 cleanup workflow — r2_bucket_summary columns for agent-assisted cleanup
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/118_r2_bucket_summary_cleanup_columns.sql
-- Purpose: cleanup_status, cleanup_notes, owner, project_ref for agent to propose and UI to bulk-execute.

ALTER TABLE r2_bucket_summary ADD COLUMN cleanup_status TEXT DEFAULT 'unreviewed';
ALTER TABLE r2_bucket_summary ADD COLUMN cleanup_notes TEXT;
ALTER TABLE r2_bucket_summary ADD COLUMN owner TEXT;
ALTER TABLE r2_bucket_summary ADD COLUMN project_ref TEXT;

-- Allowed cleanup_status: unreviewed, keep, archive, delete, needs-review (enforce in app)
-- Note: last_inventoried_at already exists on r2_bucket_summary (do not add again).
-- Optional: r2_object_inventory UNIQUE(bucket_name, object_key) for INSERT ... ON CONFLICT in sync.
