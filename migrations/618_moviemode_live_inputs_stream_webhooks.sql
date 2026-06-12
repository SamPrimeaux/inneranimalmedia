-- MovieMode Live Input lane + Cloudflare Stream webhook registry (VOD + Live notifications).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/618_moviemode_live_inputs_stream_webhooks.sql

CREATE TABLE IF NOT EXISTS moviemode_live_inputs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  stream_live_input_uid TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle','connected','live','disconnected','awaiting_vod','error','archived')),
  recording_mode TEXT NOT NULL DEFAULT 'automatic',
  rtmps_url TEXT,
  webrtc_publish_url TEXT,
  hls_playback_url TEXT,
  last_vod_uid TEXT,
  last_event_type TEXT,
  last_event_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES moviemode_projects(id) ON DELETE SET NULL,
  UNIQUE (workspace_id, stream_live_input_uid)
);

CREATE INDEX IF NOT EXISTS idx_moviemode_live_inputs_ws_status
  ON moviemode_live_inputs(workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_moviemode_live_inputs_stream_uid
  ON moviemode_live_inputs(stream_live_input_uid);

-- ─── wf_on_stream (minimal audit graph) ───────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workflows (
  id, tenant_id, workspace_id, workflow_key, display_name, description,
  workflow_type, trigger_type, default_mode, default_task_type,
  risk_level, requires_approval, is_active, is_platform_global, metadata_json
) VALUES (
  'wf_on_stream', NULL, NULL, 'wf_on_stream',
  'Cloudflare Stream — VOD + Live',
  'Triggered on Cloudflare Stream VOD ready/error and Live Input connect/disconnect/error webhooks.',
  'integrations', 'webhook', 'agent', 'agent_workflow',
  'low', 0, 1, 1,
  '{"source":"migrations/618_moviemode_live_inputs_stream_webhooks.sql","entry_node_key":"start","provider":"stream"}'
);

INSERT OR IGNORE INTO agentsam_workflow_nodes (
  id, workflow_id, node_key, node_type, title, description, handler_key,
  input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
  quality_gate_json, risk_level, requires_approval, is_active, sort_order
) VALUES
('wnode_wos_start', 'wf_on_stream', 'start', 'trigger', 'Start', 'Stream webhook received.', 'workflow.trigger.webhook', '{}', '{}', 5000, '{"max_retries":0}', '{}', 'low', 0, 1, 10),
('wnode_wos_log', 'wf_on_stream', 'log_event', 'db_query', 'Log event', 'Stamp webhook audit row.', 'agentsam.webhook.log_event', '{}', '{}', 10000, '{"max_retries":1}', '{}', 'low', 0, 1, 20),
('wnode_wos_done', 'wf_on_stream', 'complete_run', 'db_query', 'Complete', 'Mark workflow run completed.', 'agentsam.workflow.complete_run', '{}', '{}', 15000, '{"max_retries":1}', '{}', 'low', 0, 1, 30);

INSERT OR IGNORE INTO agentsam_workflow_edges (
  id, workflow_id, from_node_key, to_node_key, condition_type, condition_json, priority, is_fallback, label
) VALUES
('wedge_wos_01', 'wf_on_stream', 'start', 'log_event', 'always', NULL, 0, 0, 'start → log'),
('wedge_wos_02', 'wf_on_stream', 'log_event', 'complete_run', 'status', '{"from_status":"success"}', 0, 0, 'logged'),
('wedge_wos_02f', 'wf_on_stream', 'log_event', 'complete_run', 'status', '{"from_status":"failed"}', 1, 1, 'log failed → complete');

-- Registry rows (provider=custom — passes agentsam_webhooks CHECK; endpoint_path resolves endpoint_id)
INSERT OR IGNORE INTO agentsam_webhooks (
  id, provider, slug, name, description, endpoint_url, signature_header, signature_algo,
  is_active, workflow_key, allowed_events, tenant_id, workspace_id, metadata_json
) VALUES
(
  'wh_stream_vod',
  'custom',
  'stream-vod',
  'Cloudflare Stream VOD',
  'Stream video encoding complete / error (PUT /accounts/.../stream/webhook).',
  'https://inneranimalmedia.com/api/webhooks/stream/vod',
  'Webhook-Signature',
  'hmac-sha256',
  1,
  'wf_on_stream',
  '["video.ready","video.error"]',
  NULL,
  NULL,
  '{"canonical_path":"/api/webhooks/stream/vod","logical_provider":"stream","secret_env":"CLOUDFLARE_STREAM_WEBHOOK_SECRET"}'
),
(
  'wh_stream_live',
  'custom',
  'stream-live',
  'Cloudflare Stream Live Input',
  'Live input connected/disconnected/errored (Cloudflare Notifications → cf-webhook-auth).',
  'https://inneranimalmedia.com/api/webhooks/stream/live',
  'cf-webhook-auth',
  'shared_secret',
  1,
  'wf_on_stream',
  '["live_input.connected","live_input.disconnected","live_input.errored"]',
  NULL,
  NULL,
  '{"canonical_path":"/api/webhooks/stream/live","logical_provider":"stream","secret_env":"CLOUDFLARE_STREAM_LIVE_WEBHOOK_SECRET","setup_note":"Cloudflare dashboard → Notifications → Stream Live Input"}'
);
