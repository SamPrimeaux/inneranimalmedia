-- 456: Webhook registry rows, handlers, and minimal start→log→complete graphs for wf_on_* workflows.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/456_webhook_graphs_and_registry.sql

-- ─── Handlers ─────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, risk_level, requires_approval, is_active, created_at, updated_at
) VALUES (
  'workflow.trigger.webhook',
  'trigger',
  'passthrough',
  'Webhook trigger',
  'Entry node for inbound webhook workflow graphs.',
  '{"source":"webhook","emit":{"triggered":true}}',
  'low', 0, 1, datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO agentsam_workflow_handlers (
  handler_key, node_type, executor_kind, title, description,
  handler_config_json, risk_level, requires_approval, is_active, created_at, updated_at
) VALUES (
  'agentsam.webhook.log_event',
  'db_query',
  'd1_sql',
  'Webhook audit stamp',
  'Marks agentsam_webhook_events when a webhook workflow run starts.',
  '{"sql":"UPDATE agentsam_webhook_events SET metadata_json = json_set(COALESCE(NULLIF(trim(metadata_json), ''''), ''{}''), ''$.webhook_workflow_started'', unixepoch()) WHERE id = ?","params":["$.webhook_event_id"]}',
  'low', 0, 1, datetime('now'), datetime('now')
);

-- ─── Additional workflow shells (455 seeded cursor/github/cloudflare) ────────

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_supabase', NULL, NULL, 'wf_on_supabase',
  'Supabase — DB Webhook',
  'Triggered on Supabase database webhooks (table changes, eval results).',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/456_webhook_graphs_and_registry.sql","entry_node_key":"start","provider":"supabase"}'
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_openai', NULL, NULL, 'wf_on_openai',
  'OpenAI — Webhook',
  'Triggered on OpenAI platform webhook deliveries.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/456_webhook_graphs_and_registry.sql","entry_node_key":"start","provider":"openai"}'
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_anthropic', NULL, NULL, 'wf_on_anthropic',
  'Anthropic — Managed Agents Webhook',
  'Triggered on Anthropic managed-agent webhook events.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/456_webhook_graphs_and_registry.sql","entry_node_key":"start","provider":"anthropic"}'
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_resend', NULL, NULL, 'wf_on_resend',
  'Resend — Email Webhook',
  'Triggered on Resend outbound and inbound webhook deliveries.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/456_webhook_graphs_and_registry.sql","entry_node_key":"start","provider":"resend"}'
);

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_internal', NULL, NULL, 'wf_on_internal',
  'Internal — Platform Webhook',
  'Triggered on signed internal platform webhook calls.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/456_webhook_graphs_and_registry.sql","entry_node_key":"start","provider":"internal"}'
);

UPDATE agentsam_workflows
SET metadata_json = json_set(
      COALESCE(NULLIF(trim(metadata_json), ''), '{}'),
      '$.entry_node_key', 'start',
      '$.source', 'migrations/456_webhook_graphs_and_registry.sql'
    ),
    updated_at = datetime('now')
WHERE workflow_key IN (
  'wf_on_cursor', 'wf_on_github', 'wf_on_cloudflare',
  'wf_on_supabase', 'wf_on_openai', 'wf_on_anthropic', 'wf_on_resend', 'wf_on_internal'
);

-- ─── Nodes: wf_on_cursor ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_woc_start', 'wf_on_cursor', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_woc_log', 'wf_on_cursor', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_woc_done', 'wf_on_cursor', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_woc_01', 'wf_on_cursor', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_woc_02', 'wf_on_cursor', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_woc_02f', 'wf_on_cursor', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Nodes: wf_on_github ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_wog_start', 'wf_on_github', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_wog_log', 'wf_on_github', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_wog_done', 'wf_on_github', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_wog_01', 'wf_on_github', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_wog_02', 'wf_on_github', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_wog_02f', 'wf_on_github', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Nodes: wf_on_cloudflare ─────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_wcf_start', 'wf_on_cloudflare', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_wcf_log', 'wf_on_cloudflare', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_wcf_done', 'wf_on_cloudflare', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_wcf_01', 'wf_on_cloudflare', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_wcf_02', 'wf_on_cloudflare', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_wcf_02f', 'wf_on_cloudflare', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Nodes: wf_on_supabase ───────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_wosb_start', 'wf_on_supabase', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_wosb_log', 'wf_on_supabase', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_wosb_done', 'wf_on_supabase', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_wosb_01', 'wf_on_supabase', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_wosb_02', 'wf_on_supabase', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_wosb_02f', 'wf_on_supabase', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Nodes: wf_on_openai ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_woo_start', 'wf_on_openai', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_woo_log', 'wf_on_openai', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_woo_done', 'wf_on_openai', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_woo_01', 'wf_on_openai', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_woo_02', 'wf_on_openai', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_woo_02f', 'wf_on_openai', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Nodes: wf_on_anthropic ──────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_woa_start', 'wf_on_anthropic', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_woa_log', 'wf_on_anthropic', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_woa_done', 'wf_on_anthropic', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_woa_01', 'wf_on_anthropic', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_woa_02', 'wf_on_anthropic', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_woa_02f', 'wf_on_anthropic', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Nodes: wf_on_resend ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_wor_start', 'wf_on_resend', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_wor_log', 'wf_on_resend', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_wor_done', 'wf_on_resend', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_wor_01', 'wf_on_resend', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_wor_02', 'wf_on_resend', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_wor_02f', 'wf_on_resend', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Nodes: wf_on_internal ───────────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_woi_start', 'wf_on_internal', 'start', 'trigger', 'Start', 'Webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_woi_log', 'wf_on_internal', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_woi_done', 'wf_on_internal', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_woi_01', 'wf_on_internal', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_woi_02', 'wf_on_internal', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_woi_02f', 'wf_on_internal', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- ─── Registry: link providers → workflow_key (platform tenant, no user literals) ─

UPDATE agentsam_webhooks
SET workflow_key = 'wf_on_openai',
    endpoint_url = 'https://inneranimalmedia.com/api/webhooks/openai',
    signature_header = 'x-openai-signature',
    allowed_events = '[]',
    is_active = 1,
    updated_at = datetime('now')
WHERE provider = 'openai';

UPDATE agentsam_webhooks
SET workflow_key = 'wf_on_anthropic',
    endpoint_url = 'https://inneranimalmedia.com/api/webhooks/anthropic',
    signature_header = 'X-Webhook-Signature',
    allowed_events = '[]',
    is_active = 1,
    updated_at = datetime('now')
WHERE provider = 'anthropic';

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, metadata_json
) VALUES (
  'wh_github_main', 'github', 'github-main', 'GitHub',
  'https://inneranimalmedia.com/api/webhooks/github', 'X-Hub-Signature-256', 'hmac-sha256',
  1, 'wf_on_github', '["push","pull_request","check_suite","check_run","workflow_run"]',
  'tenant_inneranimalmedia',
  '{"canonical_path":"/api/webhooks/github"}'
);

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, metadata_json
) VALUES (
  'wh_cursor_main', 'cursor', 'cursor-main', 'Cursor Cloud Agents',
  'https://inneranimalmedia.com/api/webhooks/cursor', 'X-Webhook-Signature', 'hmac-sha256',
  1, 'wf_on_cursor', '["agent_finish","commit","deploy","review_complete","status_change"]',
  'tenant_inneranimalmedia',
  '{"canonical_path":"/api/webhooks/cursor"}'
);

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, metadata_json
) VALUES (
  'wh_cf_main', 'cloudflare', 'cloudflare-main', 'Cloudflare Builds',
  'https://inneranimalmedia.com/api/webhooks/cloudflare', 'X-Cf-Webhook-Secret', 'shared_secret',
  1, 'wf_on_cloudflare', '[]',
  'tenant_inneranimalmedia',
  '{"canonical_path":"/api/webhooks/cloudflare","note":"Uses INTERNAL_WEBHOOK_SECRET when header matches"}'
);

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, metadata_json
) VALUES (
  'wh_supabase_main', 'supabase', 'supabase-main', 'Supabase DB',
  'https://inneranimalmedia.com/api/webhooks/supabase', 'x-supabase-webhook-secret', 'shared_secret',
  1, 'wf_on_supabase', '[]',
  'tenant_inneranimalmedia',
  '{"canonical_path":"/api/webhooks/supabase"}'
);

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, metadata_json
) VALUES (
  'wh_resend_main', 'resend', 'resend-main', 'Resend Outbound',
  'https://inneranimalmedia.com/api/webhooks/resend', 'X-Resend-Webhook-Secret', 'shared_secret',
  1, 'wf_on_resend', '[]',
  'tenant_inneranimalmedia',
  '{"canonical_path":"/api/webhooks/resend","inbound_path":"/api/email/inbound"}'
);

INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, metadata_json
) VALUES (
  'wh_internal_main', 'internal', 'internal-main', 'Internal Platform',
  'https://inneranimalmedia.com/api/webhooks/internal', 'X-Internal-Webhook-Secret', 'shared_secret',
  1, 'wf_on_internal', '[]',
  'tenant_inneranimalmedia',
  '{"canonical_path":"/api/webhooks/internal"}'
);

UPDATE agentsam_webhooks
SET workflow_key = COALESCE(NULLIF(trim(workflow_key), ''), 'wf_on_github'),
    is_active = 1,
    updated_at = datetime('now')
WHERE provider = 'github' AND (workflow_key IS NULL OR trim(workflow_key) = '');

UPDATE agentsam_webhooks
SET workflow_key = COALESCE(NULLIF(trim(workflow_key), ''), 'wf_on_cursor'),
    is_active = 1,
    updated_at = datetime('now')
WHERE provider = 'cursor' AND (workflow_key IS NULL OR trim(workflow_key) = '');
