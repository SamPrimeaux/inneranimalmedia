#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${IAM_D1_DB:-inneranimalmedia-business}"
CONFIG="${IAM_WRANGLER_CONFIG:-wrangler.production.toml}"
RUN_ID="${1:-wrun_agentsam_debug_mirror_seed}"
WORKFLOW_ID="wf_agentsam_debug_mirror_e2e"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cf_d1_file() {
  local file="$1"
  npx wrangler d1 execute "$DB_NAME" --remote -c "$CONFIG" --command "$(cat "$file")"
}

echo "== Agent Sam Debug Mirror E2E =="
echo "DB: $DB_NAME"
echo "Config: $CONFIG"
echo "Run: $RUN_ID"
echo

cat > "$TMP_DIR/preflight.sql" <<SQL
SELECT
  r.id,
  r.workflow_key,
  r.status,
  r.current_node_key,
  r.steps_completed,
  r.steps_total,
  r.supabase_sync_status
FROM agentsam_workflow_runs r
WHERE r.id = '$RUN_ID';

SELECT
  node_key,
  node_type,
  handler_key,
  sort_order
FROM agentsam_workflow_nodes
WHERE workflow_id = '$WORKFLOW_ID'
ORDER BY sort_order;
SQL

echo "== Preflight =="
cf_d1_file "$TMP_DIR/preflight.sql"

cat > "$TMP_DIR/run.sql" <<SQL
UPDATE agentsam_workflow_runs
SET
  status = 'running',
  current_node_key = 'start',
  steps_completed = 0,
  output_json = '{}',
  step_results_json = '[]',
  input_tokens = 0,
  output_tokens = 0,
  cost_usd = 0,
  duration_ms = NULL,
  completed_at = NULL,
  error_message = NULL,
  heartbeat_at = unixepoch(),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = '$RUN_ID';

UPDATE agentsam_workflow_runs
SET
  current_node_key = 'inspect_context',
  steps_completed = 1,
  step_results_json = json_insert(
    step_results_json,
    '\$[#]',
    json_object(
      'node_key','start',
      'status','completed',
      'handler_key','agentsam.workflow.start',
      'message','Initialized debug workflow context',
      'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '$RUN_ID';

UPDATE agentsam_workflow_runs
SET
  current_node_key = 'run_tool',
  steps_completed = 2,
  step_results_json = json_insert(
    step_results_json,
    '\$[#]',
    json_object(
      'node_key','inspect_context',
      'status','completed',
      'handler_key','agentsam.workflow.inspect_context',
      'context_ok',1,
      'hyperdrive_binding','HYPERDRIVE',
      'supabase_target','public.agentsam_workflow_runs',
      'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '$RUN_ID';

UPDATE agentsam_workflow_runs
SET
  current_node_key = 'capture_debug_snapshot',
  steps_completed = 3,
  input_tokens = input_tokens + 12,
  output_tokens = output_tokens + 8,
  cost_usd = cost_usd + 0.000001,
  model_used = COALESCE(model_used, 'debug-smoke-local'),
  step_results_json = json_insert(
    step_results_json,
    '\$[#]',
    json_object(
      'node_key','run_tool',
      'status','completed',
      'handler_key','agentsam.workflow.run_tool',
      'tool_key','debug.noop',
      'tool_ok',1,
      'latency_ms',42,
      'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '$RUN_ID';

UPDATE agentsam_workflow_runs
SET
  current_node_key = 'quality_gate',
  steps_completed = 4,
  step_results_json = json_insert(
    step_results_json,
    '\$[#]',
    json_object(
      'node_key','capture_debug_snapshot',
      'status','completed',
      'handler_key','agentsam.workflow.capture_debug_snapshot',
      'snapshot_key','debug_mirror_smoke',
      'snapshot_captured',1,
      'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '$RUN_ID';

UPDATE agentsam_workflow_runs
SET
  current_node_key = 'finalize',
  steps_completed = 5,
  step_results_json = json_insert(
    step_results_json,
    '\$[#]',
    json_object(
      'node_key','quality_gate',
      'status','completed',
      'handler_key','agentsam.workflow.quality_gate',
      'quality_ok',1,
      'score',0.98,
      'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '$RUN_ID';

UPDATE agentsam_workflow_runs
SET
  status = 'completed',
  current_node_key = 'finalize',
  steps_completed = 6,
  output_json = json_object(
    'ok',1,
    'dashboard_ready',1,
    'workflow_id','$WORKFLOW_ID',
    'run_id','$RUN_ID',
    'message','Agent Sam Debug Mirror E2E smoke run completed'
  ),
  step_results_json = json_insert(
    step_results_json,
    '\$[#]',
    json_object(
      'node_key','finalize',
      'status','completed',
      'handler_key','agentsam.workflow.finalize',
      'finalized',1,
      'dashboard_ready',1,
      'completed_at',strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  ),
  duration_ms = CASE
    WHEN started_at IS NOT NULL THEN MAX(1, (unixepoch() - started_at) * 1000)
    ELSE duration_ms
  END,
  completed_at = unixepoch(),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '$RUN_ID';
SQL

echo
echo "== Simulate graph execution =="
cf_d1_file "$TMP_DIR/run.sql"

cat > "$TMP_DIR/validate.sql" <<SQL
SELECT
  r.id,
  r.workflow_key,
  r.status,
  r.steps_completed,
  r.steps_total,
  r.current_node_key,
  r.model_used,
  r.input_tokens,
  r.output_tokens,
  r.cost_usd,
  r.duration_ms,
  r.supabase_sync_status,
  json_array_length(r.step_results_json) AS step_result_count,
  json_extract(r.output_json, '$.dashboard_ready') AS dashboard_ready
FROM agentsam_workflow_runs r
WHERE r.id = '$RUN_ID';

SELECT
  json_extract(j.value, '$.node_key') AS node_key,
  json_extract(j.value, '$.status') AS status,
  json_extract(j.value, '$.handler_key') AS handler_key
FROM agentsam_workflow_runs r,
     json_each(r.step_results_json) AS j
WHERE r.id = '$RUN_ID';
SQL

echo
echo "== Validate completed run =="
cf_d1_file "$TMP_DIR/validate.sql"

echo
echo "Done."
