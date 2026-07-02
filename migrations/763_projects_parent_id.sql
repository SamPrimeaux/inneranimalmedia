-- 763: Canonical parent project link on D1 projects (mirrored to Supabase parent_id).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/763_projects_parent_id.sql

ALTER TABLE projects ADD COLUMN parent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON projects(parent_id);

-- Backfill from metadata_json.parent_id when present
UPDATE projects
SET parent_id = json_extract(metadata_json, '$.parent_id')
WHERE (parent_id IS NULL OR TRIM(COALESCE(parent_id, '')) = '')
  AND json_extract(metadata_json, '$.parent_id') IS NOT NULL
  AND TRIM(json_extract(metadata_json, '$.parent_id')) != '';
