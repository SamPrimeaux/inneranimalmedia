#!/usr/bin/env bash
set -e

DEPLOY_HASH=$(git rev-parse --short HEAD)
DEPLOY_FULL_SHA=$(git rev-parse HEAD)
DEPLOY_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DEPLOY_MSG=$(git log -1 --pretty=%s)

WORKSPACE_ID="${1:-ws_inneranimalmedia}"
TENANT_ID="${2:-tenant_sam_primeaux}"
USER_ID="${3:-usr_sam_iam}"

echo "[post-deploy] hash=$DEPLOY_HASH workspace=$WORKSPACE_ID"

# ── 1. D1 agentsam_memory ────────────────────────────────────────────────
npx wrangler d1 execute inneranimalmedia-business --remote --command "
INSERT OR REPLACE INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id,
  memory_type, key, value, source, confidence, tags
) VALUES (
  'mem_last_deploy_${WORKSPACE_ID}',
  '${TENANT_ID}', '${USER_ID}', '${WORKSPACE_ID}',
  'fact',
  'last_successful_deploy',
  json_object(
    'hash',        '${DEPLOY_HASH}',
    'full_sha',    '${DEPLOY_FULL_SHA}',
    'message',     '${DEPLOY_MSG}',
    'deployed_at', '${DEPLOY_TIME}',
    'branch',      'main',
    'workspace_id','${WORKSPACE_ID}'
  ),
  'post_deploy_hook', 1.0,
  '[\"deploy\",\"production\",\"state\"]'
);
"

# ── 2. D1 agentsam_project_context ───────────────────────────────────────
npx wrangler d1 execute inneranimalmedia-business --remote --command "
UPDATE agentsam_project_context SET
  last_cursor_session = '${DEPLOY_TIME}',
  notes = COALESCE(notes,'') || ' | deployed ${DEPLOY_HASH} at ${DEPLOY_TIME}',
  updated_at = unixepoch()
WHERE workspace_id = '${WORKSPACE_ID}' AND status = 'active';
"

# ── 3. Supabase build_deploy_events → triggers agent_memory auto-embed ───
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

if [ -z "$SUPABASE_SERVICE_KEY" ]; then
  echo "[post-deploy] SUPABASE_SERVICE_ROLE_KEY unset — skipping Supabase insert" >&2
else
  DEPLOY_ID="deploy_$(date +%s)"
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
      \"git_message\":    \"${DEPLOY_MSG}\",
      \"status\":         \"passed\",
      \"trigger_source\": \"deploy_full_script\",
      \"deployed_by\":    \"${USER_ID}\",
      \"completed_at\":   \"${DEPLOY_TIME}\",
      \"environment\":    \"production\"
    }"
  echo "[post-deploy] Supabase build_deploy_events inserted → agent_memory trigger chain fired"
fi

echo "[post-deploy] complete — ${DEPLOY_HASH}"
