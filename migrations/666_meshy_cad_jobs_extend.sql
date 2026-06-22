-- 666: Extend agentsam_cad_jobs for Meshy task types (Design Studio Phase 0/1).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/666_meshy_cad_jobs_extend.sql
--
-- Safe re-run: duplicate column errors mean column already exists — skip that statement.

ALTER TABLE agentsam_cad_jobs ADD COLUMN task_type TEXT DEFAULT 'text-to-3d';
ALTER TABLE agentsam_cad_jobs ADD COLUMN parent_task_id TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN rig_task_id TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN credits_consumed INTEGER DEFAULT 0;
ALTER TABLE agentsam_cad_jobs ADD COLUMN model_formats TEXT;
ALTER TABLE agentsam_cad_jobs ADD COLUMN texture_data TEXT;

CREATE INDEX IF NOT EXISTS idx_cad_jobs_meshy_task_type
  ON agentsam_cad_jobs(engine, task_type, status, created_at)
  WHERE engine = 'meshy';
