-- 760: Track mandatory Supabase mirror state on D1 projects rows.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/760_projects_supabase_sync_columns.sql

ALTER TABLE projects ADD COLUMN supabase_sync_status TEXT DEFAULT 'pending';
ALTER TABLE projects ADD COLUMN supabase_sync_error TEXT;
ALTER TABLE projects ADD COLUMN supabase_synced_at TEXT;
ALTER TABLE projects ADD COLUMN supabase_sync_attempts INTEGER DEFAULT 0;

UPDATE projects
SET supabase_sync_status = 'pending', supabase_sync_attempts = 0
WHERE supabase_sync_status IS NULL OR supabase_sync_status = '';
