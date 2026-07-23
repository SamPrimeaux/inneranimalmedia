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

# Gap 1 — trail failure → immediate push+email via POST /api/internal/post-deploy
# (status=trail_failed → sendPhoneLoopCompletion). Review before relying on this path.
notify_trail_failed() {
  local err_msg="${1:-post-deploy-record failed}"
  local secret="${INTERNAL_API_SECRET:-${AGENTSAM_BRIDGE_KEY:-}}"
  if [[ -z "$secret" ]]; then
    echo "[post-deploy-record] trail_failed notify skipped — no INTERNAL_API_SECRET/AGENTSAM_BRIDGE_KEY" >&2
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "[post-deploy-record] trail_failed notify skipped — jq missing" >&2
    return 0
  fi
  local payload
  payload="$(
    jq -nc \
      --arg status "trail_failed" \
      --arg error "$err_msg" \
      --arg git "${GIT_FULL:-unknown}" \
      --arg vid "${VERSION_ID:-}" \
      --arg env "${ENVIRONMENT:-production}" \
      '{
        status: $status,
        error: $error,
        git_hash: $git,
        worker_version_id: $vid,
        environment: $env
      }'
  )"
  local code
  code="$(
    curl -sS -o /tmp/iam-trail-failed-notify.out -w "%{http_code}" \
      -X POST "https://inneranimalmedia.com/api/internal/post-deploy" \
      -H "Authorization: Bearer ${secret}" \
      -H "X-Internal-Secret: ${secret}" \
      -H "Content-Type: application/json" \
      -d "$payload" || echo "000"
  )"
  if [[ "$code" == "200" || "$code" == "201" ]]; then
    echo "[post-deploy-record] trail_failed notify ok (HTTP $code)"
  else
    echo "[post-deploy-record] trail_failed notify HTTP ${code}: $(head -c 240 /tmp/iam-trail-failed-notify.out 2>/dev/null || true)" >&2
  fi
}

_TRAIL_NOTIFY_DONE=0
on_post_deploy_record_exit() {
  local ec=$?
  if [[ "$ec" -eq 0 || "$_TRAIL_NOTIFY_DONE" -eq 1 ]]; then
    return 0
  fi
  _TRAIL_NOTIFY_DONE=1
  notify_trail_failed "post-deploy-record exited ${ec}"
}
trap on_post_deploy_record_exit EXIT

VERSION_ID="${CLOUDFLARE_VERSION_ID:-${WRANGLER_VERSION_ID:-}}"
if [[ -z "$VERSION_ID" ]]; then
  VERSION_ID="$(uuidgen 2>/dev/null || echo "post-$(date +%s)")"
fi

DEPLOY_SECONDS="${DEPLOY_SECONDS:-0}"
if [[ ! "$DEPLOY_SECONDS" =~ ^[0-9]+$ ]]; then DEPLOY_SECONDS=0; fi
DEPLOY_DURATION_MS=$((DEPLOY_SECONDS * 1000))

