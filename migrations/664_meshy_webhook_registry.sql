-- Meshy webhook registry (Design Studio CAD jobs).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/664_meshy_webhook_registry.sql

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_meshy', NULL, NULL, 'wf_on_meshy',
  'Meshy — CAD Task Webhooks',
  'Triggered on Meshy text/image-to-3d task status deliveries.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/664_meshy_webhook_registry.sql","entry_node_key":"start","provider":"meshy"}'
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_wmeshy_start', 'wf_on_meshy', 'start', 'trigger', 'Start', 'Meshy webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_wmeshy_log', 'wf_on_meshy', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_wmeshy_done', 'wf_on_meshy', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_wmeshy_01', 'wf_on_meshy', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_wmeshy_02', 'wf_on_meshy', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_wmeshy_02f', 'wf_on_meshy', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, description, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, workspace_id, metadata_json
) VALUES (
  'wh_meshy_main',
  'custom',
  'meshy-main',
  'Meshy — Design Studio CAD',
  'Meshy text/image-to-3d task lifecycle webhooks for agentsam_cad_jobs.',
  'https://inneranimalmedia.com/api/webhooks/meshy',
  'X-Meshy-Signature',
  'hmac-sha256',
  1,
  'wf_on_meshy',
  '["task.pending","task.in_progress","task.succeeded","task.failed","task.canceled"]',
  NULL,
  NULL,
  '{"canonical_path":"/api/webhooks/meshy","logical_provider":"meshy","secret_env":"MESHYAI_WEBHOOK_SECRET"}'
);
