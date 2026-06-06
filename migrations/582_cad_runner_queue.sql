-- 582: CAD runner queue columns for agentsam_cad_jobs (Design Studio off-edge execution).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/582_cad_runner_queue.sql

ALTER TABLE agentsam_cad_jobs ADD COLUMN runner_host TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN started_at INTEGER;
ALTER TABLE agentsam_cad_jobs ADD COLUMN finished_at INTEGER;
ALTER TABLE agentsam_cad_jobs ADD COLUMN r2_bucket TEXT DEFAULT 'inneranimalmedia';
ALTER TABLE agentsam_cad_jobs ADD COLUMN error_code TEXT;

CREATE INDEX IF NOT EXISTS idx_cad_jobs_runner_poll
  ON agentsam_cad_jobs(status, created_at)
  WHERE status IN ('pending', 'running');
