-- Browser jobs: align D1 schema with handlePlaywrightJobApi (filters by user_id).
-- Apply remote: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/281_playwright_jobs_user_workspace.sql
--
-- Note: production already had workspace_id (and many workflow columns). Only user_id was missing.

ALTER TABLE playwright_jobs ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_playwright_jobs_user_created ON playwright_jobs(user_id, created_at DESC);
