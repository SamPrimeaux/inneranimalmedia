-- 747: Meshy CAD reconcile hot path — match cron/poll WHERE (engine, status, updated_at).
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/747_cad_jobs_meshy_reconcile_index.sql

CREATE INDEX IF NOT EXISTS idx_cad_jobs_meshy_reconcile
  ON agentsam_cad_jobs(engine, status, updated_at)
  WHERE engine = 'meshy';
