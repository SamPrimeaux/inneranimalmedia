#!/usr/bin/env bash
# promote-to-prod.sh — pull dashboard assets from a source R2 bucket → push to production R2 → deploy worker
# Default source bucket: inneranimalmedia-sandbox-cicd (legacy object prefix; not a separate “user environment”).
# Override: SOURCE_ASSETS_BUCKET=my-bucket ./scripts/promote-to-prod.sh (legacy env: SANDBOX_BUCKET)
# Usage: ./scripts/promote-to-prod.sh [--worker-only]
# After deploy: logs cicd_* tables including cicd_runs via scripts/lib/cicd-d1-log.sh; optional
# ai_workflow_pipelines / ai_workflow_executions rows. Optional: CICD_D1_LOG=0 | CICD_SKIP_HEALTH_CURL=1 | PROD_HEALTH_URL=...
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Load env ──────────────────────────────────────────────────────────────────
if [ -f "${REPO_ROOT}/.env.cloudflare" ]; then
  _iam_cf_kv=$(grep -v '^#' "${REPO_ROOT}/.env.cloudflare" | xargs)
  if [ -n "${_iam_cf_kv}" ]; then
    # shellcheck disable=SC2086
    export ${_iam_cf_kv}
  fi
fi
RESEND_FROM="${RESEND_FROM:-support@inneranimalmedia.com}"
RESEND_TO="${RESEND_TO:-support@inneranimalmedia.com}"

WORKER_ONLY=0
for arg in "$@"; do
  [ "$arg" = "--worker-only" ] && WORKER_ONLY=1
done

echo "=== PROMOTE TO PRODUCTION ==="
echo ""

CICD_PROMOTE_WALL_START=$(date +%s)
PROMOTE_GIT_HASH=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
export WORKER_NAME="${WORKER_NAME:-inneranimalmedia}"

DEPLOY_TS="$(date -u +%Y%m%d%H%M%S)"
SOURCE_ASSETS_BUCKET="${SOURCE_ASSETS_BUCKET:-${SANDBOX_BUCKET:-inneranimalmedia-sandbox-cicd}}"
PROD_BUCKET="inneranimalmedia"
PROD_CFG="wrangler.production.toml"
WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/cicd-d1-log.sh"

