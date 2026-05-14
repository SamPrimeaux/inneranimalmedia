#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/.env.cloudflare" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi
# Drop stale Supabase project URLs from shell env (wrong REST host breaks deploy log + backfill).
for stale in tcczxkatmodtxfuulvsr sexdnwlyuhkyvseunqlx; do
  case "${SUPABASE_URL:-}" in
    *"${stale}"*)
      echo "⚠️  SUPABASE_URL contains stale ref ${stale}; ignoring for this run. Use https://dpmuvynqixblxsilnlut.supabase.co in .env.cloudflare" >&2
      SUPABASE_URL=
      break
      ;;
  esac
done
if [ -f "$REPO_ROOT/.env.cloudflare" ] && { ! grep -qE '^[[:space:]]*SUPABASE_URL=' "$REPO_ROOT/.env.cloudflare" || ! grep -qE '^[[:space:]]*SUPABASE_SERVICE_ROLE_KEY=' "$REPO_ROOT/.env.cloudflare"; }; then
  echo "⚠️  Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.cloudflare"
  echo "    These are needed for build_deploy_events Supabase sync on deploy."
fi

DIST="dashboard/dist"
BUCKET="inneranimalmedia"
PREFIX="static/dashboard/agent"
TOML="wrangler.production.toml"
DEPLOY_ENV="${DEPLOY_ENV:-production}"
DEPLOYED_BY="${DEPLOYED_BY:-sam_primeaux}"

# Wrangler wall-clock guard (GNU coreutils `timeout`, or `gtimeout` on macOS Homebrew).
run_with_timeout_secs() {
  local sec="$1"
  shift
  if [ "${sec:-0}" -eq 0 ] 2>/dev/null || [ -z "${sec}" ]; then
    "$@"
    return $?
  fi
  if command -v timeout >/dev/null 2>&1; then
    timeout "${sec}s" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "${sec}s" "$@"
  else
    echo "[deploy-frontend] warning: no timeout/gtimeout — running without wall-clock limit for: $*" >&2
    "$@"
  fi
}

# Production path: never upload a stale dashboard/dist. Vite must succeed before any R2 sync.
if [[ -n "${SKIP_VITE_BUILD:-}" ]]; then
  echo "✗ SKIP_VITE_BUILD is set. This deploy script does not skip Vite. Unset SKIP_VITE_BUILD and re-run." >&2
  exit 1
fi

echo "→ Clean dashboard/dist, then Vite build + cache bump (required before R2 sync)…"
rm -rf "$REPO_ROOT/$DIST"
BUILD_START_EPOCH=$(date +%s)
(cd "$REPO_ROOT" && npm run build:vite-only)
(cd "$REPO_ROOT" && node scripts/bump-cache.js)
BUILD_END_EPOCH=$(date +%s)
BUILD_MS=$(( (BUILD_END_EPOCH - BUILD_START_EPOCH) * 1000 ))
if command -v node >/dev/null 2>&1; then
  node -e "const fs=require('fs');const p=process.argv[1];let o={};try{if(fs.existsSync(p))o=JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){}o.build_ms=Number(process.argv[2]);fs.writeFileSync(p,JSON.stringify(o));" \
    "${REPO_ROOT}/.deploy-pipeline-stats.json" "${BUILD_MS}" || true
fi

if [[ ! -f "$REPO_ROOT/$DIST/index.html" ]]; then
  echo "✗ Missing $REPO_ROOT/$DIST/index.html after Vite — aborting (will not R2 sync)." >&2
  exit 1
fi

# R2: keys must be in .env.cloudflare (sourced above). Same vars as former prune script.
if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "✗ R2 sync requires R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and CLOUDFLARE_ACCOUNT_ID in .env.cloudflare" >&2
  exit 1
fi
if ! command -v rclone >/dev/null 2>&1; then
  echo "✗ rclone is required for dashboard R2 sync (https://rclone.org/install/)" >&2
  exit 1
fi

