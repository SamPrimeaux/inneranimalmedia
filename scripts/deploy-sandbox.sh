#!/usr/bin/env bash
# deploy-sandbox.sh — build + upload to sandbox R2 + deploy inneranimal-dashboard
# Sandbox bucket: agent-sam-sandbox-cicd
# Usage: ./scripts/deploy-sandbox.sh [--skip-build] [--worker-only]
# Env overrides: SANDBOX_BUCKET | CICD_D1_LOG=0 | CICD_SKIP_HEALTH_CURL=1 | CICD_SKIP_RESEND=1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Args ──────────────────────────────────────────────────────────────────────
SKIP_BUILD=0
WORKER_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-build)  SKIP_BUILD=1 ;;
    --worker-only) WORKER_ONLY=1 ;;
  esac
done

# ── Env ───────────────────────────────────────────────────────────────────────
if [ -f "./scripts/with-cloudflare-env.sh" ] && [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  source <(grep -v '^#' .env.cloudflare 2>/dev/null | grep -v '^\s*$' | sed 's/^/export /' || true)
fi
if [ -f "${REPO_ROOT}/.env.cloudflare" ]; then
  _kv=$(grep -E '^(RESEND_API_KEY|RESEND_FROM|RESEND_TO|INTERNAL_API_SECRET)=' \
    "${REPO_ROOT}/.env.cloudflare" | grep -v '^#' | xargs || true)
  [ -n "${_kv}" ] && export ${_kv}
fi
RESEND_FROM="${RESEND_FROM:-support@inneranimalmedia.com}"
RESEND_TO="${RESEND_TO:-support@inneranimalmedia.com}"

# INTERNAL_API_SECRET must be in .env.cloudflare for cicd-event + knowledge sync to work.
# It is NOT auto-loaded from wrangler secrets (those are write-only via wrangler secret put).
# If missing: add INTERNAL_API_SECRET=<your-value> to .env.cloudflare.
if [ -z "${INTERNAL_API_SECRET:-}" ]; then
  echo "  WARN: INTERNAL_API_SECRET not set locally — cicd-event and knowledge sync will return 401."
  echo "  Fix: add INTERNAL_API_SECRET=<value> to .env.cloudflare (same value as set via wrangler secret put)"
fi

# ── Constants ─────────────────────────────────────────────────────────────────
CFG="wrangler.jsonc"
PROD_CFG="wrangler.production.toml"
SANDBOX_BUCKET="${SANDBOX_BUCKET:-agent-sam-sandbox-cicd}"
WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)
DIST_DIR="${REPO_ROOT}/dashboard/dist"
MANIFEST_NAME=".deploy-manifest"
MANIFEST_PATH="${DIST_DIR}/${MANIFEST_NAME}"
VER_FILE="${REPO_ROOT}/dashboard/.sandbox-deploy-version"
R2_AGENT_PREFIX="static/dashboard/agent"
DEPLOY_TS="$(date -u +%Y%m%d%H%M%S)"
SANDBOX_HEALTH_URL="${SANDBOX_HEALTH_URL:-https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent}"

# ── Timers (all initialized here — used throughout, calculated at end) ────────
CICD_SB_DEPLOY_START_UNIX=$(date +%s)
CICD_T_BUILD_START=0; CICD_T_BUILD_END=0
CICD_T_R2_START=0;    CICD_T_R2_END=0
CICD_T_WORKER_START=0; CICD_T_WORKER_END=0
# BUG FIX: ms vars initialized here so cicd-event payload has correct values.
# Previous script calculated these AFTER the curl POST, so payload always showed 0ms.
CICD_MS_BUILD=0; CICD_MS_R2=0; CICD_MS_WORKER=0

export WORKER_NAME="${WORKER_NAME:-inneranimal-dashboard}"
SANDBOX_GIT_HASH=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
export CICD_PHASE_SANDBOX_START_UNIX="$CICD_SB_DEPLOY_START_UNIX"

