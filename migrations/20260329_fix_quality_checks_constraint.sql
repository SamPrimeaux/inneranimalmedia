-- Expand quality_checks.check_type to allow RAG quality rows (rag_ingest, rag_query, etc.)
-- SQLite cannot ALTER CHECK; recreate table.
--
-- IMPORTANT: D1 validates all views on commit. This database had views pointing at
-- missing tables (e.g. cost_tracking, rollback_registry). All views are dropped
-- here so the table recreate can commit; restore other views from your schema
-- backups or migrations as needed. project_quality_summary is recreated at the end.
--
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/20260329_fix_quality_checks_constraint.sql

DROP VIEW IF EXISTS workspace_resource_dashboard;
DROP VIEW IF EXISTS workspace_available_tools;
DROP VIEW IF EXISTS vw_cursor_table_inventory;
DROP VIEW IF EXISTS vw_cursor_infrastructure_status;
DROP VIEW IF EXISTS vw_cursor_active_projects;
DROP VIEW IF EXISTS v_workers_cleanup_candidates;
DROP VIEW IF EXISTS v_worker_health;
DROP VIEW IF EXISTS v_warm_intro_pipeline;
DROP VIEW IF EXISTS v_urgent_decisions;
DROP VIEW IF EXISTS v_top_opportunities;
DROP VIEW IF EXISTS v_tenant_scoped_projects;
DROP VIEW IF EXISTS v_task_momentum;
DROP VIEW IF EXISTS v_superadmin_emails;
DROP VIEW IF EXISTS v_subscriptions_monthly;
DROP VIEW IF EXISTS v_settings_ui;
DROP VIEW IF EXISTS v_settings_by_category;
DROP VIEW IF EXISTS v_recent_deployments;
DROP VIEW IF EXISTS v_r2_bloat_report;
DROP VIEW IF EXISTS v_r2_bloat_priority;
DROP VIEW IF EXISTS v_pipelines_unified;
DROP VIEW IF EXISTS v_media_impact;
DROP VIEW IF EXISTS v_mcp_tool_drift;
DROP VIEW IF EXISTS v_grant_pipeline_health;
DROP VIEW IF EXISTS v_financial_dashboard;
DROP VIEW IF EXISTS v_failed_builds;
DROP VIEW IF EXISTS v_execution_analytics;
DROP VIEW IF EXISTS v_deployment_success_rate;
DROP VIEW IF EXISTS v_cost_summary;
DROP VIEW IF EXISTS v_cost_rollup;
DROP VIEW IF EXISTS v_context_optimization_savings;
DROP VIEW IF EXISTS v_burnout_indicators;
DROP VIEW IF EXISTS v_backfill_candidates;
DROP VIEW IF EXISTS v_ai_spend_daily;
DROP VIEW IF EXISTS upcoming_events;
DROP VIEW IF EXISTS top_patterns;
DROP VIEW IF EXISTS todays_events;
DROP VIEW IF EXISTS recent_decisions;
DROP VIEW IF EXISTS ranked_agent_memories;
DROP VIEW IF EXISTS quota_status_check;
DROP VIEW IF EXISTS project_quality_summary;
DROP VIEW IF EXISTS project_health_dashboard;
DROP VIEW IF EXISTS next_command_to_execute;
DROP VIEW IF EXISTS intent_pattern_effectiveness;
DROP VIEW IF EXISTS execution_rollback_candidates;
DROP VIEW IF EXISTS execution_dependency_chains;
DROP VIEW IF EXISTS cost_summary_monthly;
DROP VIEW IF EXISTS cost_summary_daily;
DROP VIEW IF EXISTS context_version_history;
DROP VIEW IF EXISTS cidi_recent_completions;
DROP VIEW IF EXISTS cidi_active_workflows;
DROP VIEW IF EXISTS ai_project_memory_context;
DROP VIEW IF EXISTS ai_project_context;
DROP VIEW IF EXISTS ai_pending_approvals;
DROP VIEW IF EXISTS ai_execution_learning_record;
DROP VIEW IF EXISTS ai_executable_capabilities;
DROP VIEW IF EXISTS ai_active_goals;
DROP VIEW IF EXISTS agent_memory_for_context;

CREATE TABLE quality_checks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK(check_type IN (
    'performance','accessibility','code-quality',
    'design-consistency','security','seo',
    'rag_ingest','rag_query','rag_rerank','intent_classification'
  )),
  check_name TEXT NOT NULL,
  status TEXT NOT NULL,
  actual_value TEXT,
  expected_value TEXT,
  threshold_met BOOLEAN,
  details TEXT,
  severity TEXT DEFAULT 'medium',
  automated BOOLEAN DEFAULT 1,
  check_category TEXT DEFAULT 'rag',
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO quality_checks_new (
  id, project_id, check_type, check_name, status, actual_value, expected_value, threshold_met, details, severity, automated, check_category, checked_at
)
SELECT
  id, project_id, check_type, check_name, status, actual_value, expected_value, threshold_met, details, severity, automated,
  COALESCE(check_category, 'rag'),
  checked_at
FROM quality_checks;

DROP TABLE quality_checks;
ALTER TABLE quality_checks_new RENAME TO quality_checks;

CREATE VIEW project_quality_summary AS
SELECT
    project_id,
    COUNT(*) as total_checks,
    SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) as passed,
    SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END) as failed,
    SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warnings,
    ROUND(100.0 * SUM(CASE WHEN status = 'pass' THEN 1 ELSE 0 END) / COUNT(*), 2) as pass_rate
FROM quality_checks
GROUP BY project_id;