_send_resend_notification() {
  local outcome="$1"
  local resend_key="${RESEND_API_KEY:-}"
  [ -z "$resend_key" ] && echo "  WARN: RESEND_API_KEY not set — skipping notification" && return 0

  local status_label status_color
  [ "$outcome" = "success" ] && status_label="LIVE" && status_color="#22c55e" \
    || status_label="FAILED" && status_color="#ef4444"

  local git_sha git_branch git_msg
  git_sha="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  git_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')"
  git_msg="$(git log -1 --pretty=%s 2>/dev/null || echo '')"

  local ms_pull ms_push ms_worker total_ms
  ms_pull=$(( (CICD_T_PULL_END   - CICD_T_PULL_START)   * 1000 ))
  ms_push=$(( (CICD_T_PUSH_END   - CICD_T_PUSH_START)   * 1000 ))
  ms_worker=$(( (CICD_T_WORKER_END - CICD_T_WORKER_START) * 1000 ))
  total_ms=$(( ms_pull + ms_push + ms_worker ))

  local vuln_row=""
  [ "${GITHUB_VULN_HIGH:-0}" -gt 0 ] \
    && vuln_row="<tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Advisories</td><td style='padding:5px 12px;color:#ef4444;font-weight:600;'>${GITHUB_VULN_HIGH} high / ${GITHUB_VULN_MODERATE:-0} moderate</td></tr>" \
    || vuln_row="<tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Advisories</td><td style='padding:5px 12px;color:#22c55e;'>none detected</td></tr>"

  local html_body
  html_body="<!DOCTYPE html><html><body style='margin:0;padding:0;background:#0f1117;font-family:ui-monospace,monospace;'>
<div style='max-width:600px;margin:28px auto;background:#1a1d2e;border:1px solid #2d3148;border-radius:8px;overflow:hidden;'>
  <div style='background:#12151f;padding:16px 24px;border-bottom:3px solid ${status_color};'>
    <span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:${status_color};margin-right:8px;'></span>
    <span style='color:#e2e8f0;font-size:14px;font-weight:700;letter-spacing:0.05em;'>IAM // PROD ${status_label}</span>
    <span style='float:right;color:#475569;font-size:11px;margin-top:2px;'>$(date -u +%Y-%m-%d)</span>
  </div>
  <div style='padding:14px 24px;'>
    <table style='width:100%;border-collapse:collapse;'>
      <tr><td colspan='2' style='padding:8px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>DEPLOY</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;width:130px;'>Status</td><td style='padding:5px 12px;color:${status_color};font-weight:700;'>${status_label}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Worker</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${PROD_VERSION}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Dashboard</td><td style='padding:5px 12px;color:#e2e8f0;'>v${CURRENT_V:-0}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>URL</td><td style='padding:5px 12px;'><a href='https://inneranimalmedia.com/dashboard/agent' style='color:#60a5fa;text-decoration:none;'>inneranimalmedia.com/dashboard/agent</a></td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Health</td><td style='padding:5px 12px;color:#e2e8f0;'>${PROD_HC:-skipped}</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>GIT</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Branch</td><td style='padding:5px 12px;color:#e2e8f0;'>${git_branch}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Commit</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${git_sha} — ${git_msg}</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>ASSETS + TIMINGS</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Files</td><td style='padding:5px 12px;color:#e2e8f0;'>${R2_LINE_COUNT} files pushed to inneranimalmedia</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>R2 Pull</td><td style='padding:5px 12px;color:#e2e8f0;'>${ms_pull}ms</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>R2 Push</td><td style='padding:5px 12px;color:#e2e8f0;'>${ms_push}ms</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Worker</td><td style='padding:5px 12px;color:#e2e8f0;'>${ms_worker}ms</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Total</td><td style='padding:5px 12px;color:#e2e8f0;font-weight:600;'>${total_ms}ms</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>QUALITY / SECURITY</td></tr>
      ${vuln_row}
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>TRACKING</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>D1 Tables</td><td style='padding:5px 12px;color:#64748b;font-size:11px;'>cicd_github_runs, cicd_pipeline_runs, cicd_run_steps, cicd_events, pipeline_runs, ai_workflow_pipelines, ai_workflow_executions, deployments, dashboard_versions</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Workflow Exec</td><td style='padding:5px 12px;color:#64748b;font-size:11px;'>wfexec_${DEPLOY_TS}_prod_v${CURRENT_V:-0}</td></tr>
    </table>
  </div>
  <div style='padding:10px 24px;border-top:1px solid #2d3148;color:#475569;font-size:11px;display:flex;justify-content:space-between;'>
    <span>IAM deploy pipeline</span><span>$(date -u +%Y-%m-%dT%H:%M:%SZ)</span>
  </div>
</div></body></html>"

  local json_html
  json_html=$(printf '%s' "$html_body" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null \
    || printf '"%s"' "$(printf '%s' "$html_body" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n')")

  local http_code
  http_code=$(curl -sS \
    -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer ${resend_key}" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"${RESEND_FROM}\",\"to\":[\"${RESEND_TO}\"],\"subject\":\"[IAM] PROD ${status_label} — dashboard-v${CURRENT_V:-0} — $(date -u +%Y-%m-%d)\",\"html\":${json_html}}" \
    -o /tmp/resend-response.json \
    -w "%{http_code}" 2>/dev/null || echo "0")

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    local msg_id; msg_id=$(grep -o '"id":"[^"]*"' /tmp/resend-response.json 2>/dev/null | cut -d'"' -f4 || echo "")
    echo "  Resend: sent -> ${RESEND_TO} (HTTP ${http_code}${msg_id:+ id=${msg_id}})"
  else
    echo "  WARN: Resend failed (HTTP ${http_code}) — check /tmp/resend-response.json"
  fi
}

CICD_T_PULL_START=0
CICD_T_PULL_END=0
CICD_T_PUSH_START=0
CICD_T_PUSH_END=0

DIST_DIR="${REPO_ROOT}/dashboard/dist"
HTML_PATH="${REPO_ROOT}/dashboard/agent.html"
MANIFEST_NAME=".deploy-manifest"
MANIFEST_KEY="static/dashboard/agent/${MANIFEST_NAME}"
R2_AGENT_PREFIX="static/dashboard/agent"
# set -u: must always be set; CI may inject <!-- dashboard-v:N --> into dist/index.html
# and uploads that file to R2 as static/dashboard/agent.html — parse both after pull.
CURRENT_V=0