# BUG FIX: CURRENT_V and NEXT_V initialized at top level — previous script defined
# NEXT_V inside the build if-block and CURRENT_V inside the worker-only if-block,
# causing both to be unset when used in cicd-event JSON later.
CURRENT_V=$(cat "$VER_FILE" 2>/dev/null || echo "0")
NEXT_V=$((CURRENT_V + 1))

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/cicd-d1-log.sh"

# ── Helpers ───────────────────────────────────────────────────────────────────
fmt_ms() {
  local ms=${1:-0}
  if   [ "$ms" -ge 60000 ]; then printf '%dm %ds' $((ms/60000)) $(((ms%60000)/1000))
  elif [ "$ms" -ge 1000  ]; then printf '%ds' $((ms/1000))
  else printf '%dms' "$ms"
  fi
}

ctype_for() {
  case "$1" in
    *.js)    echo "application/javascript" ;;
    *.css)   echo "text/css" ;;
    *.map)   echo "application/json" ;;
    *.html)  echo "text/html" ;;
    *.svg)   echo "image/svg+xml" ;;
    *.woff2) echo "font/woff2" ;;
    *.woff)  echo "font/woff" ;;
    *.ttf)   echo "font/ttf" ;;
    *.json)  echo "application/json" ;;
    *)       echo "application/octet-stream" ;;
  esac
}

page_name_for() {
  case "$1" in
    agent-dashboard.js)  printf 'agent' ;;
    agent-dashboard.css) printf 'agent-css' ;;
    index.html)          printf 'agent-html' ;;
    *) printf 'agent-dist-%s' "$(printf '%s' "$1" | tr '/' '-')" ;;
  esac
}

sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

# ── R2 prune: manifest diff delete ───────────────────────────────────────────
# BUG FIX: Previous script had a placeholder comment and reported "Cleaned up 0 stale
# objects" without doing anything. This function actually prunes. It paginates wrangler
# r2 object list (which caps at 1000/page) and deletes keys not in the current manifest.
_r2_prune_sandbox() {
  local bucket="$1"
  local prefix="$2"
  local manifest="$3"
  echo "  Pruning stale objects from ${bucket}/${prefix}..."

  local live_keys_file="/tmp/r2-live-keys-${DEPLOY_TS}.txt"
  local expected_keys_file="/tmp/r2-expected-keys-${DEPLOY_TS}.txt"
  local stale_keys_file="/tmp/r2-stale-keys-${DEPLOY_TS}.txt"
  : > "$live_keys_file"

  # Paginated list — wrangler caps at 1000 objects per call
  local cursor=""
  local page_json
  while true; do
    if [ -n "$cursor" ]; then
      page_json=$("${WRANGLER[@]}" r2 object list "${bucket}" \
        --prefix "${prefix}/" --cursor "$cursor" \
        --remote -c "$PROD_CFG" 2>/dev/null || echo '{}')
    else
      page_json=$("${WRANGLER[@]}" r2 object list "${bucket}" \
        --prefix "${prefix}/" \
        --remote -c "$PROD_CFG" 2>/dev/null || echo '{}')
    fi
    echo "$page_json" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  objs = d.get('objects', d.get('keys', d.get('result', [])))
  if isinstance(objs, list):
    for o in objs:
      k = o.get('key', o.get('name', ''))
      if k: print(k)
except: pass
" >> "$live_keys_file" 2>/dev/null || true
    cursor=$(echo "$page_json" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print(d.get('cursor', d.get('truncated_cursor', '')))
except: pass
" 2>/dev/null | tail -1 || true)
    [ -z "$cursor" ] && break
  done

  # Always keep: manifest file + agent.html + workspace shell + shell.css
  sed "s|^|${prefix}/|" "$manifest" > "$expected_keys_file"
  echo "${prefix}/${MANIFEST_NAME}"                  >> "$expected_keys_file"
  echo "static/dashboard/agent.html"                 >> "$expected_keys_file"
  echo "static/dashboard/iam-workspace-shell.html"   >> "$expected_keys_file"
  echo "static/dashboard/shell.css"                  >> "$expected_keys_file"

  comm -23 <(sort "$live_keys_file") <(sort "$expected_keys_file") > "$stale_keys_file"

  local stale_count objects_before objects_after
  objects_before=$(wc -l < "$live_keys_file" | tr -d ' ')
  stale_count=$(wc -l < "$stale_keys_file" | tr -d ' ')
  echo "  Found ${stale_count} stale objects to prune (${objects_before} live)."

  if [ "$stale_count" -gt 0 ]; then
    while IFS= read -r key; do
      [ -z "$key" ] && continue
      "${WRANGLER[@]}" r2 object delete "${bucket}/${key}" \
        --remote -c "$PROD_CFG" 2>/dev/null \
        && echo "    Deleted: ${key}" || echo "    WARN: failed to delete ${key}"
    done < "$stale_keys_file"
  fi

  objects_after=$((objects_before - stale_count))
  export CICD_R2_OBJECTS_BEFORE="$objects_before"
  export CICD_R2_OBJECTS_AFTER="$objects_after"
  export CICD_R2_PRUNED="$stale_count"
  echo "  Prune complete: ${objects_before} → ${objects_after} objects (${stale_count} deleted)."

  # Write to project_storage
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business \
    --remote -c "$PROD_CFG" \
    --command="INSERT OR REPLACE INTO project_storage (
      id, storage_id, storage_name, storage_type, storage_url,
      tenant_id, status, metadata_json, created_at, updated_at
    ) VALUES (
      'r2-sb-snapshot-${DEPLOY_TS}',
      '${bucket}',
      'Sandbox CICD Bucket',
      'r2',
      'https://dash.cloudflare.com/r2/${bucket}',
      'tenant_sam_primeaux',
      'active',
      '{\"objects_before\":${objects_before},\"objects_after\":${objects_after},\"pruned\":${stale_count},\"deploy_version\":\"v${NEXT_V}\",\"manifest_files\":${R2_LINE_COUNT:-0}}',
      unixepoch(), unixepoch()
    )" 2>/dev/null || echo "  WARN: project_storage write failed (non-fatal)"
}

