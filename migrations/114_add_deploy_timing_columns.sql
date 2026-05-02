-- 114: Add build_time_seconds and deploy_time_seconds to cloudflare_deployments (never NULL in new inserts)
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/114_add_deploy_timing_columns.sql
-- Purpose: Post-deploy script records wall-clock deploy duration; charts can show timing.

ALTER TABLE cloudflare_deployments ADD COLUMN build_time_seconds INTEGER;
ALTER TABLE cloudflare_deployments ADD COLUMN deploy_time_seconds INTEGER;

-- Backfill today's deploys (rowid 53, 54) with estimated 45s when timing was not captured.
UPDATE cloudflare_deployments SET build_time_seconds = 45, deploy_time_seconds = 45 WHERE rowid IN (53, 54) AND (build_time_seconds IS NULL OR build_time_seconds = '');
