#!/usr/bin/env bash
# Inspect D1 schemas for Agent Sam ops ledger tables (PRAGMA table_info).
# Run from repo root; uses .env.cloudflare via with-cloudflare-env when present.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${DB_NAME:-inneranimalmedia-business}"
TMP="$(mktemp "${TMPDIR:-/tmp}/agentsam_ops_audit.XXXXXX.sql")"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

cat >"$TMP" <<'SQL'
SELECT name, type
FROM sqlite_master
WHERE type IN ('table','view')
  AND name LIKE 'agentsam_%'
  AND name IN (
    'agentsam_error_log',
    'agentsam_deployment_health',
    'agentsam_mcp_workflows',
    'agentsam_tool_cache',
    'agentsam_tool_call_log',
    'agentsam_browser_trusted_origin',
    'agentsam_bootstrap',
    'agentsam_compaction_events',
    'agentsam_cron_runs'
  )
ORDER BY name;

PRAGMA table_info(agentsam_error_log);
PRAGMA table_info(agentsam_deployment_health);
PRAGMA table_info(agentsam_mcp_workflows);
PRAGMA table_info(agentsam_tool_cache);
PRAGMA table_info(agentsam_tool_call_log);
PRAGMA table_info(agentsam_browser_trusted_origin);
PRAGMA table_info(agentsam_bootstrap);
PRAGMA table_info(agentsam_compaction_events);
PRAGMA table_info(agentsam_cron_runs);
SQL

cd "$ROOT"
if [[ -x "${ROOT}/scripts/with-cloudflare-env.sh" ]]; then
  exec ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c wrangler.production.toml --file="$TMP"
else
  exec npx wrangler d1 execute "$DB" --remote -c wrangler.production.toml --file="$TMP"
fi