# ── Resend notification ───────────────────────────────────────────────────────
_send_sandbox_resend_notification() {
  local outcome="${1:-success}"
  local resend_key="${RESEND_API_KEY:-}"
  [ -z "$resend_key" ] && echo "  WARN: RESEND_API_KEY not set — skipping" && return 0

  local status_label status_color
  [ "$outcome" = "success" ] && status_label="LIVE" && status_color="#22c55e" \
    || status_label="FAILED" && status_color="#ef4444"

  local git_sha git_branch git_msg
  git_sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  git_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')"
  git_msg="$(git -C "$REPO_ROOT" log -1 --pretty=%s 2>/dev/null || echo '')"

  # BUG FIX: Previously called npm audit AGAIN here — now reads exported vars from Step 5
  local vuln_row=""
  local audit_high="${GITHUB_VULN_HIGH:-0}"
  local audit_moderate="${GITHUB_VULN_MODERATE:-0}"
  if [ "${audit_high:-0}" -gt 0 ] || [ "${audit_moderate:-0}" -gt 0 ]; then
    vuln_row="<tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Advisories</td><td style='padding:5px 12px;color:#ef4444;font-weight:600;'>${audit_high} high / ${audit_moderate} moderate</td></tr>"
  else
    vuln_row="<tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Advisories</td><td style='padding:5px 12px;color:#22c55e;'>none detected</td></tr>"
  fi

  local html_body
  html_body="<!DOCTYPE html><html><body style='margin:0;padding:0;background:#0f1117;font-family:ui-monospace,monospace;'>
<div style='max-width:600px;margin:28px auto;background:#1a1d2e;border:1px solid #2d3148;border-radius:8px;overflow:hidden;'>
  <div style='background:#12151f;padding:16px 24px;border-bottom:3px solid ${status_color};'>
    <img src='https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail' style='height:24px;vertical-align:middle;margin-right:10px;' alt='IAM'/>
    <span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:${status_color};margin-right:8px;'></span>
    <span style='color:#e2e8f0;font-size:14px;font-weight:700;letter-spacing:0.05em;'>IAM // SANDBOX ${status_label}</span>
    <span style='float:right;color:#475569;font-size:11px;margin-top:2px;'>$(date -u +%Y-%m-%d)</span>
  </div>
  <div style='padding:14px 24px;'>
    <table style='width:100%;border-collapse:collapse;'>
      <tr><td colspan='2' style='padding:8px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>DEPLOY</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;width:130px;'>Status</td><td style='padding:5px 12px;color:${status_color};font-weight:700;'>${status_label}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Worker</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${SANDBOX_VERSION:-unknown}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Dashboard</td><td style='padding:5px 12px;color:#e2e8f0;'>v${NEXT_V}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Bucket</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${SANDBOX_BUCKET}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>URL</td><td style='padding:5px 12px;'><a href='${SANDBOX_HEALTH_URL}' style='color:#60a5fa;text-decoration:none;'>${SANDBOX_HEALTH_URL}</a></td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Health</td><td style='padding:5px 12px;color:#e2e8f0;'>${SANDBOX_HC:-skipped}</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>GIT</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Branch</td><td style='padding:5px 12px;color:#e2e8f0;'>${git_branch}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Commit</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${git_sha} — ${git_msg}</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>ASSETS + TIMINGS</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>R2 files</td><td style='padding:5px 12px;color:#e2e8f0;'>${R2_FILES_UPDATED:-0} uploads / ${R2_LINE_COUNT:-0} manifest</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>R2 objects</td><td style='padding:5px 12px;color:#e2e8f0;'>${CICD_R2_OBJECTS_BEFORE:-?} → ${CICD_R2_OBJECTS_AFTER:-?} (${CICD_R2_PRUNED:-0} pruned)</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Build</td><td style='padding:5px 12px;color:#e2e8f0;'>$(fmt_ms ${CICD_MS_BUILD})</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>R2</td><td style='padding:5px 12px;color:#e2e8f0;'>$(fmt_ms ${CICD_MS_R2})</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Worker</td><td style='padding:5px 12px;color:#e2e8f0;'>$(fmt_ms ${CICD_MS_WORKER})</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Wall</td><td style='padding:5px 12px;color:#e2e8f0;font-weight:600;'>$(fmt_ms ${CICD_WALL_TOTAL_MS:-0})</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>QUALITY / SECURITY</td></tr>
      ${vuln_row}
    </table>
  </div>
  <div style='padding:10px 24px;border-top:1px solid #2d3148;color:#475569;font-size:11px;display:flex;justify-content:space-between;'>
    <span>IAM sandbox deploy</span><span>$(date -u +%Y-%m-%dT%H:%M:%SZ)</span>
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
    -d "{\"from\":\"${RESEND_FROM}\",\"to\":[\"${RESEND_TO}\"],\"subject\":\"[IAM] SANDBOX ${status_label} — v${NEXT_V} — $(date -u +%Y-%m-%d)\",\"html\":${json_html}}" \
    -o /tmp/resend-sandbox-response.json \
    -w "%{http_code}" 2>/dev/null || echo "0")

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    local msg_id
    msg_id=$(grep -o '"id":"[^"]*"' /tmp/resend-sandbox-response.json 2>/dev/null | cut -d'"' -f4 || echo "")
    echo "  Resend: sent -> ${RESEND_TO} (HTTP ${http_code}${msg_id:+ id=${msg_id}})"
    export CICD_RESEND_MESSAGE_ID="${msg_id:-}"
    export CICD_RESEND_HTTP_STATUS="${http_code}"
  else
    echo "  WARN: Resend failed (HTTP ${http_code})"
    export CICD_RESEND_MESSAGE_ID=""
    export CICD_RESEND_HTTP_STATUS="${http_code}"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
