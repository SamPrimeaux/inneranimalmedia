-- Focused D1 snapshot: COUNT + last 2 rows per deploy / metrics / telemetry table.
--
-- Wrangler `d1 execute --file` runs this batch but does NOT print SELECT rows (summary only).
-- For a diffable JSON snapshot use:
--   ./scripts/d1-dump-deploy-metrics-last2.sh > snapshot.json
--
-- Optional batch sanity check:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=scripts/d1-snapshot-deploy-metrics-last2.sql

-- ========== Deploy ledger ==========
SELECT 'deployments' AS _table, COUNT(*) AS _rows FROM deployments;
SELECT * FROM deployments ORDER BY datetime(COALESCE(timestamp, created_at)) DESC LIMIT 2;

SELECT 'deployment_tracking' AS _table, COUNT(*) AS _rows FROM deployment_tracking;
SELECT * FROM deployment_tracking ORDER BY datetime(COALESCE(updated_at, completed_at, started_at, queued_at)) DESC LIMIT 2;

SELECT 'deployment_notifications' AS _table, COUNT(*) AS _rows FROM deployment_notifications;
SELECT * FROM deployment_notifications ORDER BY datetime(COALESCE(updated_at, created_at)) DESC LIMIT 2;

SELECT 'agentsam_deployment_health' AS _table, COUNT(*) AS _rows FROM agentsam_deployment_health;
SELECT * FROM agentsam_deployment_health ORDER BY datetime(checked_at) DESC LIMIT 2;

SELECT 'agentsam_error_log' AS _table, COUNT(*) AS _rows FROM agentsam_error_log;
SELECT * FROM agentsam_error_log ORDER BY created_at DESC LIMIT 2;

-- ========== R2 deploy inventory ==========
SELECT 'r2_deploy_manifests' AS _table, COUNT(*) AS _rows FROM r2_deploy_manifests;
SELECT * FROM r2_deploy_manifests ORDER BY datetime(COALESCE(applied_at, created_at)) DESC LIMIT 2;

SELECT 'r2_object_inventory' AS _table, COUNT(*) AS _rows FROM r2_object_inventory;
SELECT * FROM r2_object_inventory ORDER BY id DESC LIMIT 2;

SELECT 'project_storage' AS _table, COUNT(*) AS _rows FROM project_storage;
SELECT * FROM project_storage ORDER BY datetime(updated_at) DESC LIMIT 2;

SELECT 'r2_bucket_summary' AS _table, COUNT(*) AS _rows FROM r2_bucket_summary;
SELECT * FROM r2_bucket_summary ORDER BY datetime(COALESCE(last_inventoried_at, updated_at)) DESC LIMIT 2;

-- ========== Post-deploy memory hook ==========
SELECT 'agentsam_memory' AS _table, COUNT(*) AS _rows FROM agentsam_memory;
SELECT * FROM agentsam_memory ORDER BY updated_at DESC LIMIT 2;

SELECT 'agentsam_project_context' AS _table, COUNT(*) AS _rows FROM agentsam_project_context;
SELECT * FROM agentsam_project_context ORDER BY updated_at DESC LIMIT 2;

-- ========== Worker HTTP metrics ==========
SELECT 'worker_analytics_events' AS _table, COUNT(*) AS _rows FROM worker_analytics_events;
SELECT * FROM worker_analytics_events ORDER BY COALESCE(timestamp, created_at, id) DESC LIMIT 2;

SELECT 'worker_analytics_hourly' AS _table, COUNT(*) AS _rows FROM worker_analytics_hourly;
SELECT * FROM worker_analytics_hourly ORDER BY hour_timestamp DESC LIMIT 2;

SELECT 'worker_analytics_daily' AS _table, COUNT(*) AS _rows FROM worker_analytics_daily;
SELECT * FROM worker_analytics_daily ORDER BY day_timestamp DESC LIMIT 2;

SELECT 'worker_analytics_errors' AS _table, COUNT(*) AS _rows FROM worker_analytics_errors;
SELECT * FROM worker_analytics_errors ORDER BY COALESCE(timestamp, created_at) DESC LIMIT 2;

-- ========== Workspace rollups ==========
SELECT 'workspace_usage_metrics' AS _table, COUNT(*) AS _rows FROM workspace_usage_metrics;
SELECT * FROM workspace_usage_metrics ORDER BY metric_date DESC LIMIT 2;

-- ========== AgentSam usage / analytics ==========
SELECT 'agentsam_usage_events' AS _table, COUNT(*) AS _rows FROM agentsam_usage_events;
SELECT * FROM agentsam_usage_events ORDER BY created_at DESC LIMIT 2;

SELECT 'agentsam_usage_rollups_daily' AS _table, COUNT(*) AS _rows FROM agentsam_usage_rollups_daily;
SELECT * FROM agentsam_usage_rollups_daily ORDER BY day DESC LIMIT 2;

SELECT 'agentsam_analytics' AS _table, COUNT(*) AS _rows FROM agentsam_analytics;
SELECT * FROM agentsam_analytics ORDER BY computed_at DESC LIMIT 2;

SELECT 'agentsam_agent_run' AS _table, COUNT(*) AS _rows FROM agentsam_agent_run;
SELECT * FROM agentsam_agent_run ORDER BY datetime(COALESCE(completed_at, started_at, created_at)) DESC LIMIT 2;

-- ========== Cron / jobs ==========
SELECT 'agentsam_cron_runs' AS _table, COUNT(*) AS _rows FROM agentsam_cron_runs;
SELECT * FROM agentsam_cron_runs ORDER BY started_at DESC LIMIT 2;

SELECT 'agentsam_code_index_job' AS _table, COUNT(*) AS _rows FROM agentsam_code_index_job;
SELECT * FROM agentsam_code_index_job ORDER BY datetime(updated_at) DESC LIMIT 2;

-- ========== Schema bookkeeping ==========
SELECT 'd1_migrations' AS _table, COUNT(*) AS _rows FROM d1_migrations;
SELECT * FROM d1_migrations ORDER BY id DESC LIMIT 2;

-- ========== Settings ==========
SELECT 'user_storage_provider_preferences' AS _table, COUNT(*) AS _rows FROM user_storage_provider_preferences;
SELECT * FROM user_storage_provider_preferences ORDER BY datetime(updated_at) DESC LIMIT 2;

SELECT 'agentsam_user_policy' AS _table, COUNT(*) AS _rows FROM agentsam_user_policy;
SELECT * FROM agentsam_user_policy ORDER BY datetime(updated_at) DESC LIMIT 2;
