#!/usr/bin/env bash
set -euo pipefail

DB="${DB:-inneranimalmedia-business}"
CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"

CMD="
SELECT
  name AS column_name,
  type,
  dflt_value
FROM pragma_table_info('agentsam_mcp_tool_execution')
WHERE name IN (
  'tool_key',
  'action_type',
  'resource_type',
  'resource_id',
  'actor_type',
  'actor_source',
  'policy_decision_json',
  'denial_code',
  'error_code',
  'error_family',
  'error_detail_json',
  'error_log_id',
  'http_status',
  'provider_error_code'
)
ORDER BY name;
"

if [ -f "$CFG" ]; then
  npx wrangler d1 execute "$DB" --remote -c "$CFG" --command "$CMD"
else
  npx wrangler d1 execute "$DB" --remote --command "$CMD"
fi