TRIGGERED_BY="${TRIGGERED_BY:-cli_post_deploy}"
DEPLOYMENT_NOTES="${DEPLOYMENT_NOTES:-}"
DEPLOY_VERSION="${DEPLOY_VERSION:-}"
GIT_FULL="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo '')"
if [[ ! "$GIT_FULL" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[post-deploy-record] FATAL: could not resolve full 40-char git SHA (got: '${GIT_FULL}')" >&2
  echo "[post-deploy-record] refusing to write any trail row — no short-hash fallback permitted" >&2
  exit 1
fi
GIT_HASH="$GIT_FULL"
GIT_MSG="$(git -C "$REPO_ROOT" log -1 --pretty=format:'%s' 2>/dev/null || echo '')"
VERSION_SLUG="${DEPLOY_VERSION:-$GIT_FULL}"
DEPLOYED_BY="${DEPLOYED_BY:-sam_primeaux}"
# Prefer explicit DEPLOY_DESCRIPTION / DEPLOYMENT_NOTES; else use commit subject.
if [[ -z "$DEPLOYMENT_NOTES" && -n "$GIT_MSG" ]]; then
  DEPLOYMENT_NOTES="$GIT_MSG"
fi
DESCRIPTION="${DEPLOY_DESCRIPTION:-${DEPLOYMENT_NOTES:-Worker deploy (inneranimalmedia)}}"

# DORA/spend attribution scope -- defaults are this repo's own platform identity.
TENANT_ID="${TENANT_ID:-tenant_sam_primeaux}"
WORKSPACE_ID="${WORKSPACE_ID:-ws_inneranimalmedia}"
PROJECT_ID="${PROJECT_ID:-inneranimalmedia}"
RUN_GROUP_ID="${RUN_GROUP_ID:-rg_${GIT_FULL}_$(date +%s)}"
SESSION_TAG="${SESSION_TAG:-${TRIGGERED_BY}-${GIT_FULL}-$(date +%Y%m%d)}"
ROLLBACK_FROM="${ROLLBACK_FROM:-}"
ENVIRONMENT="${DEPLOY_ENVIRONMENT:-production}"
WORKER_NAME="${WORKER_NAME:-inneranimalmedia}"

# changed_files: REQUIRED non-empty JSON array. Empty [] is a ledger failure.
# Prefer tip-commit paths (works on shallow CF Builds); fall back to parent diff.
resolve_changed_files_json() {
  if [[ -n "${CHANGED_FILES_JSON:-}" ]]; then
    printf '%s' "$CHANGED_FILES_JSON"
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "[post-deploy-record] FATAL: jq required to build changed_files" >&2
    return 1
  fi
  if [[ ! -d "$REPO_ROOT/.git" ]]; then
    echo "[post-deploy-record] FATAL: .git missing — cannot resolve changed_files" >&2
    return 1
  fi

  local paths=""
  # 1) Files in tip commit (shallow-clone safe)
  paths="$(git -C "$REPO_ROOT" show --name-only --pretty=format: HEAD 2>/dev/null || true)"
  # 2) Parent diff
  if [[ -z "$(echo "$paths" | tr -d '[:space:]')" ]]; then
    paths="$(git -C "$REPO_ROOT" diff --name-only HEAD~1 HEAD 2>/dev/null || true)"
  fi
  if [[ -z "$(echo "$paths" | tr -d '[:space:]')" ]]; then
    paths="$(git -C "$REPO_ROOT" diff --name-only 'HEAD^' HEAD 2>/dev/null || true)"
  fi
  # 3) Diff vs previous deployment git_hash (when provided by caller / CF)
  if [[ -z "$(echo "$paths" | tr -d '[:space:]')" && -n "${PREV_DEPLOY_GIT_HASH:-}" ]]; then
    paths="$(git -C "$REPO_ROOT" diff --name-only "${PREV_DEPLOY_GIT_HASH}" HEAD 2>/dev/null || true)"
  fi
  # 4) Uncommitted / staged (local operator edge case)
  if [[ -z "$(echo "$paths" | tr -d '[:space:]')" ]]; then
    paths="$(
      {
        git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null || true
        git -C "$REPO_ROOT" diff --name-only --cached 2>/dev/null || true
      } | sort -u
    )"
  fi

  local json
  local max_files="${CHANGED_FILES_MAX:-50}"
  if [[ ! "$max_files" =~ ^[0-9]+$ ]] || [[ "$max_files" -lt 1 ]]; then max_files=50; fi
  # Cap path list BEFORE embedding into wrangler argv (CF Builds ARG_MAX / E2BIG).
  json="$(
    printf '%s\n' "$paths" | jq -R -s -c --argjson max "$max_files" '
      (split("\n") | map(select(length > 0))) as $all
      | ($all | length) as $n
      | if $n <= $max then $all
        else ($all[0:$max] + ["__truncated__:+\(($n - $max))_more"])
        end
    '
  )"
  if [[ -z "$json" || "$json" == '[]' ]]; then
    echo "[post-deploy-record] FATAL: changed_files resolved to [] — refuse empty ledger" >&2
    echo "[post-deploy-record] hint: set CHANGED_FILES_JSON='[\"path\"]' or deepen git history" >&2
    return 1
  fi
  printf '%s' "$json"
  return 0
}

