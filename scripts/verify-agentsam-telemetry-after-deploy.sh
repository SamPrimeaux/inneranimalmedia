#!/usr/bin/env zsh
# Read-only D1 report: recent agentsam telemetry + anomaly flags (remote production DB).
# Usage: from repo root, with Cloudflare auth (e.g. .env.cloudflare sourced by with-cloudflare-env).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
[[ "$(pwd)" == "$REPO_ROOT" ]] || { echo "wrong cwd"; exit 1; }

DB_NAME="${D1_DATABASE_NAME:-inneranimalmedia-business}"
WRANGLER_CFG="${WRANGLER_PRODUCTION_CONFIG:-wrangler.production.toml}"

d1_exec() {
  local sql="$1"
  if command -v cf_d1 >/dev/null 2>&1; then
    cf_d1 execute "$DB_NAME" --remote -c "$WRANGLER_CFG" --command "$sql"
  else
    "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler d1 execute "$DB_NAME" --remote -c "$WRANGLER_CFG" --command "$sql"
  fi
}

echo "=== agentsam_tool_chain (latest 8) ==="
d1_exec "SELECT id, workspace_id, user_id, tool_name, tool_status, duration_ms, input_tokens, output_tokens, cost_usd, error_type, datetime(completed_at,'unixepoch') AS completed_at FROM agentsam_tool_chain ORDER BY completed_at DESC LIMIT 8;"

echo ""
echo "=== agentsam_usage_events (latest 8) ==="
d1_exec "SELECT id, workspace_id, user_id, provider, model, model_key, event_type, tokens_in, tokens_out, total_tokens, cost_usd, duration_ms, datetime(created_at,'unixepoch') AS created_at FROM agentsam_usage_events ORDER BY created_at DESC LIMIT 8;"

echo ""
echo "=== agentsam_command_run (latest 8) ==="
d1_exec "SELECT id, workspace_id, user_id, model_id, success, duration_ms, input_tokens, output_tokens, cost_usd, substr(result_json,1,120) AS result_json_head FROM agentsam_command_run ORDER BY rowid DESC LIMIT 8;"

echo ""
echo "=== agentsam_executions (latest 5, if any) ==="
d1_exec "SELECT id, workspace_id, user_id, command_run_id, status, model_key, duration_ms, datetime(created_at,'unixepoch') AS created_at FROM agentsam_executions ORDER BY created_at DESC LIMIT 5;" || true

echo ""
echo "=== agentsam_error_log (latest 5, if any) ==="
d1_exec "SELECT id, workspace_id, error_type, source, substr(error_message,1,80) AS msg, datetime(created_at,'unixepoch') AS created_at FROM agentsam_error_log ORDER BY created_at DESC LIMIT 5;" || true

echo ""
echo "=== FLAGS: tool_chain duration / tokens null (last 24h) ==="
d1_exec "SELECT COUNT(*) AS n FROM agentsam_tool_chain WHERE completed_at > unixepoch('now','-24 hours') AND (duration_ms IS NULL OR ((COALESCE(input_tokens,0)>0 OR COALESCE(output_tokens,0)>0) AND (input_tokens IS NULL OR output_tokens IS NULL)));"

echo ""
echo "=== FLAGS: usage_events model_key / event_type / total_tokens anomalies (recent 200) ==="
d1_exec "SELECT COUNT(*) AS n FROM agentsam_usage_events WHERE created_at > unixepoch('now','-24 hours') AND (model_key IS NULL OR event_type IS NULL OR (tokens_in IS NOT NULL AND tokens_out IS NOT NULL AND total_tokens IS NULL));"

echo ""
echo "=== FLAGS: usage_events cost_usd zero with tokens + catalog pricing (sample join) ==="
d1_exec "SELECT COUNT(*) AS n FROM agentsam_usage_events u JOIN agentsam_model_catalog c ON c.model_key = u.model_key AND c.is_active = 1 WHERE u.created_at > unixepoch('now','-24 hours') AND COALESCE(u.cost_usd,0) = 0 AND (COALESCE(u.tokens_in,0)+COALESCE(u.tokens_out,0)) > 0 AND (COALESCE(c.cost_per_1k_in,0) > 0 OR COALESCE(c.cost_per_1k_out,0) > 0);"

echo ""
echo "=== FLAGS: user_id null on recent chat/e2e usage (event_type patterns) ==="
d1_exec "SELECT COUNT(*) AS n FROM agentsam_usage_events WHERE created_at > unixepoch('now','-24 hours') AND user_id IS NULL AND event_type IN ('agent_chat_sse','code_execution_e2e_test','code_execution_e2e_unknown_tool','code_execution_e2e_timeout');"

echo ""
echo "=== FLAGS: command_run model_id not in catalog (recent 100) ==="
d1_exec "SELECT cr.id, cr.model_id FROM agentsam_command_run cr WHERE cr.rowid IN (SELECT rowid FROM agentsam_command_run ORDER BY rowid DESC LIMIT 100) AND cr.model_id IS NOT NULL AND trim(cr.model_id) != '' AND NOT EXISTS (SELECT 1 FROM agentsam_model_catalog c WHERE c.is_active = 1 AND c.model_key = cr.model_id) LIMIT 15;"

echo ""
echo "Done. Review counts and sample rows above (before/after deploy comparison)."
