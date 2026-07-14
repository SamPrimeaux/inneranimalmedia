#!/usr/bin/env bash
# Insert one row into deployments so each deploy shows in Overview / deployment tracking.
# Sole writer in the repo for deployments INSERT.
# Callers:
#   - deploy-with-record.sh (blocking, after full timed deploy)
#   - deploy-fast.sh (fire-and-forget background — does not wait on D1)
# Run after: npm run deploy (or: wrangler deploy --config wrangler.production.toml).
# Loads .env.cloudflare if present so CLOUDFLARE_API_TOKEN is set for --remote. Run from repo root.
# Expects DEPLOY_SECONDS from environment (set by deploy-with-record.sh / deploy-fast.sh); uses 0 if unset.
#
# Set CLOUDFLARE_VERSION_ID (or WRANGLER_VERSION_ID) to the Wrangler "Current Version ID" when available
# so deployments.id matches the worker revision. If unset, a UUID is used.
#
# Agent documentation: When an agent runs the deploy, set TRIGGERED_BY=agent and optionally
# DEPLOYMENT_NOTES='brief description' so deployments.triggered_by / notes reflect the agent.
# Example: TRIGGERED_BY=agent DEPLOYMENT_NOTES='AI Gateway + R2 upload' npm run deploy
#
# Timestamp: uses deploy machine local wall clock (date), not D1 UTC datetime('now').
# Override: DEPLOY_TIMESTAMP='2026-03-24 21:36:00'
#
# DORA/spend attribution: TENANT_ID, WORKSPACE_ID, PROJECT_ID default to the IAM platform
# scope below. Override per-project (e.g. fuelnfreetime's own deploy pipeline) by exporting
# these before calling this script -- do not rely on the defaults outside this repo.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="$REPO_ROOT/wrangler.production.toml"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

VERSION_ID="${CLOUDFLARE_VERSION_ID:-${WRANGLER_VERSION_ID:-}}"
if [[ -z "$VERSION_ID" ]]; then
  VERSION_ID="$(uuidgen 2>/dev/null || echo "post-$(date +%s)")"
fi

DEPLOY_SECONDS="${DEPLOY_SECONDS:-0}"
if [[ ! "$DEPLOY_SECONDS" =~ ^[0-9]+$ ]]; then DEPLOY_SECONDS=0; fi

TRIGGERED_BY="${TRIGGERED_BY:-cli_post_deploy}"
DEPLOYMENT_NOTES="${DEPLOYMENT_NOTES:-}"
DEPLOY_VERSION="${DEPLOY_VERSION:-}"
GIT_HASH="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '')"
VERSION_SLUG="${DEPLOY_VERSION:-${GIT_HASH:-deploy-$(date +%s)}}"
DEPLOYED_BY="${DEPLOYED_BY:-sam_primeaux}"
DESCRIPTION="${DEPLOY_DESCRIPTION:-${DEPLOYMENT_NOTES:-Worker deploy (inneranimalmedia)}}"

# DORA/spend attribution scope -- defaults are this repo's own platform identity.
TENANT_ID="${TENANT_ID:-tenant_sam_primeaux}"
WORKSPACE_ID="${WORKSPACE_ID:-ws_inneranimalmedia}"
PROJECT_ID="${PROJECT_ID:-inneranimalmedia}"

# Escape single quotes for SQL: ' -> ''
VID_ESC="${VERSION_ID//\'/\'\'}"
VS_ESC="${VERSION_SLUG//\'/\'\'}"
GH_ESC="${GIT_HASH//\'/\'\'}"
DESC_ESC="${DESCRIPTION//\'/\'\'}"
DBY_ESC="${DEPLOYED_BY//\'/\'\'}"
TB_ESC="${TRIGGERED_BY//\'/\'\'}"
DN_ESC="${DEPLOYMENT_NOTES//\'/\'\'}"
TID_ESC="${TENANT_ID//\'/\'\'}"
WID_ESC="${WORKSPACE_ID//\'/\'\'}"
PID_ESC="${PROJECT_ID//\'/\'\'}"

DEPLOY_TIMESTAMP="${DEPLOY_TIMESTAMP:-$(date '+%Y-%m-%d %H:%M:%S')}"
TS_ESC="${DEPLOY_TIMESTAMP//\'/\'\'}"

