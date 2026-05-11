#!/usr/bin/env bash
set -e

DEPLOY_HASH=$(git rev-parse --short HEAD)
DEPLOY_FULL_SHA=$(git rev-parse HEAD)
DEPLOY_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEPLOY_MSG=$(git log -1 --pretty=%s)
DEPLOY_MSG_ESC=$(printf '%s' "$DEPLOY_MSG" | sed "s/'/''/g")

WORKSPACE_ID="${1:-ws_inneranimalmedia}"
TENANT_ID="${2:-tenant_sam_primeaux}"
USER_ID="${3:-usr_sam_iam}"

echo "[post-deploy] hash=$DEPLOY_HASH workspace=$WORKSPACE_ID"

# ── D1 agentsam_memory — canonical deploy marker (UNIQUE tenant_id, user_id, key) ──
npx wrangler d1 execute inneranimalmedia-business --remote --command "
INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id,
  memory_type, \"key\", value, source, confidence, decay_score, tags, updated_at
) VALUES (
  'mem_last_deploy_${WORKSPACE_ID}',
  '${TENANT_ID}', '${USER_ID}', '${WORKSPACE_ID}',
  'fact',
  'last_successful_deploy',
  json_object(
    'hash',        '${DEPLOY_HASH}',
    'full_sha',    '${DEPLOY_FULL_SHA}',
    'message',     '${DEPLOY_MSG_ESC}',
    'deployed_at', '${DEPLOY_TIME}',
    'branch',      'main',
    'workspace_id','${WORKSPACE_ID}'
  ),
  'post_deploy_hook',
  1.0,
  1.0,
  '[\"deploy\",\"production\",\"state\"]',
  unixepoch()
)
ON CONFLICT(tenant_id, user_id, \"key\") DO UPDATE SET
  value = excluded.value,
  workspace_id = excluded.workspace_id,
  source = excluded.source,
  confidence = excluded.confidence,
  decay_score = excluded.decay_score,
  tags = excluded.tags,
  updated_at = excluded.updated_at;
"

# ── Supabase build_deploy_events → triggers agent_memory auto-embed ───
SUPABASE_URL="${SUPABASE_URL:-https://dpmuvynqixblxsilnlut.supabase.co}"
# Guard against stale refs lingering in the shell env (wrong host causes curl DNS failures).
for stale in tcczxkatmodtxfuulvsr sexdnwlyuhkyvseunqlx; do
  case "${SUPABASE_URL:-}" in
    *"${stale}"*)
      echo "[post-deploy] ⚠️  SUPABASE_URL contains stale ref ${stale}; using https://dpmuvynqixblxsilnlut.supabase.co for this run." >&2
      SUPABASE_URL="https://dpmuvynqixblxsilnlut.supabase.co"
      break
      ;;
  esac
done
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "${REPO_ROOT}/.deploy-run-context.json" ]; then
  echo "[post-deploy] deploy ledger active (.deploy-run-context.json) — skipping duplicate build_deploy_events POST"
elif [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "[post-deploy] SUPABASE_SERVICE_ROLE_KEY unset — skipping Supabase insert" >&2
else
  DEPLOY_ID="deploy_$(date +%s)"
  if command -v jq >/dev/null 2>&1; then
    PAYLOAD=$(
      jq -n \
        --arg id "$DEPLOY_ID" \
        --arg ws "$WORKSPACE_ID" \
        --arg tid "$TENANT_ID" \
        --arg sha "$DEPLOY_FULL_SHA" \
        --arg msg "$DEPLOY_MSG" \
        --arg time "$DEPLOY_TIME" \
        --arg uid "$USER_ID" \
        '{
          id: $id,
          workspace_id: $ws,
          tenant_id: $tid,
          event_type: "deploy_passed",
          git_commit_sha: $sha,
          git_branch: "main",
          git_message: $msg,
          status: "passed",
          trigger_source: "deploy_full_script",
          deployed_by: $uid,
          completed_at: $time,
          environment: "production"
        }'
    )
    curl -sS -X POST "${SUPABASE_URL}/rest/v1/build_deploy_events" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "$PAYLOAD"
  else
    curl -sS -X POST "${SUPABASE_URL}/rest/v1/build_deploy_events" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{
        \"id\":             \"${DEPLOY_ID}\",
        \"workspace_id\":   \"${WORKSPACE_ID}\",
        \"tenant_id\":      \"${TENANT_ID}\",
        \"event_type\":     \"deploy_passed\",
        \"git_commit_sha\": \"${DEPLOY_FULL_SHA}\",
        \"git_branch\":     \"main\",
        \"git_message\":    \"${DEPLOY_MSG_ESC}\",
        \"status\":         \"passed\",
        \"trigger_source\": \"deploy_full_script\",
        \"deployed_by\":    \"${USER_ID}\",
        \"completed_at\":   \"${DEPLOY_TIME}\",
        \"environment\":    \"production\"
      }"
  fi
  echo "[post-deploy] Supabase build_deploy_events inserted → agent_memory trigger chain fired"
fi

echo "[post-deploy] complete — ${DEPLOY_HASH}"