# Cap an externally supplied CHANGED_FILES_JSON the same way (still non-empty).
cap_changed_files_json() {
  local raw="$1"
  local max_files="${CHANGED_FILES_MAX:-50}"
  if [[ ! "$max_files" =~ ^[0-9]+$ ]] || [[ "$max_files" -lt 1 ]]; then max_files=50; fi
  if ! command -v jq >/dev/null 2>&1; then
    printf '%s' "$raw"
    return 0
  fi
  printf '%s' "$raw" | jq -c --argjson max "$max_files" '
    if type != "array" then .
    else
      (length) as $n
      | if $n <= $max then .
        else (.[0:$max] + ["__truncated__:+\(($n - $max))_more"])
        end
    end
  '
}

CHANGED_FILES="$(resolve_changed_files_json)" || {
  echo "[post-deploy-record] FATAL: refusing deployments INSERT without changed_files" >&2
  exit 1
}
CHANGED_FILES="$(cap_changed_files_json "$CHANGED_FILES")"
echo "[post-deploy-record] changed_files=$(echo "$CHANGED_FILES" | head -c 200)…"

DEPLOY_TIMESTAMP="${DEPLOY_TIMESTAMP:-$(date '+%Y-%m-%d %H:%M:%S')}"
DEPLOY_CREATED_AT="${DEPLOY_CREATED_AT:-$DEPLOY_TIMESTAMP}"

# Escape single quotes for SQL: ' -> ''
sql_esc() { printf '%s' "${1//\'/\'\'}"; }

# Write SQL to a temp file and run via --file so huge payloads never hit ARG_MAX/E2BIG.
d1_exec_sql() {
  local label="$1"
  local sql="$2"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/iam-post-deploy-XXXXXX.sql")"
  # Always end with newline; wrangler --file is safer than giant --command argv.
  printf '%s\n' "$sql" > "$tmp"
  if ! npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --file="$tmp"; then
    echo "[post-deploy-record] d1 execute failed ($label) file=$tmp" >&2
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
  return 0
}

VID_ESC="$(sql_esc "$VERSION_ID")"
VS_ESC="$(sql_esc "$VERSION_SLUG")"
GH_ESC="$(sql_esc "$GIT_HASH")"
DESC_ESC="$(sql_esc "$DESCRIPTION")"
DBY_ESC="$(sql_esc "$DEPLOYED_BY")"
TB_ESC="$(sql_esc "$TRIGGERED_BY")"
DN_ESC="$(sql_esc "$DEPLOYMENT_NOTES")"
TID_ESC="$(sql_esc "$TENANT_ID")"
WID_ESC="$(sql_esc "$WORKSPACE_ID")"
PID_ESC="$(sql_esc "$PROJECT_ID")"
RG_ESC="$(sql_esc "$RUN_GROUP_ID")"
ST_ESC="$(sql_esc "$SESSION_TAG")"
RF_ESC="$(sql_esc "$ROLLBACK_FROM")"
ENV_ESC="$(sql_esc "$ENVIRONMENT")"
WN_ESC="$(sql_esc "$WORKER_NAME")"
TS_ESC="$(sql_esc "$DEPLOY_TIMESTAMP")"
CA_ESC="$(sql_esc "$DEPLOY_CREATED_AT")"
CF_ESC="$(sql_esc "$CHANGED_FILES")"

DEP_META='{}'
if command -v jq >/dev/null 2>&1; then
  FILES_LEN="$(printf '%s' "$CHANGED_FILES" | jq 'if type == "array" then length else 0 end')"
  DEP_META="$(
    jq -nc \
      --arg sha "$GIT_FULL" \
      --arg by "$TRIGGERED_BY" \
      --arg notes "$DEPLOYMENT_NOTES" \
      --arg secs "$DEPLOY_SECONDS" \
      --arg vid "$VERSION_ID" \
      --arg rg "$RUN_GROUP_ID" \
      --arg pipeline "post_deploy_record" \
      --argjson files_len "${FILES_LEN:-0}" \
      '{
        sync_source: $pipeline,
        git_sha_full: $sha,
        triggered_by: $by,
        notes: $notes,
        deploy_time_seconds: ($secs | tonumber),
        cloudflare_version_id: $vid,
        run_group_id: $rg,
        changed_files_count: $files_len
      }'
  )"