echo "=== SANDBOX DEPLOY === v${NEXT_V} ==="
echo ""

# ── Step 1: Build ─────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ] && [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Building dashboard/ (Vite dist → dashboard/dist, flat chunk layout)..."
  CICD_T_BUILD_START=$(date +%s)
  export VITE_SHELL_VERSION="v${NEXT_V}"
  (
    cd "${REPO_ROOT}/dashboard"
    npm ci --include=dev
    npm run build
  )
  CICD_T_BUILD_END=$(date +%s)
  CICD_MS_BUILD=$(( (CICD_T_BUILD_END - CICD_T_BUILD_START) * 1000 ))
  echo "Build complete ($(fmt_ms $CICD_MS_BUILD))."
fi

# ── Step 2: R2 upload ─────────────────────────────────────────────────────────
R2_LINE_COUNT=0
R2_FILES_UPDATED=0
R2_BYTE_EST=0

if [ "$WORKER_ONLY" -eq 0 ]; then
  if [ ! -f "${DIST_DIR}/index.html" ]; then
    echo "ERROR: ${DIST_DIR}/index.html missing. Run without --skip-build."
    _DEPLOY_FAIL_ID=$(cat /tmp/iam_deploy_id 2>/dev/null)
    [ -n "${_DEPLOY_FAIL_ID}" ] && cicd_d1_nf "UPDATE deployments SET status='failed' WHERE id='${_DEPLOY_FAIL_ID}'"
    exit 1
  fi

  # Stamp version into HTML
  perl -0777 -i -pe "s/<!--\s*dashboard-v:\\d+\\s*-->//g" "${DIST_DIR}/index.html"
  perl -i -pe "s|</html>|<!-- dashboard-v:${NEXT_V} --></html>|" "${DIST_DIR}/index.html"
  echo "$NEXT_V" > "$VER_FILE"
  CURRENT_V=$NEXT_V

  # Build manifest
  : > "$MANIFEST_PATH"
  ( cd "$DIST_DIR" && find . -type f \
      ! -name "$MANIFEST_NAME" ! -name '.DS_Store' ! -name '._*' \
      ! -path '*/__MACOSX/*' -print | sed 's|^\./||' | sort ) > "$MANIFEST_PATH"

  CICD_T_R2_START=$(date +%s)
  R2_CICD_LOG="/tmp/sandbox-r2-${DEPLOY_TS}.log"
  : > "$R2_CICD_LOG"

  echo "Uploading assets to ${SANDBOX_BUCKET}..."
  while IFS= read -r rel || [ -n "$rel" ]; do
    [ -z "$rel" ] && continue
    filepath="${DIST_DIR}/${rel}"
    [ -f "$filepath" ] || continue
    ct=$(ctype_for "$rel")
    echo "  Uploading ${R2_AGENT_PREFIX}/${rel}..."
    "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/${R2_AGENT_PREFIX}/${rel}" \
      --file "$filepath" --content-type "$ct" \
      --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"
  done < "$MANIFEST_PATH"

  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/${R2_AGENT_PREFIX}/${MANIFEST_NAME}" \
    --file "$MANIFEST_PATH" --content-type "text/plain" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"

  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent.html" \
    --file "${DIST_DIR}/index.html" --content-type "text/html" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"

  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/iam-workspace-shell.html" \
    --file "${REPO_ROOT}/dashboard/iam-workspace-shell.html" --content-type "text/html" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"

  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/shell.css" \
    --file "${REPO_ROOT}/static/dashboard/shell.css" --content-type "text/css" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"

  CICD_T_R2_END=$(date +%s)
  CICD_MS_R2=$(( (CICD_T_R2_END - CICD_T_R2_START) * 1000 ))
  echo "R2 uploads complete ($(fmt_ms $CICD_MS_R2))."

  # Prune stale objects AFTER upload (actual implementation, not placeholder)
  R2_LINE_COUNT=$(wc -l < "$MANIFEST_PATH" | tr -d ' ')
  _r2_prune_sandbox "${SANDBOX_BUCKET}" "${R2_AGENT_PREFIX}" "${MANIFEST_PATH}"

  # Compute sizes
  R2_BYTE_EST=$(du -sk "$DIST_DIR" 2>/dev/null | awk '{print $1*1024}' || echo 0)
  # macOS du does not support -b; use -sk * 1024 as approximation on both platforms
  export CICD_R2_BUNDLE_BYTES="$R2_BYTE_EST"
  R2_FILES_UPDATED=$((R2_LINE_COUNT + 4))

  # dashboard_versions D1 log
  D1_VALUES=""
  first=1
  while IFS= read -r rel || [ -n "$rel" ]; do
    [ -z "$rel" ] && continue
    filepath="${DIST_DIR}/${rel}"
    [ -f "$filepath" ] || continue
    [[ "$rel" == "$MANIFEST_NAME" || "$rel" == "index.html" ]] && continue
    fh=$(md5 -q "$filepath" 2>/dev/null || md5sum "$filepath" | cut -d' ' -f1)
    fs=$(wc -c < "$filepath" | tr -d ' ')
    pn=$(page_name_for "$rel")
    row_id="sb-$(sql_escape "$pn")-v${CURRENT_V}-${DEPLOY_TS}"
    row="('$(sql_escape "$row_id")', '$(sql_escape "$pn")', 'v${CURRENT_V}', '${fh}', ${fs},
          '$(sql_escape "${R2_AGENT_PREFIX}/${rel}")', 'Sandbox deploy', 0, 0, unixepoch())"
    [ "$first" -eq 1 ] && D1_VALUES="$row" || D1_VALUES="${D1_VALUES}, ${row}"
    first=0
  done < "$MANIFEST_PATH"

  HTML_HASH=$(md5 -q "${DIST_DIR}/index.html" 2>/dev/null || md5sum "${DIST_DIR}/index.html" | cut -d' ' -f1)
  HTML_SIZE=$(wc -c < "${DIST_DIR}/index.html" | tr -d ' ')
  html_row="('sb-agent-html-v${CURRENT_V}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V}',
             '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html',
             'Sandbox deploy', 0, 0, unixepoch())"
  D1_SQL="INSERT OR REPLACE INTO dashboard_versions
    (id, page_name, version, file_hash, file_size, r2_path, description,
     is_production, is_locked, created_at)
    VALUES ${D1_VALUES:+${D1_VALUES}, }${html_row}"

  "${WRANGLER[@]}" d1 execute inneranimalmedia-business \
    --remote -c "$PROD_CFG" --command="$D1_SQL" \
    2>/dev/null || echo "  WARN: dashboard_versions write failed (non-fatal)"

  _DEP_ID="dep_sb_${DEPLOY_TS}"
  _SB_GH_ESC=$(cicd_sql_escape "${SANDBOX_GIT_HASH}")
  cicd_d1_nf "INSERT OR IGNORE INTO deployments (id, timestamp, version, git_hash, status, deployed_by, environment, worker_name, created_at) VALUES ('${_DEP_ID}', datetime('now'), 'v${NEXT_V}', '${_SB_GH_ESC}', 'pending', 'cursor', 'sandbox', 'inneranimal-dashboard', unixepoch())"
  echo "${_DEP_ID}" > /tmp/iam_deploy_id
