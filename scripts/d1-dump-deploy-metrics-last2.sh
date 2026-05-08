#!/usr/bin/env bash
# Emit last-2-row snapshots (+ row counts) for deploy / metrics / telemetry tables.
# Usage:
#   ./scripts/d1-dump-deploy-metrics-last2.sh > snapshot-before.json
#   # deploy
#   ./scripts/d1-dump-deploy-metrics-last2.sh > snapshot-after.json
#   diff -u snapshot-before.json snapshot-after.json
#
# Requires: jq, wrangler (via with-cloudflare-env.sh), network.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="${WRANGLER_CONFIG:-wrangler.production.toml}"
DB="${D1_DATABASE:-inneranimalmedia-business}"

rows_json() {
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$CONFIG" --json --command "$1" 2>/dev/null \
    | jq '.[0].results // empty'
}

count_for() {
  local t="$1"
  rows_json "SELECT COUNT(*) AS c FROM ${t}" | jq '.[0].c'
}

snapshot_table() {
  local name="$1"
  local order_clause="$2"
  local cnt rows
  cnt="$(count_for "$name" || echo null)"
  rows="$(rows_json "SELECT * FROM ${name} ${order_clause} LIMIT 2" || echo '[]')"
  jq -n \
    --arg table "$name" \
    --argjson row_count "${cnt:-null}" \
    --argjson last_two "$rows" \
    '{table: $table, row_count: $row_count, last_two: $last_two}'
}

{
  snapshot_table deployments 'ORDER BY datetime(COALESCE(timestamp, created_at)) DESC'
  snapshot_table deployment_tracking 'ORDER BY datetime(COALESCE(updated_at, completed_at, started_at, queued_at)) DESC'
  snapshot_table deployment_notifications 'ORDER BY datetime(COALESCE(updated_at, created_at)) DESC'
  snapshot_table agentsam_deployment_health 'ORDER BY datetime(checked_at) DESC'
  snapshot_table agentsam_error_log 'ORDER BY created_at DESC'

  snapshot_table r2_deploy_manifests 'ORDER BY datetime(COALESCE(applied_at, created_at)) DESC'
  snapshot_table r2_object_inventory 'ORDER BY id DESC'
  snapshot_table project_storage 'ORDER BY datetime(updated_at) DESC'
  snapshot_table r2_bucket_summary 'ORDER BY datetime(COALESCE(last_inventoried_at, updated_at)) DESC'

  snapshot_table agentsam_memory 'ORDER BY updated_at DESC'
  snapshot_table agentsam_project_context 'ORDER BY updated_at DESC'

  snapshot_table worker_analytics_events 'ORDER BY COALESCE(timestamp, created_at, id) DESC'
  snapshot_table worker_analytics_hourly 'ORDER BY hour_timestamp DESC'
  snapshot_table worker_analytics_daily 'ORDER BY day_timestamp DESC'
  snapshot_table worker_analytics_errors 'ORDER BY COALESCE(timestamp, created_at) DESC'

  snapshot_table workspace_usage_metrics 'ORDER BY metric_date DESC'

  snapshot_table agentsam_usage_events 'ORDER BY created_at DESC'
  snapshot_table agentsam_usage_rollups_daily 'ORDER BY day DESC'
  snapshot_table agentsam_analytics 'ORDER BY computed_at DESC'
  snapshot_table agentsam_agent_run 'ORDER BY datetime(COALESCE(completed_at, started_at, created_at)) DESC'

  snapshot_table agentsam_cron_runs 'ORDER BY started_at DESC'
  snapshot_table agentsam_code_index_job 'ORDER BY datetime(updated_at) DESC'

  snapshot_table d1_migrations 'ORDER BY id DESC'

  snapshot_table user_storage_provider_preferences 'ORDER BY datetime(updated_at) DESC'
  snapshot_table agentsam_user_policy 'ORDER BY datetime(updated_at) DESC'
} | jq -s 'sort_by(.table)'
