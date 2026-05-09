#!/usr/bin/env bash
set -euo pipefail

DB="${DB:-inneranimalmedia-business}"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.production.toml}"
OUT="${OUT:-/tmp/agentsam_workflow_audit_report.txt}"

run_sql() {
  local title="$1"
  local sql="$2"

  {
    echo ""
    echo "================================================================"
    echo "$title"
    echo "================================================================"
  } | tee -a "$OUT"

  if [ -f "$WRANGLER_CONFIG" ]; then
    npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CONFIG" --command "$sql" | tee -a "$OUT"
  else
    npx wrangler d1 execute "$DB" --remote --command "$sql" | tee -a "$OUT"
  fi
}

: > "$OUT"

echo "Agent Sam Workflow Audit" | tee -a "$OUT"
echo "DB: $DB" | tee -a "$OUT"
echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" | tee -a "$OUT"

run_sql "A. ROW COUNTS: MCP catalog vs normalized graph model" "
SELECT 'agentsam_mcp_workflows' AS table_name, COUNT(*) AS rows FROM agentsam_mcp_workflows
UNION ALL
SELECT 'agentsam_workflows', COUNT(*) FROM agentsam_workflows
UNION ALL
SELECT 'agentsam_workflow_nodes', COUNT(*) FROM agentsam_workflow_nodes
UNION ALL
SELECT 'agentsam_workflow_edges', COUNT(*) FROM agentsam_workflow_edges
UNION ALL
SELECT 'agentsam_workflow_runs', COUNT(*) FROM agentsam_workflow_runs
ORDER BY table_name;
"

run_sql "B. MCP WORKFLOW CATALOG SUMMARY" "
SELECT
  workflow_key,
  display_name,
  COALESCE(tenant_id, 'NULL') AS tenant_id,
  COALESCE(workspace_id, 'NULL') AS workspace_id,
  status,
  is_active,
  category,
  task_type,
  risk_level,
  requires_approval,
  trigger_type,
  graph_mode,
  CASE WHEN json_valid(steps_json) THEN json_array_length(steps_json) ELSE -1 END AS steps_count,
  CASE WHEN json_valid(tools_json) THEN json_array_length(tools_json) ELSE -1 END AS tools_count,
  run_count,
  success_count,
  last_run_status,
  avg_duration_ms,
  total_cost_usd,
  updated_at
FROM agentsam_mcp_workflows
ORDER BY
  is_active DESC,
  graph_mode DESC,
  run_count DESC,
  category,
  workflow_key;
"

run_sql "C. MCP WORKFLOWS WITH JSON PROBLEMS" "
SELECT
  workflow_key,
  display_name,
  CASE WHEN json_valid(steps_json) THEN 'ok' ELSE 'INVALID_STEPS_JSON' END AS steps_json_status,
  CASE WHEN json_valid(tools_json) THEN 'ok' ELSE 'INVALID_TOOLS_JSON' END AS tools_json_status,
  CASE WHEN json_valid(acceptance_criteria_json) THEN 'ok' ELSE 'INVALID_ACCEPTANCE_JSON' END AS acceptance_status,
  CASE WHEN json_valid(input_schema_json) THEN 'ok' ELSE 'INVALID_INPUT_SCHEMA' END AS input_schema_status,
  CASE WHEN json_valid(output_schema_json) THEN 'ok' ELSE 'INVALID_OUTPUT_SCHEMA' END AS output_schema_status,
  CASE WHEN json_valid(retry_policy_json) THEN 'ok' ELSE 'INVALID_RETRY_POLICY' END AS retry_policy_status,
  CASE WHEN json_valid(on_failure_json) THEN 'ok' ELSE 'INVALID_ON_FAILURE' END AS on_failure_status
FROM agentsam_mcp_workflows
WHERE json_valid(steps_json) = 0
   OR json_valid(tools_json) = 0
   OR json_valid(acceptance_criteria_json) = 0
   OR json_valid(input_schema_json) = 0
   OR json_valid(output_schema_json) = 0
   OR json_valid(retry_policy_json) = 0
   OR json_valid(on_failure_json) = 0
ORDER BY workflow_key;
"

run_sql "D. NORMALIZED GRAPH WORKFLOWS SUMMARY" "
SELECT
  w.id AS workflow_id,
  w.workflow_key,
  w.display_name,
  COALESCE(w.tenant_id, 'NULL') AS tenant_id,
  COALESCE(w.workspace_id, 'NULL') AS workspace_id,
  w.workflow_type,
  w.trigger_type,
  w.default_task_type,
  w.risk_level,
  w.requires_approval,
  w.is_active,
  w.is_platform_global,
  COUNT(DISTINCT n.id) AS node_count,
  COUNT(DISTINCT e.id) AS edge_count,
  COUNT(DISTINCT r.id) AS run_count
FROM agentsam_workflows w
LEFT JOIN agentsam_workflow_nodes n
  ON n.workflow_id = w.id
LEFT JOIN agentsam_workflow_edges e
  ON e.workflow_id = w.id
LEFT JOIN agentsam_workflow_runs r
  ON r.workflow_id = w.id
GROUP BY w.id
ORDER BY
  w.is_active DESC,
  run_count DESC,
  node_count DESC,
  w.workflow_key;
"