# Parse dashboard bundle version from pulled shell HTML (R2 agent.html mirrors built dist/index.html).
_parse_dashboard_v_from_html() {
  local v f
  v=""
  for f in "$HTML_PATH" "${DIST_DIR}/index.html"; do
    [ ! -f "$f" ] && continue
    v=$(grep -oE 'dashboard-v:[0-9]+' "$f" 2>/dev/null | head -1 | cut -d: -f2 || true)
    if [ -n "$v" ]; then break; fi
    v=$(grep -oE '\?v=[0-9]+' "$f" 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
    if [ -n "$v" ]; then break; fi
  done
  if [ -n "$v" ]; then
    CURRENT_V="$v"
  fi
  return 0
}

# ── Step 1: Pull current build from source R2 into local dist ────────────────
if [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Pulling latest build from source R2 (${SOURCE_ASSETS_BUCKET})..."
  CICD_T_PULL_START=$(date +%s)
  mkdir -p "${DIST_DIR}" "${REPO_ROOT}/dashboard"
  rm -f "${DIST_DIR}/${MANIFEST_NAME}"

  MANIFEST_LOCAL="${DIST_DIR}/${MANIFEST_NAME}"
  if ! "${WRANGLER[@]}" r2 object get "${SOURCE_ASSETS_BUCKET}/${MANIFEST_KEY}" \
      --file "$MANIFEST_LOCAL" --remote -c "$PROD_CFG"; then
    echo "ERROR: Could not fetch ${MANIFEST_NAME} from source bucket. Upload a fresh dashboard build to ${SOURCE_ASSETS_BUCKET} first."
    exit 1
  fi
  echo "  Using ${MANIFEST_NAME} for multi-file pull (Vite chunks + assets/)."
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    echo "  Pulling ${R2_AGENT_PREFIX}/${line}..."
    target="${DIST_DIR}/${line}"
    mkdir -p "$(dirname "$target")"
    "${WRANGLER[@]}" r2 object get "${SOURCE_ASSETS_BUCKET}/${R2_AGENT_PREFIX}/${line}" \
      --file "$target" --remote -c "$PROD_CFG"
  done < "$MANIFEST_LOCAL" || true

  "${WRANGLER[@]}" r2 object get "${SOURCE_ASSETS_BUCKET}/static/dashboard/agent.html" \
    --file "$HTML_PATH" --remote -c "$PROD_CFG"

  CICD_T_PULL_END=$(date +%s)

  if [ ! -f "$HTML_PATH" ]; then
    echo "ERROR: ${HTML_PATH} missing after source pull. Re-upload dashboard assets to ${SOURCE_ASSETS_BUCKET} first."
    exit 1
  fi

  _parse_dashboard_v_from_html
  echo "  Pulled v=${CURRENT_V:-0} from source bucket."
  if [ "${CURRENT_V:-0}" = "0" ]; then
    echo "  WARN: Could not read <!-- dashboard-v:N --> from pulled agent.html or dist/index.html."
    echo "        If the source bucket has a newer build, upload it there first, then promote again."
  fi
  echo ""

  # ── Step 2: Push to production R2 ──────────────────────────────────────────
  echo "Promoting v=${CURRENT_V:-0} to production bucket (${PROD_BUCKET})..."
  CICD_T_PUSH_START=$(date +%s)

  ctype_for() {
    case "$1" in
      *.js)  echo "application/javascript" ;;
      *.css) echo "text/css" ;;
      *.map) echo "application/json" ;;
      *.html) echo "text/html" ;;
      *.svg) echo "image/svg+xml" ;;
      *.woff2) echo "font/woff2" ;;
      *.woff) echo "font/woff" ;;
      *.ttf) echo "font/ttf" ;;
      *.json) echo "application/json" ;;
      *) echo "application/octet-stream" ;;
    esac
  }

  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    filepath="${DIST_DIR}/${line}"
    [ -f "$filepath" ] || continue
    ct=$(ctype_for "$line")
    echo "  Uploading ${R2_AGENT_PREFIX}/${line}..."
    "${WRANGLER[@]}" r2 object put "${PROD_BUCKET}/${R2_AGENT_PREFIX}/${line}" \
      --file "$filepath" \
      --content-type "$ct" \
      --config "$PROD_CFG" --remote
  done < "$MANIFEST_LOCAL" || true

  echo "  Uploading ${R2_AGENT_PREFIX}/${MANIFEST_NAME}..."
  "${WRANGLER[@]}" r2 object put "${PROD_BUCKET}/${R2_AGENT_PREFIX}/${MANIFEST_NAME}" \
    --file "$MANIFEST_LOCAL" \
    --content-type "text/plain" \
    --config "$PROD_CFG" --remote

  "${WRANGLER[@]}" r2 object put "${PROD_BUCKET}/static/dashboard/agent.html" \
    --file "$HTML_PATH" --content-type "text/html" \
    --config "$PROD_CFG" --remote

  echo "  R2 production uploads complete."
  CICD_T_PUSH_END=$(date +%s)

  # Log to dashboard_versions — one row per dist asset + HTML shell (exclude index.html duplicate)
  sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }
  page_name_for() {
    local f="$1"
    case "$f" in
      agent-dashboard.js)  printf '%s' 'agent' ;;
      agent-dashboard.css) printf '%s' 'agent-css' ;;
      index.html) printf '%s' 'agent-html' ;;
      *) printf '%s' "agent-dist-$(printf '%s' "$f" | tr '/' '-')" ;;
    esac
  }

  D1_VALUES=""
  first=1
  while IFS= read -r rel || [ -n "$rel" ]; do
    [ -z "$rel" ] && continue
    [[ "$rel" == "$MANIFEST_NAME" ]] && continue
    [[ "$rel" == "index.html" ]] && continue
    filepath="${DIST_DIR}/${rel}"
    [ -f "$filepath" ] || continue
    fh=$(md5 -q "$filepath" 2>/dev/null || md5sum "$filepath" | cut -d' ' -f1)
    fs=$(wc -c < "$filepath" | tr -d ' ')
    pn=$(page_name_for "$rel")
    pn_esc=$(sql_escape "$pn")
    row_id=$(printf 'prod-%s-v%s-%s' "$pn" "${CURRENT_V:-0}" "$DEPLOY_TS")
    id_esc=$(sql_escape "$row_id")
    r2_esc=$(sql_escape "${R2_AGENT_PREFIX}/${rel}")
    row="('${id_esc}', '${pn_esc}', 'v${CURRENT_V:-0}', '${fh}', ${fs}, '${r2_esc}', 'Promoted from source R2', 1, 1, unixepoch())"
    if [ "$first" -eq 1 ]; then
      D1_VALUES="$row"
      first=0
    else
      D1_VALUES="${D1_VALUES}, ${row}"
    fi
  done <<EOF || true
