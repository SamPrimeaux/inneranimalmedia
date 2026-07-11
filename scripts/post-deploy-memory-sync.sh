#!/usr/bin/env bash
# Post-deploy: structured D1 agentsam_memory deploy facts (no LLM, no vector embed).
# Called automatically from deploy-frontend.sh after every successful deploy:full.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$REPO_ROOT/.env.cloudflare" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi

echo "→ D1 agentsam_memory deploy facts (post-deploy-memory-sync)…"

if ! command -v node >/dev/null 2>&1; then
  echo "[post-deploy-memory-sync] node missing — skipping D1 memory write" >&2
  exit 0
fi

# Primary path: Node writer (with-cloudflare-env + wrangler.production.toml + safe SQL escaping)
if ! node "$REPO_ROOT/scripts/write-deploy-memory-fact.mjs"; then
  echo "[post-deploy-memory-sync] warning: deploy memory fact write failed (non-fatal)" >&2
fi

# ── Supabase agentsam.agentsam_deploy_events (optional; skip when deploy ledger owns the row) ──
# D1 workspace keys look like ws_inneranimalmedia; agentsam.agentsam_deploy_events.workspace_id is uuid.
D1_WORKSPACE_ID="${WORKSPACE_ID:-${1:-}}"
SUPABASE_WORKSPACE_UUID="${IAM_SUPABASE_WORKSPACE_ID:-${SUPABASE_WORKSPACE_UUID:-}}"
if [ -z "$SUPABASE_WORKSPACE_UUID" ]; then
  case "$D1_WORKSPACE_ID" in
    ws_inneranimalmedia) SUPABASE_WORKSPACE_UUID="fa1f12a8-c841-4b79-a26c-d53a78b17dac" ;;
  esac
fi
# Reject D1-style ids if they leaked into the uuid slot
case "$SUPABASE_WORKSPACE_UUID" in
  ws_*|'') SUPABASE_WORKSPACE_UUID="" ;;
esac

DEPLOY_FULL_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
DEPLOY_MSG="$(git -C "$REPO_ROOT" log -1 --pretty=%s 2>/dev/null || echo '')"
DEPLOY_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DEPLOY_MSG_ESC=$(printf '%s' "$DEPLOY_MSG" | sed "s/'/''/g")

SUPABASE_URL="${SUPABASE_URL:-https://dpmuvynqixblxsilnlut.supabase.co}"
for stale in tcczxkatmodtxfuulvsr sexdnwlyuhkyvseunqlx; do
  case "${SUPABASE_URL:-}" in
    *"${stale}"*)
      echo "[post-deploy-memory-sync] ⚠️  SUPABASE_URL contains stale ref ${stale}; using https://dpmuvynqixblxsilnlut.supabase.co" >&2
      SUPABASE_URL="https://dpmuvynqixblxsilnlut.supabase.co"
      break
      ;;
  esac
done
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [ -f "${REPO_ROOT}/.deploy-run-context.json" ]; then
  echo "[post-deploy-memory-sync] deploy ledger active — skipping duplicate agentsam_deploy_events POST"
elif [ -z "$SUPABASE_SERVICE_KEY" ] || [ -z "$SUPABASE_WORKSPACE_UUID" ]; then
  echo "[post-deploy-memory-sync] SUPABASE_SERVICE_ROLE_KEY or Supabase workspace UUID unset — skipping agentsam_deploy_events (D1 key=${D1_WORKSPACE_ID:-none})" >&2
else
  if command -v jq >/dev/null 2>&1; then
    PAYLOAD=$(
      jq -n \
        --arg ws "$SUPABASE_WORKSPACE_UUID" \
        --arg d1_ws "$D1_WORKSPACE_ID" \
        --arg sha "$DEPLOY_FULL_SHA" \
        --arg msg "$DEPLOY_MSG" \
        --arg time "$DEPLOY_TIME" \
        '{
          workspace_id: $ws,
          worker_name: "inneranimalmedia",
          worker_version: null,
          deploy_status: "success",
          commit_sha: $sha,
          notes: $msg,
          metadata: { sync_source: "post_deploy_memory_sync", git_branch: "main", d1_workspace_id: $d1_ws },
          created_at: $time
        }'
    )
    HTTP_CODE=$(curl -sS -o /tmp/iam-agentsam-deploy-events.out -w "%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/agentsam_deploy_events" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Accept-Profile: agentsam" \
      -H "Content-Profile: agentsam" \
      -H "Prefer: return=minimal" \
      -d "$PAYLOAD" || echo "000")
  else
    HTTP_CODE=$(curl -sS -o /tmp/iam-agentsam-deploy-events.out -w "%{http_code}" -X POST "${SUPABASE_URL}/rest/v1/agentsam_deploy_events" \
      -H "apikey: ${SUPABASE_SERVICE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Accept-Profile: agentsam" \
      -H "Content-Profile: agentsam" \
      -H "Prefer: return=minimal" \
      -d "{
        \"workspace_id\":   \"${SUPABASE_WORKSPACE_UUID}\",
        \"worker_name\":    \"inneranimalmedia\",
        \"worker_version\": null,
        \"deploy_status\":  \"success\",
        \"commit_sha\":     \"${DEPLOY_FULL_SHA}\",
        \"notes\":          \"${DEPLOY_MSG_ESC}\",
        \"metadata\":       {\"sync_source\":\"post_deploy_memory_sync\",\"git_branch\":\"main\",\"d1_workspace_id\":\"${D1_WORKSPACE_ID}\"},
        \"created_at\":     \"${DEPLOY_TIME}\"
      }" || echo "000")
  fi
  if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "[post-deploy-memory-sync] Supabase agentsam_deploy_events inserted (workspace_id=${SUPABASE_WORKSPACE_UUID})"
  else
    echo "[post-deploy-memory-sync] Supabase insert failed HTTP ${HTTP_CODE} (non-fatal): $(head -c 400 /tmp/iam-agentsam-deploy-events.out 2>/dev/null || true)" >&2
  fi
fi

DEPLOY_HASH="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "[post-deploy-memory-sync] complete — ${DEPLOY_HASH}"