echo "→ Syncing $DIST to R2 static/dashboard/agent/ …"
echo "   (rclone sync: remote files under static/dashboard/agent/ not present in local dist are deleted — stale hashed JS/CSS pruned)"
find "$REPO_ROOT/$DIST" -name "*.map" -delete
R2_SYNC_STATUS=passed
R2_SYNC_START=$(date +%s)
rclone sync "$REPO_ROOT/$DIST" \
  ":s3:inneranimalmedia/static/dashboard/agent" \
  --s3-provider Cloudflare \
  --s3-access-key-id "$R2_ACCESS_KEY_ID" \
  --s3-secret-access-key "$R2_SECRET_ACCESS_KEY" \
  --s3-endpoint "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --checksum \
  --transfers 20 \
  --delete-after \
  --progress
R2_SYNC_END=$(date +%s)
R2_SYNC_MS=$(( (R2_SYNC_END - R2_SYNC_START) * 1000 ))
echo "→ R2 sync complete"

# Canonical URL `/static/dashboard/shell.css` (HTML + shells) must hit this exact key; Vite only copies
# the file into dist as `static/dashboard/shell.css`, which rclone maps to
# `static/dashboard/agent/static/dashboard/shell.css` — without this put, ASSETS.get(short key) misses.
SHELL_CANON="$REPO_ROOT/dashboard/public/static/dashboard/shell.css"
if [[ -f "$SHELL_CANON" ]]; then
  echo "→ Publishing canonical R2 key static/dashboard/shell.css"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/static/dashboard/shell.css" \
    --file "$SHELL_CANON" --content-type "text/css;charset=UTF-8" \
    -c "$TOML" --remote
else
  echo "⚠️  Missing $SHELL_CANON — /static/dashboard/shell.css may 404 until restored" >&2
fi
WS_SHELL="$REPO_ROOT/dashboard/iam-workspace-shell.html"
if [[ -f "$WS_SHELL" ]]; then
  echo "→ Publishing static/dashboard/iam-workspace-shell.html"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/static/dashboard/iam-workspace-shell.html" \
    --file "$WS_SHELL" --content-type "text/html;charset=UTF-8" \
    -c "$TOML" --remote
fi