# project_id is nullable -- emit SQL NULL rather than an empty string when unset.
if [[ -z "$PROJECT_ID" ]]; then
  PID_SQL="NULL"
else
  PID_SQL="'$PID_ESC'"
fi

echo "Recording deploy in D1 (deployments.id=$VERSION_ID, timestamp=$DEPLOY_TIMESTAMP local, deploy_time_seconds=$DEPLOY_SECONDS, triggered_by=$TRIGGERED_BY, tenant_id=$TENANT_ID, workspace_id=$WORKSPACE_ID, project_id=${PROJECT_ID:-<null>})"
npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "INSERT INTO deployments (id, timestamp, version, git_hash, description, status, deployed_by, environment, deploy_time_seconds, worker_name, triggered_by, notes, tenant_id, workspace_id, project_id) VALUES ('$VID_ESC', '$TS_ESC', '$VS_ESC', '$GH_ESC', '$DESC_ESC', 'success', '$DBY_ESC', 'production', $DEPLOY_SECONDS, 'inneranimalmedia', '$TB_ESC', '$DN_ESC', '$TID_ESC', '$WID_ESC', $PID_SQL)"
echo "Done. Overview / deployment tracking will show this deploy."

# Mirror to Supabase agentsam.agentsam_deploy_events (OS ledger). Non-fatal.
# Same sink as post-deploy Worker handler / midnight deployments rollup.
if [[ "${SKIP_SUPABASE_DEPLOY_EVENT:-0}" == "1" ]]; then
  echo "[post-deploy-record] SKIP_SUPABASE_DEPLOY_EVENT=1 — skipping agentsam_deploy_events"
else
  SUPABASE_URL="${SUPABASE_URL:-https://dpmuvynqixblxsilnlut.supabase.co}"
  SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
  SUPABASE_WORKSPACE_UUID="${IAM_SUPABASE_WORKSPACE_ID:-${SUPABASE_WORKSPACE_UUID:-}}"
  if [[ -z "$SUPABASE_WORKSPACE_UUID" ]]; then
    case "$WORKSPACE_ID" in
      ws_inneranimalmedia) SUPABASE_WORKSPACE_UUID="fa1f12a8-c841-4b79-a26c-d53a78b17dac" ;;
    esac
  fi
  case "$SUPABASE_WORKSPACE_UUID" in
    ws_*|'') SUPABASE_WORKSPACE_UUID="" ;;
  esac

  DEPLOY_FULL_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "$GIT_HASH")"
  DEPLOY_TIME_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if [[ -z "$SUPABASE_SERVICE_KEY" || -z "$SUPABASE_WORKSPACE_UUID" ]]; then
    echo "[post-deploy-record] SUPABASE_SERVICE_ROLE_KEY or workspace UUID unset — skipping agentsam_deploy_events" >&2
  elif command -v jq >/dev/null 2>&1; then
    PAYLOAD=$(
      jq -n \
        --arg ws "$SUPABASE_WORKSPACE_UUID" \
        --arg d1_ws "$WORKSPACE_ID" \
        --arg ver "$VERSION_ID" \
        --arg sha "$DEPLOY_FULL_SHA" \
        --arg notes "$DESCRIPTION" \
        --arg time "$DEPLOY_TIME_UTC" \
        --arg by "$TRIGGERED_BY" \
        --arg secs "$DEPLOY_SECONDS" \
        '{
          workspace_id: $ws,
          worker_name: "inneranimalmedia",
          worker_version: $ver,
          deploy_status: "success",
          commit_sha: $sha,
          notes: $notes,
          metadata: {
            sync_source: "post_deploy_record",
            d1_deployment_id: $ver,
            d1_workspace_id: $d1_ws,
            triggered_by: $by,
            deploy_time_seconds: ($secs | tonumber)
          },
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
    if [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "200" ]]; then
      echo "[post-deploy-record] Supabase agentsam_deploy_events ok (worker_version=$VERSION_ID)"
    else
      echo "[post-deploy-record] Supabase agentsam_deploy_events failed HTTP ${HTTP_CODE} (non-fatal): $(head -c 300 /tmp/iam-agentsam-deploy-events.out 2>/dev/null || true)" >&2
    fi
  else
    echo "[post-deploy-record] jq missing — skipping agentsam_deploy_events POST" >&2
  fi
fi