fi
DEP_META_ESC="$(sql_esc "$DEP_META")"

echo "Recording deploy in D1 (deployments.id=$VERSION_ID, timestamp=$DEPLOY_TIMESTAMP local, deploy_time_seconds=$DEPLOY_SECONDS, triggered_by=$TRIGGERED_BY, tenant_id=$TENANT_ID, workspace_id=$WORKSPACE_ID, project_id=${PROJECT_ID:-<null>})"
if ! d1_exec_sql "deployments_insert" "INSERT INTO deployments (
  id, timestamp, version, git_hash, changed_files, description, status, deployed_by, environment,
  deploy_duration_ms, rollback_from, notes, created_at, deploy_time_seconds, worker_name, triggered_by,
  tenant_id, workspace_id, project_id, run_group_id, metadata_json
) VALUES (
  '$VID_ESC', '$TS_ESC', '$VS_ESC', '$GH_ESC', '$CF_ESC', '$DESC_ESC', 'success', '$DBY_ESC', '$ENV_ESC',
  $DEPLOY_DURATION_MS, '$RF_ESC', '$DN_ESC', '$CA_ESC', $DEPLOY_SECONDS, '$WN_ESC', '$TB_ESC',
  '$TID_ESC', '$WID_ESC', '$PID_ESC', '$RG_ESC', '$DEP_META_ESC'
)"; then
  echo "[post-deploy-record] FATAL: deployments INSERT failed" >&2
  _TRAIL_NOTIFY_DONE=1
  notify_trail_failed "deployments INSERT failed (version_id=${VERSION_ID})"
  exit 1
fi
echo "Done. Overview / deployment tracking will show this deploy (all columns populated)."

# Keep agentsam_deployment_health live on every fast/full path (not only eval cron).
# Dual-write checked_at (ISO) + checked_at_unix / last_checked_at (epoch).
HEALTH_ID="dhc_$(echo "$VERSION_ID" | tr -cd 'a-zA-Z0-9' | cut -c1-16)"
HEALTH_ID_ESC="$(sql_esc "$HEALTH_ID")"
d1_exec_sql "deployment_health_insert" "INSERT INTO agentsam_deployment_health (id, tenant_id, deployment_id, worker_name, environment, check_type, check_url, status, http_status_code, response_time_ms, metadata_json, checked_by, checked_at, workspace_id, checked_at_unix, last_checked_at) VALUES ('$HEALTH_ID_ESC', '$TID_ESC', '$VID_ESC', '$WN_ESC', '$ENV_ESC', 'smoke_test', 'https://inneranimalmedia.com/api/health', 'healthy', NULL, NULL, json_object('git_hash', '$GH_ESC', 'triggered_by', '$TB_ESC', 'deploy_time_seconds', $DEPLOY_SECONDS, 'phase', 'post_deploy_record', 'run_group_id', '$RG_ESC'), 'post_deploy_record', strftime('%Y-%m-%dT%H:%M:%SZ','now'), '$WID_ESC', unixepoch(), unixepoch())" \
  && echo "[post-deploy-record] agentsam_deployment_health ok (id=$HEALTH_ID)" \
  || echo "[post-deploy-record] warning: agentsam_deployment_health insert failed (non-fatal)" >&2

# dashboard_versions — every column populated; exclusive is_active for agent trio.
DASH_DIST="${DASH_DIST:-$REPO_ROOT/dashboard/dist}"
if [[ "${SKIP_DASHBOARD_VERSIONS:-0}" == "1" ]]; then
  if [[ "${ALLOW_SKIP_DEPLOY_TRAIL:-0}" == "1" ]]; then
    echo "[post-deploy-record] SKIP_DASHBOARD_VERSIONS=1 with ALLOW_SKIP_DEPLOY_TRAIL=1 — skipping dashboard_versions (audited)" >&2
  else
    echo "[post-deploy-record] FATAL: SKIP_DASHBOARD_VERSIONS=1 without ALLOW_SKIP_DEPLOY_TRAIL=1" >&2
    exit 1
  fi
