#!/usr/bin/env bash
# Fallback edge inserts for all 5 populated workflow DAGs
# Also fixes the Inspector Playwright to_node_key='always' data bug
#
# Usage:
#   ./scripts/with-cloudflare-env.sh bash scripts/seed_fallback_edges.sh
#
# Each statement is a separate wrangler call — D1 single-statement constraint.

set -euo pipefail

DB="inneranimalmedia-business"
W="npx wrangler d1 execute $DB --remote --command"

ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

run() {
  local label="$1"
  local sql="$2"
  if $W "$sql" > /dev/null 2>&1; then
    ok "$label"
  else
    fail "$label"
  fi
}

echo ""
echo "━━ Fix: Inspector Playwright to_node_key data bug"
run "assertions → report (was to_node_key='always')" \
  "UPDATE agentsam_workflow_edges SET to_node_key = 'report' WHERE workflow_id = 'i-am-inspector-playwright' AND from_node_key = 'assertions' AND to_node_key = 'always'"


echo ""
echo "━━ Fallbacks: i-am-openai-smoke-test"
run "classify → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-openai-smoke-test','classify','report','status','{\"from_status\":\"failed\"}',1,'classify failed')"

run "execute → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-openai-smoke-test','execute','report','status','{\"from_status\":\"failed\"}',1,'execute failed')"


echo ""
echo "━━ Fallbacks: i-am-builder-cloudflare"
run "preflight → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-builder-cloudflare','preflight','report','status','{\"from_status\":\"failed\"}',1,'policy failed')"

# Single edge covers both rejected + timeout — UNIQUE(workflow_id, from, to) allows only one
# executor evaluates condition_json.from_status as array OR
run "approval_gate → report (rejected|timeout)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-builder-cloudflare','approval_gate','report','status','{\"from_status\":[\"rejected\",\"timeout\"]}',1,'approval rejected or timed out')"

run "execute → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-builder-cloudflare','execute','report','status','{\"from_status\":\"failed\"}',1,'execute failed')"


echo ""
echo "━━ Fallbacks: i-am-architect-excalidraw"
run "clarify → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-architect-excalidraw','clarify','report','status','{\"from_status\":\"failed\"}',1,'clarify failed')"

run "diagram → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-architect-excalidraw','diagram','report','status','{\"from_status\":\"failed\"}',1,'diagram failed')"


echo ""
echo "━━ Fallbacks: i-am-builder-monaco"
run "map_file → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-builder-monaco','map_file','report','status','{\"from_status\":\"failed\"}',1,'map failed')"

run "edit_monaco → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-builder-monaco','edit_monaco','report','status','{\"from_status\":\"failed\"}',1,'edit failed')"


echo ""
echo "━━ Fallbacks: i-am-inspector-playwright"
run "open_target → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-inspector-playwright','open_target','report','status','{\"from_status\":\"failed\"}',1,'open failed')"

run "capture_evidence → report (status:failed)" \
  "INSERT INTO agentsam_workflow_edges (workflow_id, from_node_key, to_node_key, condition_type, condition_json, is_fallback, label) VALUES ('i-am-inspector-playwright','capture_evidence','report','status','{\"from_status\":\"failed\"}',1,'capture failed')"


echo ""
echo "━━ Verify edge counts"
$W "SELECT workflow_id, COUNT(*) as edges, SUM(is_fallback) as fallbacks FROM agentsam_workflow_edges GROUP BY workflow_id ORDER BY workflow_id"

echo ""
echo "Done."
