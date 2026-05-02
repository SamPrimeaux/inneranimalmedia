-- 223: Columns for deploy-sandbox / promote D1 logging (cicd_runs, deployments).
-- cicd_pipeline_runs.worker_version_id / deploy_record_id: already present on prod D1 (skip ALTER here).
-- Apply once (re-run fails if column already exists):
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/223_cicd_deploy_log_columns.sql

ALTER TABLE cicd_runs ADD COLUMN git_actor TEXT;
ALTER TABLE cicd_runs ADD COLUMN r2_bucket TEXT;
ALTER TABLE cicd_runs ADD COLUMN r2_files_updated INTEGER;
ALTER TABLE cicd_runs ADD COLUMN r2_bundle_size_bytes INTEGER;
-- If ALTER fails with "duplicate column", remove the line for that column and re-run the file once.
ALTER TABLE cicd_runs ADD COLUMN phase_sandbox_started_at INTEGER;
ALTER TABLE cicd_runs ADD COLUMN phase_sandbox_completed_at INTEGER;
ALTER TABLE cicd_runs ADD COLUMN phase_sandbox_duration_ms INTEGER;
ALTER TABLE cicd_runs ADD COLUMN cf_worker_version_id TEXT;
ALTER TABLE cicd_runs ADD COLUMN cf_health_status_code INTEGER;
ALTER TABLE cicd_runs ADD COLUMN cf_health_response_ms INTEGER;
ALTER TABLE cicd_runs ADD COLUMN cf_health_status TEXT;
ALTER TABLE cicd_runs ADD COLUMN total_duration_ms INTEGER;
ALTER TABLE cicd_runs ADD COLUMN event_id TEXT;
ALTER TABLE cicd_runs ADD COLUMN phase_benchmark_score TEXT;
ALTER TABLE cicd_runs ADD COLUMN phase_benchmark_completed_at INTEGER;

ALTER TABLE deployments ADD COLUMN deploy_time_seconds INTEGER;
