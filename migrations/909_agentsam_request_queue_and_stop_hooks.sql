-- 909: Canonical agentsam_request_queue (retry / background drain).
-- Replaces unprefixed agent_request_queue for new writes; cron drains both until cutover.

CREATE TABLE IF NOT EXISTS agentsam_request_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'system',
  workspace_id TEXT,
  user_id TEXT,
  session_id TEXT NOT NULL,
  conversation_id TEXT,
  agent_run_id TEXT,
  plan_id TEXT,
  task_type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'agent_run_stop', 'cursor_stop', 'manual', 'cron')),
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
  position INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_request_queue_status_pos
  ON agentsam_request_queue(session_id, status, position);

CREATE INDEX IF NOT EXISTS idx_agentsam_request_queue_drain
  ON agentsam_request_queue(status, created_at)
  WHERE status = 'queued';

-- Backfill from legacy agent_request_queue (idempotent by id).
INSERT OR IGNORE INTO agentsam_request_queue (
  id, tenant_id, workspace_id, user_id, session_id, conversation_id, agent_run_id,
  plan_id, task_type, source, payload_json, status, position, result_json,
  created_at, updated_at
)
SELECT
  id,
  COALESCE(tenant_id, 'system'),
  NULL,
  NULL,
  session_id,
  session_id,
  NULL,
  plan_id,
  task_type,
  'system',
  payload_json,
  status,
  position,
  result_json,
  created_at,
  updated_at
FROM agent_request_queue
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_request_queue');

-- Stop automation hooks (trigger values constrained to existing CHECK).
-- hook_key distinguishes platform semantics beyond trigger enum.
INSERT OR IGNORE INTO agentsam_hook (
  id, hook_key, tenant_id, workspace_id, user_id, provider, trigger, event_type,
  handler_type, handler_config, command, is_active, priority, metadata, created_at, updated_at
) VALUES
(
  'hook_agent_run_stop',
  'agent_run_stop',
  'tenant_inneranimalmedia',
  'ws_inneranimalmedia',
  'system',
  'system',
  'stop',
  'agent_run_stop',
  'telemetry',
  '{"sink":"hyperdrive","mirror_usage":true,"consecutive_fail_retries":2}',
  'agentsam_run_stop_hooks',
  1,
  10,
  '{"purpose":"Fire on in-app agent loop stop; write agentsam_hook_execution + Hyperdrive"}',
  datetime('now'),
  datetime('now')
),
(
  'hook_agent_run_error_retry',
  'agent_run_consecutive_fail',
  'tenant_inneranimalmedia',
  'ws_inneranimalmedia',
  'system',
  'system',
  'error',
  'agent_run_consecutive_fail',
  'queue_retry',
  '{"queue":"agentsam_request_queue","fail_threshold":2,"task_type":"agent_chat_retry"}',
  'agentsam_run_stop_hooks',
  1,
  20,
  '{"purpose":"After 2 consecutive fails, enqueue agentsam_request_queue retry"}',
  datetime('now'),
  datetime('now')
);