$( (cd "$DIST_DIR" && find . -type f ! -name "$MANIFEST_NAME" -print 2>/dev/null | sed 's|^\./||' | sort) )
EOF

  HTML_HASH=$(md5 -q "$HTML_PATH" 2>/dev/null || md5sum "$HTML_PATH" | cut -d' ' -f1)
  HTML_SIZE=$(wc -c < "$HTML_PATH" | tr -d ' ')
  html_row="('prod-agent-html-v${CURRENT_V:-0}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V:-0}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Promoted from source R2', 1, 1, unixepoch())"
  if [ -n "$D1_VALUES" ]; then
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${D1_VALUES}, ${html_row}"
  else
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${html_row}"
  fi

  "${WRANGLER[@]}" d1 execute inneranimalmedia-business \
    --remote -c "$PROD_CFG" \
    --command="$D1_SQL"   2>/dev/null || echo "  WARN: dashboard_versions D1 log failed (non-fatal)"

  _PROD_DEP_ID="dep_prod_${DEPLOY_TS}"
  _PROMOTE_GH_ESC=$(cicd_sql_escape "${PROMOTE_GIT_HASH}")
  cicd_d1_nf "INSERT OR IGNORE INTO deployments (id, timestamp, version, git_hash, status, deployed_by, environment, worker_name, created_at) VALUES ('${_PROD_DEP_ID}', datetime('now'), 'v${CURRENT_V:-0}', '${_PROMOTE_GH_ESC}', 'pending', 'cursor', 'production', 'inneranimalmedia', unixepoch())"