# R2 inventory: manifest + D1 upsert + stale marking (no object deletes — use npm run r2:prune:dry-run separately)
DEPLOY_ID="${DEPLOY_ID:-deploy_$(date +%s)_$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo local)}"
export DEPLOY_ID
MANIFEST_PATH="$REPO_ROOT/analytics/deploys/$DEPLOY_ID/r2-manifest.json"
R2_RECONCILE_STATUS=skipped
R2_OBJECT_COUNT=""
R2_BYTE_COUNT=""
if [ "${SKIP_R2_DEPLOY_RECONCILE:-}" != "1" ] && command -v node >/dev/null 2>&1; then
  echo "→ R2 deploy manifest + inventory reconcile (no R2 deletes; prune remains manual)"
  R2_RECONCILE_STATUS=passed
  R2_MANIFEST_TIMEOUT_SEC="${R2_MANIFEST_TIMEOUT_SEC:-1200}"
  R2_INVENTORY_TIMEOUT_SEC="${R2_INVENTORY_TIMEOUT_SEC:-7200}"
  R2_RECONCILE_TIMEOUT_SEC="${R2_RECONCILE_TIMEOUT_SEC:-3600}"

  echo "[r2-manifest] start deploy_id=$DEPLOY_ID"
  MF=0
  _R2_PROJECT_ID="${DEPLOY_PROJECT_ID:-${DOCUMENTS_PROJECT_ID:-}}"
  run_with_timeout_secs "$R2_MANIFEST_TIMEOUT_SEC" \
    node "$REPO_ROOT/scripts/build-r2-deploy-manifest.mjs" \
    --dist "$REPO_ROOT/$DIST" \
    --bucket "$BUCKET" \
    --prefix "$PREFIX" \
    --deploy-id "$DEPLOY_ID" \
    --tenant-id "${TENANT_ID}" \
    --workspace-id "${WORKSPACE_ID}" \
    --project-id "${_R2_PROJECT_ID}" \
    || MF=$?
  if [ -f "$MANIFEST_PATH" ] && command -v jq >/dev/null 2>&1; then
    R2_OBJECT_COUNT=$(jq -r '.object_count // empty' "$MANIFEST_PATH" 2>/dev/null || true)
    R2_BYTE_COUNT=$(jq -r '.total_size_bytes // empty' "$MANIFEST_PATH" 2>/dev/null || true)
  fi
  echo "[r2-manifest] end objects=${R2_OBJECT_COUNT:-?} bytes=${R2_BYTE_COUNT:-?}"

  echo "[r2-inventory] start bucket=$BUCKET"
  IF=0
  _R2_EDITED_BY="${D1_AUTH_USER_ID:-${DEPLOY_USER_EMAIL:-}}"
  set +e
  set -o pipefail
  run_with_timeout_secs "$R2_INVENTORY_TIMEOUT_SEC" \
    node "$REPO_ROOT/scripts/inventory-r2-bucket.mjs" \
    --bucket "$BUCKET" \
    --upsert-d1 \
    --deploy-id "$DEPLOY_ID" \
    --tenant-id "${TENANT_ID}" \
    --workspace-id "${WORKSPACE_ID}" \
    --project-id "${_R2_PROJECT_ID}" \
    --edited-by "${_R2_EDITED_BY}" \
    2>&1 | tee "${TMPDIR:-/tmp}/iam-r2-inventory-${DEPLOY_ID}.log"
  IF=${PIPESTATUS[0]}
  set +o pipefail
  set -e

  echo "[r2-reconcile] start"
  RF=0
  REC_LOG="${TMPDIR:-/tmp}/iam-r2-reconcile-${DEPLOY_ID}.log"
  set +e
  set -o pipefail
  run_with_timeout_secs "$R2_RECONCILE_TIMEOUT_SEC" \
    node "$REPO_ROOT/scripts/reconcile-r2-deploy.mjs" \
    --manifest "$MANIFEST_PATH" \
    --bucket "$BUCKET" \
    --deploy-id "$DEPLOY_ID" \
    --tenant-id "${TENANT_ID}" \
    --workspace-id "${WORKSPACE_ID}" \
    --project-id "${_R2_PROJECT_ID}" \
    --apply-stale \
    2>&1 | tee "$REC_LOG"
  RF=${PIPESTATUS[0]}
  set +o pipefail
  set -e
  STALE_HINT=""
  if [ -f "$REC_LOG" ]; then
    STALE_HINT=$(grep -oE '"keys_to_mark_stale":[[:space:]]*[0-9]+' "$REC_LOG" | head -1 | tr -dc '0-9' || true)
  fi
  REC_STATUS=passed
  if [ "$RF" -ne 0 ]; then REC_STATUS=failed; fi
  echo "[r2-reconcile] end status=$REC_STATUS rc=$RF stale_candidates=${STALE_HINT:-unknown}"

  if [ "$MF" -ne 0 ] || [ "$IF" -ne 0 ] || [ "$RF" -ne 0 ]; then
    R2_RECONCILE_STATUS=failed
    echo "⚠️  R2 reconcile steps had failures (manifest=$MF inventory=$IF reconcile=$RF)"
  fi
  if [ "${STRICT_R2_RECONCILE:-0}" = "1" ] && [ "$R2_RECONCILE_STATUS" = "failed" ]; then
    echo "✗ STRICT_R2_RECONCILE=1 — aborting before worker deploy"
    exit 1
  fi
fi

if [ "${SKIP_R2_DEPLOY_RECONCILE:-}" = "1" ] && [ -n "${RUN_GROUP_ID:-}" ] && command -v node >/dev/null 2>&1; then
  node "$REPO_ROOT/scripts/record-d1-deployment-health.mjs" --phase r2-skip 2>/dev/null || true
fi

