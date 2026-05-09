#!/usr/bin/env bash
# 1) Audit ops table schemas (PRAGMA).
# 2) Read-only: row counts + recent timestamps where applicable.
# Optional smoke writes: OPS_LEDGER_WRITE_SMOKE=1 (uses ON CONFLICT / disposable ids).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${DB_NAME:-inneranimalmedia-business}"
cd "$ROOT"

run_sql() {
  local file="$1"
  if [[ -x "${ROOT}/scripts/with-cloudflare-env.sh" ]]; then
    ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c wrangler.production.toml --file="$file"
  else
    npx wrangler d1 execute "$DB" --remote -c wrangler.production.toml --file="$file"
  fi
}

echo "== agentsam ops ledger: schema audit =="
./scripts/audit_agentsam_ops_tables.sh

TMP="$(mktemp "${TMPDIR:-/tmp}/agentsam_ops_validate.XXXXXX.sql")"
SM=""
cleanup() { rm -f "$TMP"; [[ -n "$SM" ]] && rm -f "$SM"; }
trap cleanup EXIT

cat >"$TMP" <<'SQL'
SELECT 'agentsam_error_log' AS t, COUNT(*) AS n FROM agentsam_error_log;
SELECT 'agentsam_tool_call_log' AS t, COUNT(*) AS n FROM agentsam_tool_call_log;
SELECT 'agentsam_deployment_health' AS t, COUNT(*) AS n FROM agentsam_deployment_health;
SELECT 'agentsam_cron_runs' AS t, COUNT(*) AS n FROM agentsam_cron_runs;
SELECT 'agentsam_bootstrap' AS t, COUNT(*) AS n FROM agentsam_bootstrap;
SELECT 'agentsam_compaction_events' AS t, COUNT(*) AS n FROM agentsam_compaction_events;
SELECT 'agentsam_tool_cache' AS t, COUNT(*) AS n FROM agentsam_tool_cache;
SELECT 'agentsam_browser_trusted_origin' AS t, COUNT(*) AS n FROM agentsam_browser_trusted_origin;
SELECT 'agentsam_mcp_workflows' AS t, COUNT(*) AS n FROM agentsam_mcp_workflows;

SELECT 'recent_errors' AS q, id, error_type, substr(error_message,1,80) AS msg, created_at FROM agentsam_error_log ORDER BY created_at DESC LIMIT 5;
SELECT 'recent_tool_calls' AS q, tool_name, status, created_at FROM agentsam_tool_call_log ORDER BY created_at DESC LIMIT 5;
SELECT 'recent_cron' AS q, job_name, status, started_at FROM agentsam_cron_runs ORDER BY started_at DESC LIMIT 5;
SQL

echo ""
echo "== agentsam ops ledger: counts + recent rows =="
run_sql "$TMP"

if [[ "${OPS_LEDGER_WRITE_SMOKE:-}" == "1" ]]; then
  SM="$(mktemp "${TMPDIR:-/tmp}/agentsam_ops_smoke.XXXXXX.sql")"
  cat >"$SM" <<'SQL'
INSERT INTO agentsam_cron_runs (id, job_name, status, metadata_json)
VALUES ('acr_ops_validate_smoke', 'ops_ledger_validate_smoke', 'skipped', '{}');
SQL
  echo ""
  echo "== OPS_LEDGER_WRITE_SMOKE: attempting one cron insert =="
  run_sql "$SM" || true
fi
