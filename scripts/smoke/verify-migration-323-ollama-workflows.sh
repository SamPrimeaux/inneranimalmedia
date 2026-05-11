#!/usr/bin/env bash
# Verify migration 323 / 324 Ollama workflow registry rows on remote D1.
# Usage:
#   ./scripts/smoke/verify-migration-323-ollama-workflows.sh
# Env:
#   WRANGLER_CONFIG (default wrangler.production.toml)
#   D1_DATABASE     (default inneranimalmedia-business)
#
# Exit nonzero if workflows missing, active, empty graphs, orphan edges, bad triggers,
# or invalid seed workflow runs.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

CONFIG="${WRANGLER_CONFIG:-wrangler.production.toml}"
DB="${D1_DATABASE:-inneranimalmedia-business}"

# Keep in sync with src/core/workflow-executor.js TRIGGER_TYPES_SAFE
ALLOW_WORKFLOW_TRIGGERS='manual agent cursor github_push scheduled cicd deploy api smoke'

# agentsam_workflow_runs CHECK(trigger_type ...) — D1 schema (smoke not allowed on runs)
ALLOW_RUN_TRIGGERS='manual agent cursor github_push scheduled cicd deploy api'

WF_KEYS=(
  ollama_embed_intent_route
  ollama_code_review
  ollama_rag_local
  ollama_nightly_chat_compaction
)

SEED_RUN_IDS=(
  wrun_eir_smoke_001
  wrun_eir_smoke_002
  wrun_lcr_smoke_001
  wrun_rag_smoke_001
  wrun_rag_smoke_002
  wrun_ncc_smoke_001
)

json_rows() {
  local q="$1"
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$CONFIG" --json --command "$q" 2>/dev/null \
    | jq -r '.[0].results // empty'
}

fail() {
  echo "VERIFY FAILED: $*" >&2
  exit 1
}

echo "=== Migration 323/324 Ollama workflow verification (remote D1: $DB) ==="

KEY_LIST=$(printf "'%s'," "${WF_KEYS[@]}" | sed 's/,$//')

SUMMARY=$(json_rows "
SELECT
  w.workflow_key,
  w.id AS workflow_id,
  w.is_active,
  w.trigger_type,
  COUNT(DISTINCT n.id) AS node_count,
  COUNT(DISTINCT e.id) AS edge_count
FROM agentsam_workflows w
LEFT JOIN agentsam_workflow_nodes n ON n.workflow_id = w.id
LEFT JOIN agentsam_workflow_edges e ON e.workflow_id = w.id
WHERE w.workflow_key IN (${KEY_LIST})
GROUP BY w.workflow_key, w.id, w.is_active, w.trigger_type
ORDER BY w.workflow_key;
")

ROWCOUNT=$(echo "$SUMMARY" | jq 'length')
if [[ "$ROWCOUNT" -ne 4 ]]; then
  fail "expected 4 workflow rows, got ${ROWCOUNT}"
fi

echo "$SUMMARY" | jq .

echo ""
echo "--- Trigger + activity checks ---"

while IFS= read -r row; do
  key=$(echo "$row" | jq -r '.workflow_key')
  active=$(echo "$row" | jq -r '.is_active')
  trig=$(echo "$row" | jq -r '.trigger_type')
  nodes=$(echo "$row" | jq -r '.node_count')
  echo "  $key  active=$active  trigger_type=$trig  nodes=$nodes"

  if [[ "$active" != "0" ]]; then
    fail "workflow $key must have is_active=0 (got $active)"
  fi
  if [[ "$nodes" -eq 0 ]]; then
    fail "workflow $key has zero nodes"
  fi
  ok=0
  for t in $ALLOW_WORKFLOW_TRIGGERS; do
    if [[ "$trig" == "$t" ]]; then ok=1; break; fi
  done
  if [[ "$ok" -ne 1 ]]; then
    fail "workflow $key trigger_type '$trig' not in executor allowlist ($ALLOW_WORKFLOW_TRIGGERS)"
  fi
done < <(echo "$SUMMARY" | jq -c '.[]')

echo ""
echo "--- Orphan edges (expect empty) ---"
ORPH=$(json_rows "
SELECT e.id, e.workflow_id, e.from_node_key, e.to_node_key, 'from_bad' AS issue
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id = e.workflow_id
WHERE w.workflow_key IN (${KEY_LIST})
AND NOT EXISTS (
  SELECT 1 FROM agentsam_workflow_nodes n
  WHERE n.workflow_id = e.workflow_id AND n.node_key = e.from_node_key
)
UNION ALL
SELECT e.id, e.workflow_id, e.from_node_key, e.to_node_key, 'to_bad'
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id = e.workflow_id
WHERE w.workflow_key IN (${KEY_LIST})
AND NOT EXISTS (
  SELECT 1 FROM agentsam_workflow_nodes n
  WHERE n.workflow_id = e.workflow_id AND n.node_key = e.to_node_key
);
")
OC=$(echo "$ORPH" | jq 'length')
if [[ "$OC" -ne 0 ]]; then
  echo "$ORPH" | jq .
  fail "found $OC orphan edge endpoint(s)"
fi
echo "  (none)"

echo ""
echo "--- Duplicate node_key per workflow (expect empty) ---"
DUP=$(json_rows "
SELECT n.workflow_id, n.node_key, COUNT(*) AS c
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id = n.workflow_id
WHERE w.workflow_key IN (${KEY_LIST})
GROUP BY n.workflow_id, n.node_key
HAVING COUNT(*) > 1;
")
DC=$(echo "$DUP" | jq 'length')
if [[ "$DC" -ne 0 ]]; then
  echo "$DUP" | jq .
  fail "duplicate node keys in workflow"
fi
echo "  (none)"

echo ""
echo "--- Seed workflow runs (${#SEED_RUN_IDS[@]} rows) ---"
RUN_LIST=$(printf "'%s'," "${SEED_RUN_IDS[@]}" | sed 's/,$//')
SEEDS=$(json_rows "
SELECT id, workflow_key, status, trigger_type,
  json_extract(metadata_json, '\$.migration_ref') AS migration_ref
FROM agentsam_workflow_runs
WHERE id IN (${RUN_LIST})
ORDER BY id;
")
SC=$(echo "$SEEDS" | jq 'length')
if [[ "$SC" -ne "${#SEED_RUN_IDS[@]}" ]]; then
  fail "expected ${#SEED_RUN_IDS[@]} seed runs by id, got $SC"
fi

echo "$SEEDS" | jq .

while IFS= read -r row; do
  rid=$(echo "$row" | jq -r '.id')
  st=$(echo "$row" | jq -r '.status')
  tt=$(echo "$row" | jq -r '.trigger_type')
  mr=$(echo "$row" | jq -r '.migration_ref')
  if [[ "$st" != "completed" ]]; then
    fail "seed $rid status must be completed (got $st)"
  fi
  if [[ "$st" == "running" ]]; then
    fail "seed $rid must not be running"
  fi
  rok=0
  for t in $ALLOW_RUN_TRIGGERS; do
    if [[ "$tt" == "$t" ]]; then rok=1; break; fi
  done
  if [[ "$rok" -ne 1 ]]; then
    fail "seed $rid trigger_type '$tt' not allowed on agentsam_workflow_runs ($ALLOW_RUN_TRIGGERS)"
  fi
  if [[ "$mr" != "migrations/323_agentsam_ollama_embed_pipeline_workflows.sql" ]]; then
    fail "seed $rid metadata migration_ref missing or wrong (got: ${mr:-empty})"
  fi
done < <(echo "$SEEDS" | jq -c '.[]')

echo ""
echo "VERIFY OK"