echo "→ Deploying worker..."
DEPLOY_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DEPLOY_START_EPOCH=$(date +%s)
DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/iam-wrangler-deploy.XXXXXX")"
trap 'rm -f "$DEPLOY_LOG"' EXIT
if ! ./scripts/with-cloudflare-env.sh npx wrangler deploy -c "$TOML" 2>&1 | tee "$DEPLOY_LOG"; then
  echo "✗ Worker deploy failed"
  exit 1
fi
WORKER_VERSION_ID="$(grep -E "Current Version ID:|Version ID:" "$DEPLOY_LOG" 2>/dev/null | tail -1 | awk '{print $NF}' || true)"
rm -f "$DEPLOY_LOG"
trap - EXIT
DEPLOY_END_EPOCH=$(date +%s)
DEPLOY_DURATION_MS=$(( (DEPLOY_END_EPOCH - DEPLOY_START_EPOCH) * 1000 ))
GIT_FULL_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
GIT_MSG_LINE="$(git -C "$REPO_ROOT" log -1 --pretty=%s 2>/dev/null || echo "unknown")"
BRANCH_NAME="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
if [ -n "${WORKER_VERSION_ID:-}" ]; then
  echo "✓ Worker deployed (version ${WORKER_VERSION_ID})"
else
  echo "✓ Worker deployed (could not parse Current Version ID from wrangler output)"
fi

CACHE_SNIP="$(grep -oE '(agent-dashboard|agent-core)\.(js|css)\?v=[0-9]+' "$REPO_ROOT/$DIST/index.html" 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"
R2_LOCAL_OBJECTS="$(find "$REPO_ROOT/$DIST" -type f 2>/dev/null | wc -l | tr -d ' ')"
GIT_STATUS_URL="https://inneranimalmedia.com/api/agent/git/status"
GIT_STATUS_TMP="$(mktemp "${TMPDIR:-/tmp}/iam-git-status.XXXXXX")"
HTTP_CODE="$(curl -sS -o "$GIT_STATUS_TMP" -w '%{http_code}' --max-time 25 "$GIT_STATUS_URL" 2>/dev/null || echo "000")"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[deploy-proof] git_sha_full=${GIT_FULL_SHA:-unknown}"
echo "[deploy-proof] worker_version_id=${WORKER_VERSION_ID:-unknown}"
echo "[deploy-proof] dashboard/dist/index.html cache params: ${CACHE_SNIP:-<none matched>}"
echo "[deploy-proof] local_dashboard_dist_files=${R2_LOCAL_OBJECTS} (rclone sync source object count)"
if [[ -n "${R2_OBJECT_COUNT:-}" ]]; then
  echo "[deploy-proof] r2_deploy_manifest_object_count=${R2_OBJECT_COUNT}"
else
  echo "[deploy-proof] r2_deploy_manifest_object_count=(not built — SKIP_R2_DEPLOY_RECONCILE=1 or manifest unavailable)"
fi
echo "[deploy-proof] live GET ${GIT_STATUS_URL} → HTTP ${HTTP_CODE}"
if command -v jq >/dev/null 2>&1 && [[ -s "$GIT_STATUS_TMP" ]]; then
  jq -c . <"$GIT_STATUS_TMP" 2>/dev/null || head -c 500 "$GIT_STATUS_TMP"
else
  head -c 500 "$GIT_STATUS_TMP" 2>/dev/null || true
fi
echo ""
if [[ "$HTTP_CODE" == "401" ]]; then
  echo "[deploy-proof] note: 401 without session cookie is expected; dashboard uses this endpoint when signed in."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
rm -f "$GIT_STATUS_TMP"