run_sql "E. MCP CATALOG → GRAPH ALIGNMENT BY WORKFLOW_KEY + WORKSPACE" "
SELECT
  m.workflow_key,
  m.display_name AS mcp_display_name,
  COALESCE(m.workspace_id, 'NULL') AS mcp_workspace_id,
  COALESCE(m.tenant_id, 'NULL') AS mcp_tenant_id,
  m.graph_mode AS mcp_graph_mode,
  CASE WHEN json_valid(m.steps_json) THEN json_array_length(m.steps_json) ELSE -1 END AS mcp_steps_count,
  CASE WHEN json_valid(m.tools_json) THEN json_array_length(m.tools_json) ELSE -1 END AS mcp_tools_count,

  COALESCE(w.id, 'NULL') AS graph_workflow_id,
  COALESCE(w.display_name, 'NULL') AS graph_display_name,
  COALESCE(w.workspace_id, 'NULL') AS graph_workspace_id,
  COALESCE(w.tenant_id, 'NULL') AS graph_tenant_id,

  COUNT(DISTINCT n.id) AS graph_node_count,
  COUNT(DISTINCT e.id) AS graph_edge_count,
  COUNT(DISTINCT r.id) AS graph_run_count,

  CASE
    WHEN w.id IS NULL AND m.graph_mode = 1 THEN 'MISSING_GRAPH_FOR_GRAPH_MODE_MCP'
    WHEN w.id IS NULL THEN 'MCP_ONLY'
    WHEN m.id IS NULL THEN 'GRAPH_ONLY'
    WHEN COUNT(DISTINCT n.id) = 0 THEN 'GRAPH_HAS_NO_NODES'
    WHEN COUNT(DISTINCT e.id) = 0 AND COUNT(DISTINCT n.id) > 1 THEN 'GRAPH_HAS_NODES_NO_EDGES'
    ELSE 'ALIGNED_OR_PARTIAL'
  END AS alignment_status

FROM agentsam_mcp_workflows m
LEFT JOIN agentsam_workflows w
  ON w.workflow_key = m.workflow_key
 AND (
      w.workspace_id = m.workspace_id
      OR w.workspace_id IS NULL
      OR m.workspace_id IS NULL
 )
LEFT JOIN agentsam_workflow_nodes n
  ON n.workflow_id = w.id
LEFT JOIN agentsam_workflow_edges e
  ON e.workflow_id = w.id
LEFT JOIN agentsam_workflow_runs r
  ON r.workflow_id = w.id
GROUP BY m.id, w.id
ORDER BY
  CASE alignment_status
    WHEN 'MISSING_GRAPH_FOR_GRAPH_MODE_MCP' THEN 0
    WHEN 'GRAPH_HAS_NO_NODES' THEN 1
    WHEN 'GRAPH_HAS_NODES_NO_EDGES' THEN 2
    WHEN 'MCP_ONLY' THEN 3
    ELSE 9
  END,
  m.workflow_key;
"

run_sql "F. GRAPH WORKFLOWS WITH NO MCP CATALOG MATCH" "
SELECT
  w.id AS graph_workflow_id,
  w.workflow_key,
  w.display_name,
  COALESCE(w.tenant_id, 'NULL') AS tenant_id,
  COALESCE(w.workspace_id, 'NULL') AS workspace_id,
  w.workflow_type,
  w.is_active,
  COUNT(DISTINCT n.id) AS node_count,
  COUNT(DISTINCT e.id) AS edge_count,
  COUNT(DISTINCT r.id) AS run_count
FROM agentsam_workflows w
LEFT JOIN agentsam_mcp_workflows m
  ON m.workflow_key = w.workflow_key
 AND (
      m.workspace_id = w.workspace_id
      OR m.workspace_id IS NULL
      OR w.workspace_id IS NULL
 )
LEFT JOIN agentsam_workflow_nodes n
  ON n.workflow_id = w.id
LEFT JOIN agentsam_workflow_edges e
  ON e.workflow_id = w.id
LEFT JOIN agentsam_workflow_runs r
  ON r.workflow_id = w.id
WHERE m.id IS NULL
GROUP BY w.id
ORDER BY run_count DESC, node_count DESC, w.workflow_key;
"

run_sql "G. WORKFLOW RUNS: RECENT EXECUTION HEALTH" "
SELECT
  r.id AS run_id,
  r.workflow_key,
  r.display_name,
  COALESCE(r.tenant_id, 'NULL') AS tenant_id,
  COALESCE(r.workspace_id, 'NULL') AS workspace_id,
  COALESCE(r.user_id, 'NULL') AS user_id,
  r.trigger_type,
  r.status,
  r.steps_completed,
  r.steps_total,
  r.duration_ms,
  r.cost_usd,
  r.error_message,
  r.created_at,
  r.completed_at
FROM agentsam_workflow_runs r
ORDER BY r.created_at DESC
LIMIT 50;
"

run_sql "H. WORKFLOW NODES BY HANDLER TYPE" "
SELECT
  n.node_type,
  n.handler_key,
  COUNT(*) AS nodes,
  SUM(CASE WHEN n.requires_approval = 1 THEN 1 ELSE 0 END) AS approval_nodes,
  SUM(CASE WHEN n.is_active = 1 THEN 1 ELSE 0 END) AS active_nodes
FROM agentsam_workflow_nodes n
GROUP BY n.node_type, n.handler_key
ORDER BY nodes DESC, n.node_type, n.handler_key;
"

run_sql "I. MCP WORKFLOWS REFERENCING TOOLS_JSON: RAW PREVIEW" "
SELECT
  workflow_key,
  display_name,
  substr(tools_json, 1, 500) AS tools_json_preview,
  substr(steps_json, 1, 500) AS steps_json_preview
FROM agentsam_mcp_workflows
ORDER BY workflow_key
LIMIT 100;
"

echo ""
echo "Report saved to: $OUT"