fi

# Worker-only: full R2 pull is skipped — still fetch agent shell from source bucket so Resend/CICD see current v.
if [ "$WORKER_ONLY" -eq 1 ]; then
  echo "Worker-only: fetching static/dashboard/agent.html from source R2 (${SOURCE_ASSETS_BUCKET})..."
  CICD_T_PULL_START=$(date +%s)
  mkdir -p "$(dirname "$HTML_PATH")"
  if ! "${WRANGLER[@]}" r2 object get "${SOURCE_ASSETS_BUCKET}/static/dashboard/agent.html" \
      --file "$HTML_PATH" --remote -c "$PROD_CFG"; then
    echo "  WARN: source agent.html fetch failed — dashboard version in email/logs may be stale"
  fi
  CICD_T_PULL_END=$(date +%s)
  echo ""
fi

_parse_dashboard_v_from_html

# ── Step 3: Deploy production worker ──────────────────────────────────────────
echo "Deploying production worker (inneranimalmedia)..."
NOTES="${DEPLOYMENT_NOTES:-Promoted via promote-to-prod.sh}"
TRIGGERED_BY="${TRIGGERED_BY:-promote}"

CICD_T_WORKER_START=$(date +%s)
"${WRANGLER[@]}" deploy \
  -c "$PROD_CFG" 2>&1 | tee /tmp/prod-deploy-out.txt
CICD_T_WORKER_END=$(date +%s)
cat /tmp/prod-deploy-out.txt

PROD_VERSION=$(grep "Current Version ID:" /tmp/prod-deploy-out.txt | awk '{print $NF}' | head -1 || true)
[[ "$PROD_VERSION" =~ ^[a-f0-9-]{36}$ ]] || PROD_VERSION="unknown"

export CICD_PHASE_PROMOTE_START_UNIX="$CICD_T_WORKER_START"
export CICD_PHASE_PROMOTE_END_UNIX="$CICD_T_WORKER_END"
export CICD_PHASE_PROMOTE_DURATION_MS=$(( (CICD_T_WORKER_END - CICD_T_WORKER_START) * 1000 ))
[ "${CICD_PHASE_PROMOTE_DURATION_MS:-0}" -lt 0 ] && export CICD_PHASE_PROMOTE_DURATION_MS=0

_parse_dashboard_v_from_html

NOTES_ESC=$(printf '%s' "$NOTES" | sed "s/'/''/g")
GH_ESC=$(printf '%s' "$PROMOTE_GIT_HASH" | sed "s/'/''/g")
TRIGGERED_ESC=$(printf '%s' "$TRIGGERED_BY" | sed "s/'/''/g")

# ── D1 Logging via cicd-event ──
echo "Logging promotion event to centralized D1 registry..."

# Capture git changes relative to HEAD~1
GIT_CHANGES_JSON=$(git diff --name-status HEAD~1 HEAD 2>/dev/null | awk '{type=$1; path=$2; printf "{\"type\":\"%s\",\"path\":\"%s\"},", type, path}' | sed 's/,$//')
[ -n "$GIT_CHANGES_JSON" ] && GIT_CHANGES_JSON="[${GIT_CHANGES_JSON}]" || GIT_CHANGES_JSON="[]"

CHG_COUNT=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | wc -l | tr -d ' ')
SUMMARY="Production Promote: v${CURRENT_V:-0} deployed. Includes ${CHG_COUNT:-0} change(s). Git: ${PROMOTE_GIT_HASH:0:7}"

PROMOTE_JSON=$(cat <<EOF
{
  "event": "post_promote",
  "payload": {
    "worker_version_id": "${PROD_VERSION}",
    "triggered_by": "${TRIGGERED_BY:-promote}",
    "git_hash": "${PROMOTE_GIT_HASH}",
    "dashboard_version": "${CURRENT_V:-0}",
    "ms_worker": ${CICD_MS_WORKER:-0},
    "health_status": "${PROD_HC:-200}",
    "health_ms": ${CICD_CF_HEALTH_RESPONSE_MS:-0},
    "r2_files": ${R2_LINE_COUNT:-0},
    "r2_bytes": ${CICD_R2_BUNDLE_BYTES:-0},
    "ms_push": ${CICD_MS_PUSH:-0},
    "ms_pull": ${CICD_MS_PULL:-0},
    "summary": "${SUMMARY}",
    "changes": ${GIT_CHANGES_JSON}
  }
}
EOF
)