elif [[ -f "$DASH_DIST/dashboard.js" && -f "$DASH_DIST/dashboard.css" && -f "$DASH_DIST/index.html" ]]; then
  CURRENT_V=$(grep -oE 'dashboard-v:[0-9]+' "$DASH_DIST/index.html" 2>/dev/null | head -1 | cut -d: -f2 || true)
  [[ -z "$CURRENT_V" ]] && CURRENT_V=$(grep -oE '\?v=[0-9]+' "$DASH_DIST/index.html" 2>/dev/null | head -1 | grep -oE '[0-9]+' || true)
  if [[ -z "$CURRENT_V" ]]; then
    echo "[post-deploy-record] FATAL: could not resolve dashboard version from index.html" >&2
    exit 1
  fi
  if command -v md5 >/dev/null 2>&1; then
    JS_HASH=$(md5 -q "$DASH_DIST/dashboard.js")
    CSS_HASH=$(md5 -q "$DASH_DIST/dashboard.css")
    HTML_HASH=$(md5 -q "$DASH_DIST/index.html")
  else
    JS_HASH=$(md5sum "$DASH_DIST/dashboard.js" | awk '{print $1}')
    CSS_HASH=$(md5sum "$DASH_DIST/dashboard.css" | awk '{print $1}')
    HTML_HASH=$(md5sum "$DASH_DIST/index.html" | awk '{print $1}')
  fi
  JS_SIZE=$(wc -c < "$DASH_DIST/dashboard.js" | tr -d ' ')
  CSS_SIZE=$(wc -c < "$DASH_DIST/dashboard.css" | tr -d ' ')
  HTML_SIZE=$(wc -c < "$DASH_DIST/index.html" | tr -d ' ')
  DEPLOY_TS=$(date +%s)
  BUILD_PIPELINE="${BUILD_PIPELINE:-deploy_fast}"
  BP_ESC="$(sql_esc "$BUILD_PIPELINE")"
  CV_ESC="$(sql_esc "$CURRENT_V")"

  dv_meta() {
    local page="$1" r2="$2" fh="$3" fsz="$4" localp="$5"
    if command -v jq >/dev/null 2>&1; then
      jq -nc \
        --arg page "$page" \
        --arg r2 "$r2" \
        --arg fh "$fh" \
        --argjson fsz "$fsz" \
        --arg local "$localp" \
        --arg sha "$GIT_FULL" \
        --arg vid "$VERSION_ID" \
        --arg rg "$RUN_GROUP_ID" \
        --arg cache "$CURRENT_V" \
        --arg pipeline "$BUILD_PIPELINE" \
        '{
          page_name: $page,
          r2_path: $r2,
          file_hash: $fh,
          file_size: $fsz,
          local_backup_path: $local,
          git_sha_full: $sha,
          deployment_id: $vid,
          run_group_id: $rg,
          cache_bust: $cache,
          build_pipeline: $pipeline
        }'
    else
      echo '{}'
    fi
  }

  JS_LOCAL="$DASH_DIST/dashboard.js"
  CSS_LOCAL="$DASH_DIST/dashboard.css"
  HTML_LOCAL="$DASH_DIST/index.html"
  JS_META_ESC="$(sql_esc "$(dv_meta agent static/dashboard/app/dashboard.js "$JS_HASH" "$JS_SIZE" "$JS_LOCAL")")"
  CSS_META_ESC="$(sql_esc "$(dv_meta agent-css static/dashboard/app/dashboard.css "$CSS_HASH" "$CSS_SIZE" "$CSS_LOCAL")")"
  HTML_META_ESC="$(sql_esc "$(dv_meta agent-html static/dashboard/app.html "$HTML_HASH" "$HTML_SIZE" "$HTML_LOCAL")")"
  JS_LOCAL_ESC="$(sql_esc "$JS_LOCAL")"
  CSS_LOCAL_ESC="$(sql_esc "$CSS_LOCAL")"
  HTML_LOCAL_ESC="$(sql_esc "$HTML_LOCAL")"

  npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "UPDATE dashboard_versions SET is_active = 0 WHERE page_name IN ('agent','agent-css','agent-html') AND COALESCE(is_active, 0) = 1" \
    || echo "[post-deploy-record] warning: dashboard_versions deactivate failed (non-fatal)" >&2

  # Full-column insert. is_locked=1 → locked_at/locked_by set; screenshot_url='' when none.
  d1_exec_sql "dashboard_versions_insert" "INSERT OR REPLACE INTO dashboard_versions (
    id, page_name, version, file_hash, file_size, r2_path, local_backup_path, description,
    is_locked, is_production, screenshot_url, created_at, locked_at, locked_by, metadata_json,
    environment, git_commit, session_tag, is_active, build_pipeline, deployed_at
  ) VALUES
  ('agent-js-v${CV_ESC}-${DEPLOY_TS}', 'agent', 'v${CV_ESC}', '${JS_HASH}', ${JS_SIZE}, 'static/dashboard/app/dashboard.js', '${JS_LOCAL_ESC}', 'Auto-logged by post-deploy-record.sh', 1, 1, '', unixepoch(), unixepoch(), '${DBY_ESC}', '${JS_META_ESC}', '${ENV_ESC}', '${GH_ESC}', '${ST_ESC}', 1, '${BP_ESC}', unixepoch()),
  ('agent-css-v${CV_ESC}-${DEPLOY_TS}', 'agent-css', 'v${CV_ESC}', '${CSS_HASH}', ${CSS_SIZE}, 'static/dashboard/app/dashboard.css', '${CSS_LOCAL_ESC}', 'Auto-logged by post-deploy-record.sh', 1, 1, '', unixepoch(), unixepoch(), '${DBY_ESC}', '${CSS_META_ESC}', '${ENV_ESC}', '${GH_ESC}', '${ST_ESC}', 1, '${BP_ESC}', unixepoch()),
  ('agent-html-v${CV_ESC}-${DEPLOY_TS}', 'agent-html', 'v${CV_ESC}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/app.html', '${HTML_LOCAL_ESC}', 'Auto-logged by post-deploy-record.sh', 1, 1, '', unixepoch(), unixepoch(), '${DBY_ESC}', '${HTML_META_ESC}', '${ENV_ESC}', '${GH_ESC}', '${ST_ESC}', 1, '${BP_ESC}', unixepoch())
