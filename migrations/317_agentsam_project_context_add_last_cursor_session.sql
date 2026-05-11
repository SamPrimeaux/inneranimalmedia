-- Align production with post-deploy hook + ingest-d1-memory (migration 279 may not have run).
-- Safe to re-run: fails with duplicate column if already present — apply once via wrangler or rely on post-deploy ALTER ... || true.
ALTER TABLE agentsam_project_context ADD COLUMN last_cursor_session TEXT;