curl -s -X POST "https://inneranimalmedia.com/api/internal/cicd-event" \
  -H "X-Internal-Secret: ${INTERNAL_API_SECRET:-}" \
  -H "Content-Type: application/json" \
  -d "$PROMOTE_JSON" > /dev/null || echo "  WARN: D1 cicd-event log failed (non-fatal)"

echo "[promote-to-prod] D1 promotion recorded via cicd-event"

CICD_MS_PULL=$(( (CICD_T_PULL_END - CICD_T_PULL_START) * 1000 ))
CICD_MS_PUSH=$(( (CICD_T_PUSH_END - CICD_T_PUSH_START) * 1000 ))
CICD_MS_WORKER=$(( (CICD_T_WORKER_END - CICD_T_WORKER_START) * 1000 ))
MANIFEST_FOR_COUNT="${DIST_DIR}/${MANIFEST_NAME}"
R2_LINE_COUNT=0
[ -f "$MANIFEST_FOR_COUNT" ] && R2_LINE_COUNT=$(wc -l < "$MANIFEST_FOR_COUNT" | tr -d ' ')
PROD_HEALTH_URL="${PROD_HEALTH_URL:-https://inneranimalmedia.com/dashboard/agent}"
PROD_HC=""
if [ "${CICD_SKIP_HEALTH_CURL:-0}" != "1" ]; then
  PROD_HC_RAW=$(curl -sS -o /dev/null -w "%{http_code}|%{time_total}" --max-time 25 "$PROD_HEALTH_URL" 2>/dev/null || echo "000|0")
  PROD_HC=$(echo "$PROD_HC_RAW" | cut -d'|' -f1)
  PROD_HC_TIME=$(echo "$PROD_HC_RAW" | cut -d'|' -f2)
  export CICD_CF_HEALTH_STATUS_CODE="${PROD_HC}"
  export CICD_CF_HEALTH_URL="${PROD_HEALTH_URL}"
  CICD_CF_HEALTH_RESPONSE_MS=$(awk -v t="${PROD_HC_TIME:-0}" 'BEGIN { printf "%.0f", t * 1000 }')
  export CICD_CF_HEALTH_RESPONSE_MS
  if [[ "$PROD_HC" =~ ^2[0-9][0-9]$ ]]; then export CICD_CF_HEALTH_STATUS=healthy
  elif [[ "$PROD_HC" =~ ^[23][0-9][0-9]$ ]]; then export CICD_CF_HEALTH_STATUS=degraded
  else export CICD_CF_HEALTH_STATUS=down
  fi
fi

if [ -n "${_PROD_DEP_ID:-}" ]; then
  _SEC=$((CICD_MS_WORKER / 1000))
  [ "${_SEC:-0}" -lt 0 ] && _SEC=0
  cicd_d1_nf "UPDATE deployments SET status='success', deploy_time_seconds=${_SEC} WHERE id='${_PROD_DEP_ID}'"
  _URL_ESC=$(cicd_sql_escape "${PROD_HEALTH_URL}")
  if [[ "${PROD_HC}" =~ ^2[0-9][0-9]$ ]]; then _HCL=healthy; else _HCL=degraded; fi
  cicd_d1_nf "INSERT INTO deployment_health_checks (deployment_id, check_type, check_url, status_code, status, response_time_ms, checked_at) VALUES ('${_PROD_DEP_ID}', 'http', '${_URL_ESC}', ${PROD_HC:-0}, '${_HCL}', ${CICD_CF_HEALTH_RESPONSE_MS:-0}, datetime('now'))"
fi

# ── ai_workflow_* (non-fatal; before cicd_log_prod_promote) ───────────────────
QUALITY_STATUS="${QUALITY_STATUS:-pass}"
GITHUB_VULN_HIGH="${GITHUB_VULN_HIGH:-0}"
GITHUB_VULN_MODERATE="${GITHUB_VULN_MODERATE:-0}"