fi

# ── Step 3: Deploy worker ──────────────────────────────────────────────────────
echo ""
echo "Deploying sandbox worker (inneranimal-dashboard)..."
CICD_T_WORKER_START=$(date +%s)
"${WRANGLER[@]}" deploy ./src/index.js -c "$CFG" 2>&1 | tee /tmp/sandbox-deploy-out.txt
CICD_T_WORKER_END=$(date +%s)
CICD_MS_WORKER=$(( (CICD_T_WORKER_END - CICD_T_WORKER_START) * 1000 ))

SANDBOX_VERSION=$(grep "Current Version ID:" /tmp/sandbox-deploy-out.txt | awk '{print $NF}' | head -1 || true)
[[ "$SANDBOX_VERSION" =~ ^[a-f0-9-]{36}$ ]] || SANDBOX_VERSION="unknown"

WORKER_STARTUP_LINE=$(grep -i "Worker Startup Time:" /tmp/sandbox-deploy-out.txt 2>/dev/null | head -1 || true)
export CICD_WORKER_STARTUP_MS=$(echo "$WORKER_STARTUP_LINE" | grep -oE '[0-9]+' | head -1 || echo "0")
export CICD_PHASE_SANDBOX_END_UNIX="$CICD_T_WORKER_END"
export CICD_PHASE_SANDBOX_DURATION_MS=$(( (CICD_T_WORKER_END - CICD_SB_DEPLOY_START_UNIX) * 1000 ))
printf '%s\n' "$SANDBOX_VERSION" > "${REPO_ROOT}/dashboard/.last-sandbox-worker-version" 2>/dev/null || true
echo "Worker deployed: ${SANDBOX_VERSION} ($(fmt_ms $CICD_MS_WORKER))"

