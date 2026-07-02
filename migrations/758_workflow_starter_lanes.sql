-- 758: Mobile-first starter workflows — Cloudflare deploy + GitHub repo bootstrap (5-step lanes).
-- Visual spine for Workflow Studio mobile lane; handlers wired to existing executor kinds.

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES
(
  'wf_cf_deploy_starter', NULL, NULL, 'cf_deploy_starter',
  'Cloudflare Deploy',
  'Connect Cloudflare, configure your Worker, deploy, and verify — baseline deploy lane.',
  'deploy', 'manual', 'agent', 'agent_workflow',
  'medium', 0, 1, 1,
  '{"starter":true,"mobile_lane":true,"icon_slug":"cloudflare","entry_node_key":"start","signed_off":true,"source":"migrations/758_workflow_starter_lanes.sql"}'
),
(
  'wf_github_repo_starter', NULL, NULL, 'github_repo_starter',
  'GitHub Repo & Deploy',
  'Connect GitHub, scaffold or link a repo, push, and ship — baseline repo startup lane.',
  'deploy', 'manual', 'agent', 'agent_workflow',
  'medium', 0, 1, 1,
  '{"starter":true,"mobile_lane":true,"icon_slug":"github","entry_node_key":"start","signed_off":true,"source":"migrations/758_workflow_starter_lanes.sql"}'
);

-- Cloudflare lane
INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_cfds_start', 'wf_cf_deploy_starter', 'start', 'trigger', 'Start', 'Trigger', 'workflow.trigger.manual', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_cfds_connect', 'wf_cf_deploy_starter', 'connect_cf', 'process', 'Cloudflare', 'Connect', 'workflow.process.pass_through', '{}', '{}', 30000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_cfds_config', 'wf_cf_deploy_starter', 'configure', 'agent', 'Configure', 'Configure Worker', NULL, '{}', '{}', 120000, '{"max_retries":1}', '{}', 'medium', 0, 1, 30),
('wnode_cfds_deploy', 'wf_cf_deploy_starter', 'deploy', 'terminal', 'Deploy', 'Deploy', NULL, '{}', '{}', 300000, '{"max_retries":0}', '{}', 'high', 0, 1, 40),
('wnode_cfds_live', 'wf_cf_deploy_starter', 'live', 'output', 'Live', 'Export', 'workflow.output.final', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 50);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_cfds_01', 'wf_cf_deploy_starter', 'start', 'connect_cf', 'always', NULL, 0, 0, NULL),
('wedge_cfds_02', 'wf_cf_deploy_starter', 'connect_cf', 'configure', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_cfds_03', 'wf_cf_deploy_starter', 'configure', 'deploy', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_cfds_04', 'wf_cf_deploy_starter', 'deploy', 'live', 'status', '{"from_status":"success"}', 0, 0, NULL);

-- GitHub lane
INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_ghrs_start', 'wf_github_repo_starter', 'start', 'trigger', 'Start', 'Trigger', 'workflow.trigger.manual', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_ghrs_connect', 'wf_github_repo_starter', 'connect_gh', 'process', 'GitHub', 'Connect', 'workflow.process.pass_through', '{}', '{}', 30000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_ghrs_scaffold', 'wf_github_repo_starter', 'scaffold', 'agent', 'Scaffold', 'Create repo', NULL, '{}', '{}', 120000, '{"max_retries":1}', '{}', 'medium', 0, 1, 30),
('wnode_ghrs_push', 'wf_github_repo_starter', 'push_deploy', 'terminal', 'Push', 'Deploy', NULL, '{}', '{}', 300000, '{"max_retries":0}', '{}', 'high', 0, 1, 40),
('wnode_ghrs_live', 'wf_github_repo_starter', 'live', 'output', 'Live', 'Export', 'workflow.output.final', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 50);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_ghrs_01', 'wf_github_repo_starter', 'start', 'connect_gh', 'always', NULL, 0, 0, NULL),
('wedge_ghrs_02', 'wf_github_repo_starter', 'connect_gh', 'scaffold', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_ghrs_03', 'wf_github_repo_starter', 'scaffold', 'push_deploy', 'status', '{"from_status":"success"}', 0, 0, NULL),
('wedge_ghrs_04', 'wf_github_repo_starter', 'push_deploy', 'live', 'status', '{"from_status":"success"}', 0, 0, NULL);