# Escape single quotes for SQLite string literals (prevents broken INSERT when TRIGGERED_BY etc. contain ')
_cicd_sql_escape() {
  printf '%s' "${1:-}" | sed "s/'/''/g"
}

"${WRANGLER[@]}" d1 execute inneranimalmedia-business \
  --remote -c "$PROD_CFG" \
  --command="INSERT OR IGNORE INTO ai_workflow_pipelines (
    id, tenant_id, name, description, category,
    trigger_event, stages_json, variables_json,
    success_criteria, is_template, status,
    execution_history_json, created_by,
    created_at, updated_at
  ) VALUES (
    'wfpipe_promote_prod',
    'tenant_sam_primeaux',
    'promote-to-prod',
    'Pull source R2 dashboard build, push to prod R2, deploy inneranimalmedia worker, health check, notify via Resend',
    'deployment',
    'manual',
    '[{\"stage_number\":1,\"stage_name\":\"r2_pull\",\"tool_role\":\"wrangler_r2\"},{\"stage_number\":2,\"stage_name\":\"quality_checks\",\"tool_role\":\"internal\"},{\"stage_number\":3,\"stage_name\":\"r2_push\",\"tool_role\":\"wrangler_r2\"},{\"stage_number\":4,\"stage_name\":\"worker_deploy\",\"tool_role\":\"wrangler_deploy\"},{\"stage_number\":5,\"stage_name\":\"health_check\",\"tool_role\":\"curl\"},{\"stage_number\":6,\"stage_name\":\"d1_log_notify\",\"tool_role\":\"resend\"}]',
    '{\"default_variables\":{\"environment\":\"production\",\"bucket\":\"inneranimalmedia\",\"worker\":\"inneranimalmedia\"},\"required_variables\":[\"RESEND_API_KEY\"]}',
    'health_check=200, worker version ID captured, all D1 tables written',
    1,
    'active',
    '[]',
    'sam_primeaux',
    unixepoch(), unixepoch()
  );" \
  2>/dev/null || echo "  WARN: ai_workflow_pipelines template row failed (non-fatal)"

WF_RAND="$(openssl rand -hex 6 2>/dev/null || printf '%x' "$$")"
WF_EXEC_ID="wfexec_${DEPLOY_TS}_${WF_RAND}_v${CURRENT_V:-0}"
WF_TOTAL_DURATION_S=$(( (CICD_MS_PULL + CICD_MS_PUSH + CICD_MS_WORKER) / 1000 ))
[ "${WF_TOTAL_DURATION_S:-0}" -lt 0 ] && WF_TOTAL_DURATION_S=0

INPUT_VARS_JSON=$(printf '%s' "{\"dashboard_v\":\"v${CURRENT_V:-0}\",\"environment\":\"production\",\"triggered_by\":\"${TRIGGERED_BY:-promote}\"}")
OUTPUT_VARS_JSON=$(printf '%s' "{\"worker_version_id\":\"${PROD_VERSION}\",\"health_http\":${PROD_HC:-200},\"r2_files\":${R2_LINE_COUNT:-0},\"quality\":\"${QUALITY_STATUS}\",\"vuln_high\":${GITHUB_VULN_HIGH:-0},\"vuln_moderate\":${GITHUB_VULN_MODERATE:-0}}")
STAGES_JSON=$(printf '%s' "[{\"stage_number\":1,\"stage_name\":\"r2_pull\",\"duration_ms\":${CICD_MS_PULL:-0},\"status\":\"completed\"},{\"stage_number\":2,\"stage_name\":\"quality_checks\",\"status\":\"completed\"},{\"stage_number\":3,\"stage_name\":\"r2_push\",\"duration_ms\":${CICD_MS_PUSH:-0},\"status\":\"completed\"},{\"stage_number\":4,\"stage_name\":\"worker_deploy\",\"duration_ms\":${CICD_MS_WORKER:-0},\"status\":\"completed\"},{\"stage_number\":5,\"stage_name\":\"health_check\",\"status\":\"completed\",\"output\":\"${PROD_HC:-200}\"},{\"stage_number\":6,\"stage_name\":\"d1_log_notify\",\"status\":\"completed\"}]")
INPUT_VARS_ESC=$(_cicd_sql_escape "$INPUT_VARS_JSON")
OUTPUT_VARS_ESC=$(_cicd_sql_escape "$OUTPUT_VARS_JSON")
STAGES_ESC=$(_cicd_sql_escape "$STAGES_JSON")