# ── Step 4: Health check ───────────────────────────────────────────────────────
SANDBOX_HC=""
CICD_CF_HEALTH_RESPONSE_MS=0
if [ "${CICD_SKIP_HEALTH_CURL:-0}" != "1" ]; then
  echo ""
  echo "Health check: ${SANDBOX_HEALTH_URL}..."
  SANDBOX_HC_RAW=$(curl -sS -o /dev/null -w "%{http_code}|%{time_total}" \
    --max-time 20 "$SANDBOX_HEALTH_URL" 2>/dev/null || echo "000|0")
  SANDBOX_HC=$(echo "$SANDBOX_HC_RAW" | cut -d'|' -f1)
  SANDBOX_HC_TIME=$(echo "$SANDBOX_HC_RAW" | cut -d'|' -f2)
  export CICD_CF_HEALTH_STATUS_CODE="${SANDBOX_HC}"
  export CICD_CF_HEALTH_URL="${SANDBOX_HEALTH_URL}"
  CICD_CF_HEALTH_RESPONSE_MS=$(awk -v t="${SANDBOX_HC_TIME:-0}" 'BEGIN { printf "%.0f", t*1000 }')
  export CICD_CF_HEALTH_RESPONSE_MS
  if   [[ "$SANDBOX_HC" =~ ^2[0-9][0-9]$ ]]; then export CICD_CF_HEALTH_STATUS=healthy
  elif [[ "$SANDBOX_HC" =~ ^[23][0-9][0-9]$ ]]; then export CICD_CF_HEALTH_STATUS=degraded
  else export CICD_CF_HEALTH_STATUS=down
  fi
  echo "  Health: HTTP ${SANDBOX_HC} in ${CICD_CF_HEALTH_RESPONSE_MS}ms"