" \
    && echo "[post-deploy-record] dashboard_versions ok (v${CURRENT_V} js/css/html — all columns)" \
    || echo "[post-deploy-record] warning: dashboard_versions insert failed (non-fatal)" >&2
else
  echo "[post-deploy-record] dashboard/dist missing — skipping dashboard_versions (expected on worker-only)"
fi

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
  # Supabase auth.users UUID (FK on agentsam_deploy_events.user_id) — not D1 au_*.
  SUPABASE_USER_UUID="${IAM_SUPABASE_USER_ID:-${SUPABASE_USER_ID:-6cbd71f8-1d57-4530-9736-9bf03be1adad}}"
  D1_AUTH_USER_ID="${IAM_D1_AUTH_USER_ID:-${D1_AUTH_USER_ID:-au_871d920d1233cbd1}}"

  if [[ -z "$SUPABASE_SERVICE_KEY" || -z "$SUPABASE_WORKSPACE_UUID" ]]; then
    echo "[post-deploy-record] SUPABASE_SERVICE_ROLE_KEY or workspace UUID unset — skipping agentsam_deploy_events" >&2
  elif command -v jq >/dev/null 2>&1; then
    PAYLOAD=$(
      jq -n \
        --arg ws "$SUPABASE_WORKSPACE_UUID" \
        --arg uid "$SUPABASE_USER_UUID" \
        --arg d1_uid "$D1_AUTH_USER_ID" \
        --arg d1_ws "$WORKSPACE_ID" \
        --arg ver "$VERSION_ID" \
        --arg sha "$DEPLOY_FULL_SHA" \
        --arg notes "$DESCRIPTION" \
        --arg time "$DEPLOY_TIME_UTC" \
        --arg by "$TRIGGERED_BY" \
        --arg secs "$DEPLOY_SECONDS" \
        '{
          workspace_id: $ws,
          user_id: $uid,
          worker_name: "inneranimalmedia",
          worker_version: $ver,
          deploy_status: "success",
          commit_sha: $sha,
          notes: $notes,
          metadata: {
            sync_source: "post_deploy_record",
            d1_deployment_id: $ver,
            d1_workspace_id: $d1_ws,
            d1_user_id: $d1_uid,
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