# KV deploy markers + agentsam_hook trigger=post_deploy (writes agentsam_hook_execution)
GIT_SHORT_HASH="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "→ Worker post-deploy (KV + agentsam_hook post_deploy)..."
if command -v jq >/dev/null 2>&1; then
  POST_DEPLOY_BODY=$(
    jq -n \
      --arg env "production" \
      --arg gh "${GIT_FULL_SHA:-unknown}" \
      --arg v "${GIT_SHORT_HASH}" \
      --arg wv "${WORKER_VERSION_ID:-unknown}" \
      --argjson dur "${DEPLOY_DURATION_MS:-0}" \
      --arg uid "${D1_AUTH_USER_ID:-usr_sam_iam}" \
      '{environment:$env, git_hash:$gh, version:$v, worker_version_id:$wv, deploy_duration_ms:$dur, user_id:$uid}'
  )
  if [ -n "${AGENTSAM_BRIDGE_KEY:-}" ]; then
    curl -sS -X POST "https://inneranimalmedia.com/api/internal/post-deploy" \
      -H "Authorization: Bearer ${AGENTSAM_BRIDGE_KEY}" \
      -H "Content-Type: application/json" \
      -d "$POST_DEPLOY_BODY" --max-time 90 || echo "[deploy-frontend] warning: /api/internal/post-deploy non-zero (non-fatal)"
  elif [ -n "${INTERNAL_API_SECRET:-}" ]; then
    curl -sS -X POST "https://inneranimalmedia.com/api/internal/post-deploy" \
      -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" \
      -H "Content-Type: application/json" \
      -d "$POST_DEPLOY_BODY" --max-time 90 || echo "[deploy-frontend] warning: /api/internal/post-deploy non-zero (non-fatal)"
  else
    echo "[deploy-frontend] warning: AGENTSAM_BRIDGE_KEY or INTERNAL_API_SECRET unset — skipping Worker post-deploy (KV + hooks)"
  fi
else
  echo "[deploy-frontend] warning: jq missing — skipping Worker post-deploy JSON body"
fi

# Worker stats JSON is written at end of this script (after email notify) so notify_status is accurate.
DEPLOY_COMPLETED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [ -f "$REPO_ROOT/.deploy-run-context.json" ] && command -v node >/dev/null 2>&1; then
  node "$REPO_ROOT/scripts/log-supabase-deploy-tool.mjs" \
    --tool wrangler_deploy \
    --category deploy \
    --duration-ms "${DEPLOY_DURATION_MS:-0}" \
    --success 1 \
    --output-preview "${WORKER_VERSION_ID:-}" || true
fi

# Build manifest → R2 (dashboard build history under analytics/app-builds/)
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FILE_COUNT=$(find "$REPO_ROOT/$DIST" -type f 2>/dev/null | wc -l | tr -d ' ')
BRANCH=$(git branch --show-current 2>/dev/null || echo main)
printf '{"git_hash":"%s","timestamp":"%s","file_count":%s,"branch":"%s","environment":"production"}' \
  "$GIT_HASH" "$TS" "$FILE_COUNT" "$BRANCH" | \
./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
  "${BUCKET}/analytics/app-builds/${TS}.json" \
  --pipe --content-type application/json -c "$TOML" --remote
echo "[deploy] build manifest → analytics/app-builds/${TS}.json"

# Expire old build manifests (90 days) under analytics/app-builds/
echo "→ Ensuring R2 lifecycle rule for analytics/app-builds/ (expire after 90 days)..."
if ./scripts/with-cloudflare-env.sh npx wrangler r2 bucket lifecycle list "$BUCKET" -c "$TOML" 2>/dev/null | grep -qE 'app-builds-manifests-90d|app-builds/'; then
  echo "  (lifecycle rule for app-builds/ likely already present — skipping add)"
else
  set +e
  _lif_out=$(
    ./scripts/with-cloudflare-env.sh npx wrangler r2 bucket lifecycle add "$BUCKET" app-builds-manifests-90d analytics/app-builds/ \
      --expire-days 90 --force -c "$TOML" 2>&1
  )
  _lif_rc=$?
  set -e
  if [ "$_lif_rc" -ne 0 ]; then
    if echo "$_lif_out" | grep -qE '10061|Rule IDs must be unique|unique'; then
      echo "  (lifecycle rule already exists on bucket — continuing)"
    else
      echo "$_lif_out" >&2
      exit "$_lif_rc"
    fi
  fi