fi

# ── Step 5: Vuln audit (consolidated — one call, exports vars for notification fn) ──
# BUG FIX: Previous script ran npm audit twice. Now runs once here, exports vars.
_AUDIT_JSON=$(cd "${REPO_ROOT}/dashboard" && npm audit --json 2>/dev/null || echo '{}')
export GITHUB_VULN_HIGH=$(echo "$_AUDIT_JSON" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); v=d.get('metadata',{}).get('vulnerabilities',{}); print(v.get('high',0)+v.get('critical',0))" 2>/dev/null || echo "0")
export GITHUB_VULN_MODERATE=$(echo "$_AUDIT_JSON" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); v=d.get('metadata',{}).get('vulnerabilities',{}); print(v.get('moderate',0))" 2>/dev/null || echo "0")
unset _AUDIT_JSON

# ── Step 6: Wall time ─────────────────────────────────────────────────────────
CICD_WALL_END=$(date +%s)
export CICD_WALL_TOTAL_MS=$(( (CICD_WALL_END - CICD_SB_DEPLOY_START_UNIX) * 1000 ))

# ── Step 7: cicd-event dispatch (NOW has correct ms values + health status) ───
# BUG FIX: Previous script fired this BEFORE health check and BEFORE ms vars were
# calculated, so payload always had 0ms timings and no health status.
GIT_CHANGES_JSON=$(git diff --name-status HEAD~1 HEAD 2>/dev/null \
  | awk '{printf "{\"type\":\"%s\",\"path\":\"%s\"},", $1, $2}' \
  | sed 's/,$//' || true)
[ -n "$GIT_CHANGES_JSON" ] && GIT_CHANGES_JSON="[${GIT_CHANGES_JSON}]" || GIT_CHANGES_JSON="[]"
CHG_COUNT=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | wc -l | tr -d ' ')

