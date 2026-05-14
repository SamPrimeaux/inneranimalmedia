-- Smoke tests generated 2026-05-14T04:09:15 UTC


-- ═══ agentsam_workflow_runs ═══

-- Smoke: insert a minimal workflow run, verify it's readable
INSERT INTO agentsam_workflow_runs (id, workspace_id, tenant_id, status, trigger_type, created_at)
VALUES ('smoke_wr_001','ws_inneranimalmedia','tenant_sam_primeaux','running','manual',unixepoch());
SELECT id, status FROM agentsam_workflow_runs WHERE id='smoke_wr_001';
DELETE FROM agentsam_workflow_runs WHERE id='smoke_wr_001';

-- ═══ agentsam_execution_steps ═══

-- Smoke: requires a valid workflow_run_id FK
SELECT COUNT(*) as orphan_steps FROM agentsam_execution_steps s
WHERE NOT EXISTS (SELECT 1 FROM agentsam_workflow_runs r WHERE r.id = s.workflow_run_id);
SELECT COUNT(*) as missing_status FROM agentsam_execution_steps WHERE status IS NULL;
SELECT COUNT(*) as missing_step_type FROM agentsam_execution_steps WHERE step_type IS NULL;

-- ═══ agentsam_usage_events ═══

-- Smoke: verify write path captures model_key and tokens
SELECT COUNT(*) as no_model FROM agentsam_usage_events WHERE model_key IS NULL OR model_key='';
SELECT COUNT(*) as no_workspace FROM agentsam_usage_events WHERE workspace_id IS NULL;
SELECT COUNT(*) as no_tokens FROM agentsam_usage_events WHERE input_tokens IS NULL AND output_tokens IS NULL;
SELECT model_key, COUNT(*) as n, SUM(input_tokens) as total_in FROM agentsam_usage_events GROUP BY model_key ORDER BY n DESC LIMIT 5;

-- ═══ agentsam_memory ═══

-- Smoke: verify memory has embedding_id populated after today's backfill
SELECT COUNT(*) as total,
       SUM(CASE WHEN embedding_id IS NULL THEN 1 ELSE 0 END) as missing_embedding,
       SUM(CASE WHEN value IS NULL OR value='' THEN 1 ELSE 0 END) as empty_value,
       COUNT(DISTINCT memory_type) as type_count
FROM agentsam_memory;

-- ═══ agentsam_tool_call_log ═══

-- Smoke: verify tool calls have capability_key populated
SELECT COUNT(*) as total,
       SUM(CASE WHEN tool_key IS NULL THEN 1 ELSE 0 END) as no_tool_key,
       SUM(CASE WHEN capability_key IS NULL THEN 1 ELSE 0 END) as no_capability_key,
       SUM(CASE WHEN policy_decision_json IS NULL THEN 1 ELSE 0 END) as no_policy
FROM agentsam_tool_call_log;

-- ═══ agentsam_mcp_tool_execution ═══

-- Smoke: verify execution logging has workspace + tool data
SELECT COUNT(*) as total,
       SUM(CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END) as no_workspace,
       SUM(CASE WHEN tool_key IS NULL THEN 1 ELSE 0 END) as no_tool_key,
       SUM(CASE WHEN duration_ms IS NULL THEN 1 ELSE 0 END) as no_duration,
       AVG(duration_ms) as avg_ms
FROM agentsam_mcp_tool_execution;

-- ═══ agentsam_cron_runs ═══

-- Smoke: cron run completions are being recorded
SELECT job_name, status, COUNT(*) as n, AVG(duration_ms) as avg_ms,
       MAX(started_at) as last_run
FROM agentsam_cron_runs GROUP BY job_name, status ORDER BY n DESC LIMIT 10;

-- ═══ agentsam_deployment_health ═══

-- Smoke: deployment health has worker names and status
SELECT COUNT(*) as total,
       SUM(CASE WHEN worker_name IS NULL THEN 1 ELSE 0 END) as no_worker_name,
       SUM(CASE WHEN git_hash IS NULL THEN 1 ELSE 0 END) as no_git_hash,
       COUNT(DISTINCT worker_name) as distinct_workers
FROM agentsam_deployment_health;

-- ═══ agentsam_agent_run ═══

-- Smoke: agent runs have token counts and model refs
SELECT COUNT(*) as total,
       SUM(CASE WHEN input_tokens=0 THEN 1 ELSE 0 END) as zero_input_tokens,
       SUM(CASE WHEN output_tokens=0 THEN 1 ELSE 0 END) as zero_output_tokens,
       SUM(CASE WHEN ai_model_ref IS NULL THEN 1 ELSE 0 END) as no_model_ref,
       SUM(CASE WHEN routing_arm_id IS NULL THEN 1 ELSE 0 END) as no_routing_arm
FROM agentsam_agent_run;

-- ═══ agentsam_routing_arms ═══

-- Smoke: routing arms have valid model_catalog links
SELECT COUNT(*) as total,
       SUM(CASE WHEN model_catalog_id IS NULL THEN 1 ELSE 0 END) as no_catalog_link,
       SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active_arms,
       SUM(CASE WHEN total_executions=0 THEN 1 ELSE 0 END) as never_used
FROM agentsam_routing_arms;

-- ═══ agentsam_error_log ═══

-- Smoke: error log has severity and message
SELECT severity, COUNT(*) as n FROM agentsam_error_log GROUP BY severity;
SELECT COUNT(*) as no_workspace FROM agentsam_error_log WHERE workspace_id IS NULL;
SELECT COUNT(*) as no_message FROM agentsam_error_log WHERE message IS NULL OR message='';

-- ═══ cms_themes ═══

-- Smoke: themes have required fields for CSS var injection
SELECT COUNT(*) as total,
       SUM(CASE WHEN slug IS NULL THEN 1 ELSE 0 END) as no_slug,
       SUM(CASE WHEN config_json IS NULL THEN 1 ELSE 0 END) as no_config,
       SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active_themes
FROM cms_themes;