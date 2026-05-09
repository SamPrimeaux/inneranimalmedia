#!/usr/bin/env bash
set -euo pipefail

DB="${DB:-inneranimalmedia-business}"
CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"

run() {
  local title="$1"
  local sql="$2"

  echo ""
  echo "================================================================"
  echo "$title"
  echo "================================================================"

  if [ -f "$CFG" ]; then
    npx wrangler d1 execute "$DB" --remote -c "$CFG" --command "$sql"
  else
    npx wrangler d1 execute "$DB" --remote --command "$sql"
  fi
}

run "1. WORKFLOW SYSTEM SPLIT" "
SELECT 'mcp_catalog' AS layer, COUNT(*) AS rows FROM agentsam_mcp_workflows
UNION ALL SELECT 'graph_workflows', COUNT(*) FROM agentsam_workflows
UNION ALL SELECT 'graph_nodes', COUNT(*) FROM agentsam_workflow_nodes
UNION ALL SELECT 'graph_edges', COUNT(*) FROM agentsam_workflow_edges
UNION ALL SELECT 'graph_runs', COUNT(*) FROM agentsam_workflow_runs;
"

run "2. GRAPH WORKFLOWS THAT CAN BE SMOKE TESTED NOW" "
SELECT
  w.id,
  w.workflow_key,
  w.display_name,
  w.workflow_type,
  COALESCE(w.tenant_id, 'GLOBAL') AS tenant_id,
  COALESCE(w.workspace_id, 'GLOBAL') AS workspace_id,
  COUNT(DISTINCT n.id) AS nodes,
  COUNT(DISTINCT e.id) AS edges,
  COUNT(DISTINCT r.id) AS runs,
  SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failed_runs
FROM agentsam_workflows w
LEFT JOIN agentsam_mcp_workflows m ON m.workflow_key = w.workflow_key
  AND m.id = (
    SELECT m2.id FROM agentsam_mcp_workflows m2
    WHERE m2.workflow_key = w.workflow_key
    ORDER BY (m2.tenant_id IS NOT NULL) DESC, (m2.workspace_id IS NOT NULL) DESC, m2.updated_at DESC
    LIMIT 1
  )
LEFT JOIN agentsam_workflow_nodes n
  ON n.workflow_id = w.id OR (m.id IS NOT NULL AND n.workflow_id = m.id)
LEFT JOIN agentsam_workflow_edges e
  ON e.workflow_id = w.id OR (m.id IS NOT NULL AND e.workflow_id = m.id)
LEFT JOIN agentsam_workflow_runs r ON r.workflow_key = w.workflow_key
GROUP BY w.id
HAVING nodes > 0
ORDER BY failed_runs DESC, runs DESC, nodes DESC;
"

run "3. GRAPH WORKFLOWS THAT ARE STUBS" "
SELECT
  w.id,
  w.workflow_key,
  w.display_name,
  COUNT(DISTINCT n.id) AS nodes,
  COUNT(DISTINCT e.id) AS edges
FROM agentsam_workflows w
LEFT JOIN agentsam_mcp_workflows m ON m.workflow_key = w.workflow_key
  AND m.id = (
    SELECT m2.id FROM agentsam_mcp_workflows m2
    WHERE m2.workflow_key = w.workflow_key
    ORDER BY (m2.tenant_id IS NOT NULL) DESC, (m2.workspace_id IS NOT NULL) DESC, m2.updated_at DESC
    LIMIT 1
  )
LEFT JOIN agentsam_workflow_nodes n
  ON n.workflow_id = w.id OR (m.id IS NOT NULL AND n.workflow_id = m.id)
LEFT JOIN agentsam_workflow_edges e
  ON e.workflow_id = w.id OR (m.id IS NOT NULL AND e.workflow_id = m.id)
GROUP BY w.id
HAVING nodes = 0
ORDER BY w.workflow_key;
"

run "4. MCP WORKFLOWS CLAIMING GRAPH_MODE BUT MISSING GRAPH" "
SELECT
  m.workflow_key,
  m.display_name,
  m.tenant_id,
  m.workspace_id,
  m.graph_mode,
  CASE WHEN json_valid(m.steps_json) THEN json_array_length(m.steps_json) ELSE -1 END AS steps_count,
  CASE WHEN json_valid(m.tools_json) THEN json_array_length(m.tools_json) ELSE -1 END AS tools_count,
  CASE
    WHEN w.id IS NULL THEN 'MISSING_GRAPH'
    ELSE 'HAS_GRAPH'
  END AS graph_status
FROM agentsam_mcp_workflows m
LEFT JOIN agentsam_workflows w
  ON w.workflow_key = m.workflow_key
WHERE m.graph_mode = 1
ORDER BY graph_status DESC, m.workflow_key;
"

run "5. MCP WORKFLOWS WITH EXECUTABLE-LOOKING STEPS" "
SELECT
  workflow_key,
  display_name,
  category,
  risk_level,
  requires_approval,
  CASE WHEN json_valid(steps_json) THEN json_array_length(steps_json) ELSE -1 END AS steps_count,
  CASE WHEN json_valid(tools_json) THEN json_array_length(tools_json) ELSE -1 END AS tools_count,
  substr(steps_json, 1, 240) AS steps_preview
FROM agentsam_mcp_workflows
WHERE is_active = 1
  AND json_valid(steps_json) = 1
  AND json_array_length(steps_json) > 0
ORDER BY
  graph_mode DESC,
  requires_approval ASC,
  steps_count ASC,
  workflow_key;
"

run "6. RECENT GRAPH RUN FAILURES WITH STEP RESULTS" "
SELECT
  id AS run_id,
  workflow_key,
  tenant_id,
  workspace_id,
  user_id,
  status,
  steps_completed,
  steps_total,
  error_message,
  substr(step_results_json, 1, 800) AS step_results_preview,
  created_at,
  completed_at
FROM agentsam_workflow_runs
ORDER BY created_at DESC
LIMIT 20;
"