curl -s -X POST \
  "https://inneranimal-dashboard.meauxbility.workers.dev/api/internal/cicd-event" \
  -H "X-Internal-Secret: ${INTERNAL_API_SECRET:-}" \
  -H "Content-Type: application/json" \
  -d "{
    \"event\": \"post_sandbox\",
    \"payload\": {
      \"worker_version_id\": \"${SANDBOX_VERSION}\",
      \"git_hash\": \"${SANDBOX_GIT_HASH}\",
      \"dashboard_version\": \"v${NEXT_V}\",
      \"r2_files\": ${R2_FILES_UPDATED},
      \"r2_bytes\": ${R2_BYTE_EST},
      \"r2_objects_before\": ${CICD_R2_OBJECTS_BEFORE:-0},
      \"r2_objects_after\": ${CICD_R2_OBJECTS_AFTER:-0},
      \"r2_pruned\": ${CICD_R2_PRUNED:-0},
      \"ms_build\": ${CICD_MS_BUILD},
      \"ms_r2\": ${CICD_MS_R2},
      \"ms_worker\": ${CICD_MS_WORKER},
      \"ms_wall\": ${CICD_WALL_TOTAL_MS},
      \"health_status\": \"${SANDBOX_HC:-0}\",
      \"health_ms\": ${CICD_CF_HEALTH_RESPONSE_MS:-0},
      \"environment\": \"sandbox\",
      \"triggered_by\": \"sandbox_auto\",
      \"changes\": ${GIT_CHANGES_JSON},
      \"change_count\": ${CHG_COUNT:-0}
    }
  }" \
  -o /tmp/cicd-event-sb-response.json \
  --max-time 30 2>/dev/null \
  && echo "  cicd-event: dispatched (post_sandbox)" \
  || echo "  WARN: cicd-event dispatch failed (non-fatal)"

# ── Step 8: Legacy CICD D1 log (lib) ─────────────────────────────────────────
cicd_log_sandbox_deploy "$SANDBOX_VERSION" "$NEXT_V" "$SANDBOX_BUCKET" \
  "$R2_FILES_UPDATED" "$R2_BYTE_EST" \
  "$CICD_MS_BUILD" "$CICD_MS_R2" "$CICD_MS_WORKER" "0" \
  "${SANDBOX_HC:-200}" "${SANDBOX_HEALTH_URL}"

# ── Step 9: Resend notification ───────────────────────────────────────────────
if [ "${CICD_SKIP_RESEND:-0}" != "1" ]; then
  echo ""
  echo "Sending Resend notification..."
  _send_sandbox_resend_notification "$([[ "$SANDBOX_VERSION" != "unknown" ]] && echo success || echo failed)"
fi

# ── Step 10: Knowledge sync ───────────────────────────────────────────────────
echo ""
echo "Syncing Agent Sam knowledge base..."
SYNC_RESP=$(curl -s -X POST \
  "https://inneranimal-dashboard.meauxbility.workers.dev/api/internal/post-deploy" \
  -H "X-Internal-Secret: ${INTERNAL_API_SECRET:-}" \
  -H "Content-Type: application/json" \
  --max-time 30 2>/dev/null || true)
if echo "$SYNC_RESP" | grep -q '"keys_written"'; then
  echo "  OK Knowledge sync complete — $(echo "$SYNC_RESP" | grep -o '"keys_written":[0-9]*' | head -1)"
else
  echo "  WARN: Knowledge sync skipped or failed (non-fatal)"
fi

_DEP_ID=$(cat /tmp/iam_deploy_id 2>/dev/null)
[ -n "${_DEP_ID}" ] && cicd_d1_nf "UPDATE deployments SET status='success' WHERE id='${_DEP_ID}'"

echo ""
echo "=== SANDBOX DEPLOY COMPLETE ==="
echo "  Worker:  inneranimal-dashboard @ ${SANDBOX_VERSION}"
echo "  Version: v${NEXT_V}"
echo "  Health:  ${SANDBOX_HC:-skipped}"
echo "  Wall:    $(fmt_ms ${CICD_WALL_TOTAL_MS})"
echo "  R2:      ${CICD_R2_OBJECTS_BEFORE:-?} → ${CICD_R2_OBJECTS_AFTER:-?} objects (${CICD_R2_PRUNED:-0} pruned)"
echo "  Verify:  curl -s ${SANDBOX_HEALTH_URL} | grep -o 'dashboard-v:[0-9]*'"