fi

# Post-deploy: Supabase pgvector backfill for rows with NULL embedding (Edge Function).
# Set SUPABASE_WEBHOOK_SECRET in .env.cloudflare (same value as the function's WEBHOOK_SECRET).
DEPLOY_EMBEDDINGS_RAN=0
if [[ "${RUN_SUPABASE_EMBEDDINGS_BACKFILL:-0}" == "1" ]]; then
  echo "→ Supabase embeddings backfill (opt-in RUN_SUPABASE_EMBEDDINGS_BACKFILL=1)…"
  if bash "$REPO_ROOT/scripts/supabase-embeddings-backfill.sh"; then
    DEPLOY_EMBEDDINGS_RAN=1
  else
    echo "[deploy-frontend] warning: embeddings backfill exited non-zero (non-fatal)"
  fi
fi

# Post-deploy: Resend notification (branded HTML; mirrors build_deploy_events fields)
TOTAL_KB=$(du -sk "$REPO_ROOT/$DIST" | cut -f1)
: "${DEPLOY_NOTIFY_AI_MODEL:=}"
: "${DEPLOY_NOTIFY_AI_TOKENS_IN:=}"
: "${DEPLOY_NOTIFY_AI_TOKENS_OUT:=}"
: "${DEPLOY_NOTIFY_AI_COST_USD:=}"
_AI_MODEL="${DEPLOY_NOTIFY_AI_MODEL:-—}"
_AI_TIN="${DEPLOY_NOTIFY_AI_TOKENS_IN:-—}"
_AI_TOUT="${DEPLOY_NOTIFY_AI_TOKENS_OUT:-—}"
if [ -n "${DEPLOY_NOTIFY_AI_COST_USD:-}" ]; then
  _AI_COST_FMT="\$$DEPLOY_NOTIFY_AI_COST_USD"
else
  _AI_COST_FMT="—"
fi
_WV_DISP="${WORKER_VERSION_ID:-—}"
_SHA_DISP="${GIT_FULL_SHA:-—}"
_MSG_DISP="${GIT_MSG_LINE:-—}"
_ENV_DISP="${DEPLOY_ENV:-—}"
_BY_DISP="${DEPLOYED_BY:-—}"
# Notification recipient (Resend delivery) — not the deploy audit actor; see DEPLOY_USER_EMAIL.
_NOTIFY_TO="${DEPLOY_NOTIFY_EMAIL:-${RESEND_NOTIFY_EMAIL:-info@inneranimals.com}}"
_DEPLOY_ACTOR="${DEPLOY_USER_EMAIL:-—}"

echo "→ Sending deploy notification (POST /api/email/send) → ${_NOTIFY_TO} ..."
NOTIFY_HTML="$(
  WORKER_VERSION_ID="${WORKER_VERSION_ID:-}" \
  GIT_FULL_SHA="${GIT_FULL_SHA:-}" \
  GIT_SHORT_HASH="${GIT_HASH:-}" \
  GIT_MSG_LINE="${GIT_MSG_LINE:-}" \
  BRANCH_NAME="${BRANCH_NAME:-}" \
  DEPLOY_ENV="${DEPLOY_ENV:-production}" \
  DEPLOYED_BY="${DEPLOYED_BY:-sam_primeaux}" \
  DEPLOY_STARTED_AT="${DEPLOY_STARTED_AT:-}" \
  DEPLOY_DURATION_MS="${DEPLOY_DURATION_MS:-0}" \
  R2_SYNC_STATUS="${R2_SYNC_STATUS:-passed}" \
  FILE_COUNT="${FILE_COUNT:-}" \
  TOTAL_KB="${TOTAL_KB:-}" \
  NOTIFY_TO="${_NOTIFY_TO}" \
  node "$REPO_ROOT/scripts/build-deploy-email-html.mjs"
)"
NOTIFY_JSON="$(jq -n \
  --arg to "${_NOTIFY_TO}" \
  --arg subj "Agent Sam Deployed — ${DEPLOY_ENV:-production} [${BRANCH_NAME:-main}] ${GIT_HASH:-}" \
  --arg html "$NOTIFY_HTML" \
  '{to: $to, subject: $subj, html: $html}')"