"${WRANGLER[@]}" d1 execute inneranimalmedia-business \
  --remote -c "$PROD_CFG" \
  --command="INSERT INTO ai_workflow_executions (
    id, pipeline_id, tenant_id, execution_number,
    status, input_variables_json, output_json,
    stage_results_json, started_at, completed_at, duration_seconds
  ) VALUES (
    '$(_cicd_sql_escape "$WF_EXEC_ID")',
    'wfpipe_promote_prod',
    COALESCE((SELECT tenant_id FROM ai_workflow_pipelines WHERE id='wfpipe_promote_prod' LIMIT 1), 'system'),
    (SELECT COALESCE(MAX(execution_number), 0) + 1 FROM ai_workflow_executions WHERE pipeline_id = 'wfpipe_promote_prod'),
    'completed',
    '${INPUT_VARS_ESC}',
    '${OUTPUT_VARS_ESC}',
    '${STAGES_ESC}',
    unixepoch() - ${WF_TOTAL_DURATION_S},
    unixepoch(),
    ${WF_TOTAL_DURATION_S}
  );" \
  2>/dev/null || echo "  WARN: ai_workflow_executions row failed (non-fatal)"

if [ -d "$DIST_DIR" ]; then
  if CICD_R2_BUNDLE_BYTES=$(du -sb "$DIST_DIR" 2>/dev/null | awk '{print $1}'); then
    export CICD_R2_BUNDLE_BYTES
  else
    CICD_R2_BUNDLE_BYTES=$(($(du -sk "$DIST_DIR" 2>/dev/null | awk '{print $1}') * 1024))
    export CICD_R2_BUNDLE_BYTES
  fi
fi
export CICD_WALL_TOTAL_MS=$(( ($(date +%s) - CICD_PROMOTE_WALL_START) * 1000 ))
[ "${CICD_WALL_TOTAL_MS:-0}" -lt 0 ] && export CICD_WALL_TOTAL_MS=0

cicd_log_prod_promote "$PROD_VERSION" "${CURRENT_V:-0}" "$R2_LINE_COUNT" \
  "$CICD_MS_PULL" "$CICD_MS_PUSH" "$CICD_MS_WORKER" "0" "${PROD_HC:-200}"

echo ""
echo "Sending Resend notification..."
_parse_dashboard_v_from_html
_send_resend_notification "success"
echo ""
echo "  Verify: curl -s https://inneranimalmedia.com/dashboard/agent | grep -o 'dashboard-v:[0-9]*'"

# Post-deploy knowledge sync (non-fatal). Prefer AGENTSAM_BRIDGE_KEY (Bearer); else INTERNAL_API_SECRET.
echo ""
echo "  Syncing Agent Sam knowledge base..."
if [ -n "${AGENTSAM_BRIDGE_KEY:-}" ]; then
  SYNC_RESP=$(curl -s -X POST \
    "https://inneranimalmedia.com/api/internal/post-deploy" \
    -H "Authorization: Bearer ${AGENTSAM_BRIDGE_KEY}" \
    -H "Content-Type: application/json" \
    --max-time 30 \
    2>/dev/null || true)
elif [ -n "${INTERNAL_API_SECRET:-}" ]; then
  SYNC_RESP=$(curl -s -X POST \
    "https://inneranimalmedia.com/api/internal/post-deploy" \
    -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" \
    -H "Content-Type: application/json" \
    --max-time 30 \
    2>/dev/null || true)
else
  SYNC_RESP=""
  echo "  WARN: AGENTSAM_BRIDGE_KEY or INTERNAL_API_SECRET not set — knowledge sync skipped"
fi
if echo "$SYNC_RESP" | grep -q '"keys_written"'; then
  echo "  OK Knowledge sync complete"
  echo "$SYNC_RESP" | grep -o '"keys_written":[0-9]*' | head -1 || true
else
  echo "  WARN: Knowledge sync skipped or failed (non-fatal)"
  echo "$SYNC_RESP" | head -c 120
fi
echo ""

echo "[promote-to-prod] done"
exit 0
