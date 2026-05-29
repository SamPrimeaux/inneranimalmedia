-- 455: Seed webhook-trigger MCP workflow registry rows (platform tenant, no per-user literals).
-- Apply each INSERT separately:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "…"

INSERT OR IGNORE INTO agentsam_mcp_workflows (
  id, workflow_key, display_name, description,
  status, trigger_type, is_active, category,
  tenant_id, workspace_id, task_type,
  steps_json, tools_json, acceptance_criteria_json, tags_json
) VALUES (
  'wf_on_cursor',
  'wf_on_cursor',
  'Cursor — Agent Finished',
  'Triggered when a Cursor cloud agent completes. Logs result, updates agentsam_agent_run, writes to agentsam_webhook_events.',
  'ready', 'webhook', 1, 'integrations',
  'tenant_inneranimalmedia', NULL, 'agent_workflow',
  '[{"step":"log_event"},{"step":"update_agent_run"},{"step":"notify_if_failed"}]',
  '[]',
  '[]',
  '["cursor","webhook","cloud_agent"]'
);

INSERT OR IGNORE INTO agentsam_mcp_workflows (
  id, workflow_key, display_name, description,
  status, trigger_type, is_active, category,
  tenant_id, workspace_id, task_type,
  steps_json, tools_json, acceptance_criteria_json, tags_json
) VALUES (
  'wf_on_github',
  'wf_on_github',
  'GitHub — Push / PR Event',
  'Triggered on GitHub push, PR, check_run, check_suite. Routes to PR review workflow or deploy hook.',
  'ready', 'webhook', 1, 'integrations',
  'tenant_inneranimalmedia', NULL, 'agent_workflow',
  '[{"step":"classify_event"},{"step":"route_to_handler"},{"step":"log_result"}]',
  '[]',
  '[]',
  '["github","webhook","ci"]'
);

INSERT OR IGNORE INTO agentsam_mcp_workflows (
  id, workflow_key, display_name, description,
  status, trigger_type, is_active, category,
  tenant_id, workspace_id, task_type,
  steps_json, tools_json, acceptance_criteria_json, tags_json
) VALUES (
  'wf_on_cloudflare',
  'wf_on_cloudflare',
  'Cloudflare — Build / Deploy Event',
  'Triggered on CF Workers build success/fail via Queue webhook. Logs build result.',
  'ready', 'webhook', 1, 'integrations',
  'tenant_inneranimalmedia', NULL, 'agent_workflow',
  '[{"step":"log_build_result"},{"step":"notify_on_failure"}]',
  '[]',
  '[]',
  '["cloudflare","webhook","deploy"]'
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_cursor', NULL, NULL, 'wf_on_cursor',
  'Cursor — Agent Finished',
  'Webhook dispatch when Cursor cloud agent reaches FINISHED or ERROR.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/455_webhook_workflow_mcp_seeds.sql","provider":"cursor"}'
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_github', NULL, NULL, 'wf_on_github',
  'GitHub — Push / PR Event',
  'Webhook dispatch for GitHub push, PR, and check events.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/455_webhook_workflow_mcp_seeds.sql","provider":"github"}'
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_cloudflare', NULL, NULL, 'wf_on_cloudflare',
  'Cloudflare — Build / Deploy Event',
  'Webhook dispatch for Cloudflare build/deploy notifications.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/455_webhook_workflow_mcp_seeds.sql","provider":"cloudflare"}'
);
