#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://inneranimalmedia.com}"
DB="${DB:-inneranimalmedia-business}"
CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"
COOKIE="${COOKIE:-}"
WORKSPACE_ID="${WORKSPACE_ID:-ws_inneranimalmedia}"
WORKFLOW_KEY="${WORKFLOW_KEY:-i-am-builder-monaco}"
TOOL_KEY="${TOOL_KEY:-mcp_dispatch}"

if [ -z "$COOKIE" ]; then
  echo "Missing COOKIE env var."
  echo "Usage:"
  echo "COOKIE='session=<uuid>' BASE_URL='https://inneranimalmedia.com' bash scripts/smoke-agent-e2e.sh"
  echo "Or pass only the session UUID; this script will prepend session= automatically."
  exit 1
fi

# Accept bare session UUID (Cookie header needs name=value).
if [[ "$COOKIE" != *"="* ]]; then
  COOKIE="session=${COOKIE}"
fi

run_d1() {
  local sql="$1"
  if [ -f "$CFG" ]; then
    npx wrangler d1 execute "$DB" --remote -c "$CFG" --command "$sql"
  else
    npx wrangler d1 execute "$DB" --remote --command "$sql"
  fi
}

echo ""
echo "================================================================"
echo "1. PRECHECK: MCP execution action columns"
echo "================================================================"

run_d1 "
SELECT
  COUNT(*) AS action_columns_present
FROM pragma_table_info('agentsam_mcp_tool_execution')
WHERE name IN ('tool_key','action_type','resource_type','policy_decision_json','denial_code','error_code','error_log_id');
"

echo ""
echo "================================================================"
echo "2. MCP DISPATCH ALLOWED/POLICY PATH"
echo "================================================================"

curl -sS "$BASE_URL/api/mcp/dispatch" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  --data "{
    \"workspace_id\": \"$WORKSPACE_ID\",
    \"tool_key\": \"$TOOL_KEY\",
    \"action_type\": \"read\",
    \"resource_type\": \"smoke_test\",
    \"input\": {
      \"smoke\": true,
      \"source\": \"scripts/smoke-agent-e2e.sh\"
    }
  }" | tee /tmp/smoke_mcp_dispatch_allowed.json

echo ""
echo "================================================================"
echo "3. MCP DISPATCH MISSING TOOL / DENIAL PATH"
echo "================================================================"

curl -sS "$BASE_URL/api/mcp/dispatch" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  --data "{
    \"workspace_id\": \"$WORKSPACE_ID\",
    \"tool_key\": \"__smoke_missing_tool__\",
    \"action_type\": \"read\",
    \"resource_type\": \"smoke_test\",
    \"input\": {
      \"smoke\": true,
      \"expect_error\": true
    }
  }" | tee /tmp/smoke_mcp_dispatch_denied.json || true

echo ""
echo "================================================================"
echo "4. START GRAPH WORKFLOW"
echo "================================================================"

curl -sS "$BASE_URL/api/agent/workflow/start" \
  -H "Content-Type: application/json" \
  -H "Cookie: $COOKIE" \
  --data "{
    \"workspace_id\": \"$WORKSPACE_ID\",
    \"workflow_key\": \"$WORKFLOW_KEY\",
    \"trigger_type\": \"smoke\",
    \"input\": {
      \"smoke\": true,
      \"source\": \"scripts/smoke-agent-e2e.sh\"
    }
  }" | tee /tmp/smoke_workflow_start.json || true

echo ""
echo "================================================================"
echo "5. VERIFY LATEST MCP EXECUTION ROWS"
echo "================================================================"

run_d1 "
SELECT
  id,
  tool_name,
  tool_id,
  agentsam_tools_id,
  tool_key,
  tenant_id,
  workspace_id,
  user_id,
  action_type,
  resource_type,
  requires_approval,
  timeout_ms,
  success,
  denial_code,
  error_code,
  substr(error_message, 1, 160) AS error_message,
  created_at
FROM agentsam_mcp_tool_execution
ORDER BY created_at DESC
LIMIT 10;
"

echo ""
echo "================================================================"
echo "6. VERIFY LATEST ERROR BRIDGE ROWS"
echo "================================================================"

run_d1 "
SELECT
  id,
  workspace_id,
  tenant_id,
  session_id,
  error_code,
  error_type,
  source,
  source_id,
  substr(error_message, 1, 200) AS error_message,
  substr(context_json, 1, 500) AS context_preview,
  created_at
FROM agentsam_error_log
WHERE source = 'agentsam_mcp_tool_execution'
ORDER BY created_at DESC
LIMIT 10;
"

echo ""
echo "================================================================"
echo "7. VERIFY LATEST WORKFLOW RUNS"
echo "================================================================"

run_d1 "
SELECT
  id,
  workflow_key,
  tenant_id,
  workspace_id,
  user_id,
  trigger_type,
  status,
  steps_completed,
  steps_total,
  substr(error_message, 1, 200) AS error_message,
  substr(step_results_json, 1, 600) AS step_results_preview,
  created_at,
  completed_at
FROM agentsam_workflow_runs
ORDER BY created_at DESC
LIMIT 10;
"

echo ""
echo "Smoke complete."