# Notification should never block deploy success; treat failures as warnings.
# Notification should never block deploy success; treat failures as warnings.
NOTIFY_RESP="$(curl -sS -X POST "https://inneranimalmedia.com/api/email/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${INTERNAL_API_SECRET:-}" \
  -d "$NOTIFY_JSON" || true)"
if command -v jq >/dev/null 2>&1; then
  _notify_err="$(echo "$NOTIFY_RESP" | jq -r '.error // empty' 2>/dev/null || true)"
else
  _notify_err=""
fi
NOTIFY_STATUS=sent
if [ -n "${_notify_err:-}" ]; then
  NOTIFY_STATUS=failed
  echo "⚠️  Deploy notification failed: ${_notify_err}" >&2
  echo "    Fix: set worker secret RESEND_FROM (verified sender). Example:" >&2
  echo "    npx wrangler secret put RESEND_FROM -c ./wrangler.production.toml" >&2
elif [ -z "${NOTIFY_RESP}" ]; then
  NOTIFY_STATUS=failed
fi

# Final .deploy-worker-stats.json (R2 + wrangler + notification outcome)
if command -v jq >/dev/null 2>&1; then
  if [ -n "${R2_OBJECT_COUNT}" ]; then R2_MANIFEST_OBJECT_JSON="$R2_OBJECT_COUNT"; else R2_MANIFEST_OBJECT_JSON='null'; fi
  if [ -n "${R2_BYTE_COUNT}" ]; then R2_MANIFEST_BYTES_JSON="$R2_BYTE_COUNT"; else R2_MANIFEST_BYTES_JSON='null'; fi
  jq -n \
    --arg wv "${WORKER_VERSION_ID:-}" \
    --argjson dur "${DEPLOY_DURATION_MS:-0}" \
    --arg sha "${GIT_FULL_SHA:-}" \
    --arg branch "${BRANCH_NAME:-}" \
    --arg gmsg "${GIT_MSG_LINE:-}" \
    --arg started "${DEPLOY_STARTED_AT:-}" \
    --arg completed "${DEPLOY_COMPLETED_AT}" \
    --argjson r2_sync_ms "${R2_SYNC_MS:-0}" \
    --arg r2_sync_status "${R2_SYNC_STATUS:-unknown}" \
    --arg r2_reconcile_status "${R2_RECONCILE_STATUS:-unknown}" \
    --arg notify_status "${NOTIFY_STATUS:-unknown}" \
    --argjson r2_manifest_object_count "${R2_MANIFEST_OBJECT_JSON}" \
    --argjson r2_manifest_total_bytes "${R2_MANIFEST_BYTES_JSON}" \
    '{
      worker_version_id: (if ($wv | length) == 0 then null else $wv end),
      wrangler_duration_ms: $dur,
      git_commit_sha: $sha,
      git_branch: $branch,
      git_message: $gmsg,
      deploy_started_at: $started,
      deploy_completed_at: $completed,
      r2_sync_ms: $r2_sync_ms,
      r2_sync_status: $r2_sync_status,
      r2_reconcile_status: $r2_reconcile_status,
      notify_status: $notify_status,
      r2_manifest_object_count: $r2_manifest_object_count,
      r2_manifest_total_bytes: $r2_manifest_total_bytes
    }' > "$REPO_ROOT/.deploy-worker-stats.json"
fi

if [[ "${DEPLOY_EMBEDDINGS_RAN:-0}" == "1" ]]; then
  echo "✓ Done (worker + R2 + notification; Supabase embeddings backfill ran)"
else
  echo "✓ Done (worker + R2 + notification; Supabase embeddings backfill skipped — set RUN_SUPABASE_EMBEDDINGS_BACKFILL=1 to run)"
fi
