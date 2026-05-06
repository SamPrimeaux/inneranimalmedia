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

if [[ -z "${SKIP_VITE_BUILD:-}" ]]; then
  echo "→ Building frontend..."
  npm run build:vite-only
else
  echo "→ Skipping Vite build (SKIP_VITE_BUILD=1)"
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

echo "→ Syncing $DIST to R2 static/dashboard/agent/ ..."
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

# R2 inventory: manifest + D1 upsert + stale marking (no object deletes — use npm run r2:prune:dry-run separately)
DEPLOY_ID="${DEPLOY_ID:-deploy_$(date +%s)_$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo local)}"
export DEPLOY_ID
R2_RECONCILE_STATUS=skipped
R2_OBJECT_COUNT=""
R2_BYTE_COUNT=""
if [ "${SKIP_R2_DEPLOY_RECONCILE:-}" != "1" ] && command -v node >/dev/null 2>&1; then
  echo "→ R2 deploy manifest + inventory reconcile (no R2 deletes; prune remains manual)"
  R2_RECONCILE_STATUS=passed
  MF=0
  node "$REPO_ROOT/scripts/build-r2-deploy-manifest.mjs" \
    --dist "$REPO_ROOT/$DIST" \
    --bucket "$BUCKET" \
    --prefix "$PREFIX" \
    --deploy-id "$DEPLOY_ID" \
    --tenant-id "${TENANT_ID:-tenant_sam_primeaux}" \
    --workspace-id "${WORKSPACE_ID:-ws_inneranimalmedia}" \
    --project-id "${DOCUMENTS_PROJECT_ID:-inneranimalmedia}" \
    || MF=$?
  IF=0
  node "$REPO_ROOT/scripts/inventory-r2-bucket.mjs" \
    --bucket "$BUCKET" \
    --upsert-d1 \
    --deploy-id "$DEPLOY_ID" \
    --tenant-id "${TENANT_ID:-tenant_sam_primeaux}" \
    --workspace-id "${WORKSPACE_ID:-ws_inneranimalmedia}" \
    --project-id "${DOCUMENTS_PROJECT_ID:-inneranimalmedia}" \
    || IF=$?
  RF=0
  node "$REPO_ROOT/scripts/reconcile-r2-deploy.mjs" \
    --manifest "$REPO_ROOT/analytics/deploys/$DEPLOY_ID/r2-manifest.json" \
    --bucket "$BUCKET" \
    --deploy-id "$DEPLOY_ID" \
    --tenant-id "${TENANT_ID:-tenant_sam_primeaux}" \
    --workspace-id "${WORKSPACE_ID:-ws_inneranimalmedia}" \
    --project-id "${DOCUMENTS_PROJECT_ID:-inneranimalmedia}" \
    --apply-stale \
    || RF=$?
  if [ "$MF" -ne 0 ] || [ "$IF" -ne 0 ] || [ "$RF" -ne 0 ]; then
    R2_RECONCILE_STATUS=failed
    echo "⚠️  R2 reconcile steps had failures (manifest=$MF inventory=$IF reconcile=$RF)"
  fi
  MANIFEST_PATH="$REPO_ROOT/analytics/deploys/$DEPLOY_ID/r2-manifest.json"
  if [ -f "$MANIFEST_PATH" ] && command -v jq >/dev/null 2>&1; then
    R2_OBJECT_COUNT=$(jq -r '.object_count // empty' "$MANIFEST_PATH" 2>/dev/null || true)
    R2_BYTE_COUNT=$(jq -r '.total_size_bytes // empty' "$MANIFEST_PATH" 2>/dev/null || true)
  fi
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
FILE_COUNT=$(find "$DIST" -type f 2>/dev/null | wc -l | tr -d ' ')
BRANCH=$(git branch --show-current 2>/dev/null || echo main)
printf '{"git_hash":"%s","timestamp":"%s","file_count":%s,"branch":"%s","environment":"production"}' \
  "$GIT_HASH" "$TS" "$FILE_COUNT" "$BRANCH" | \
./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
  "${BUCKET}/analytics/app-builds/${TS}.json" \
  --pipe --content-type application/json -c "$TOML" --remote
echo "[deploy] build manifest → analytics/app-builds/${TS}.json"

# Expire old build manifests (90 days) under analytics/app-builds/
echo "→ Ensuring R2 lifecycle rule for analytics/app-builds/ (expire after 90 days)..."
if ./scripts/with-cloudflare-env.sh npx wrangler r2 bucket lifecycle list "$BUCKET" -c "$TOML" 2>/dev/null | grep -q 'app-builds-manifests-90d'; then
  echo "  (lifecycle rule app-builds-manifests-90d already present)"
else
  ./scripts/with-cloudflare-env.sh npx wrangler r2 bucket lifecycle add "$BUCKET" app-builds-manifests-90d analytics/app-builds/ \
    --expire-days 90 --force -c "$TOML"
fi

# Post-deploy: Supabase pgvector backfill for rows with NULL embedding (Edge Function).
# Set SUPABASE_WEBHOOK_SECRET in .env.cloudflare (same value as the function's WEBHOOK_SECRET).
"$REPO_ROOT/scripts/supabase-embeddings-backfill.sh"

# Post-deploy: Resend notification (branded HTML; mirrors build_deploy_events fields)
TOTAL_KB=$(du -sk "$DIST" | cut -f1)
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
NOTIFY_JSON="$(jq -n \
  --arg to "${_NOTIFY_TO}" \
  --arg actor "${_DEPLOY_ACTOR}" \
  --arg env "$DEPLOY_ENV" \
  --arg br "$BRANCH_NAME" \
  --arg wv "$_WV_DISP" \
  --arg sha "$_SHA_DISP" \
  --arg msg "$_MSG_DISP" \
  --arg envl "$_ENV_DISP" \
  --arg by "$_BY_DISP" \
  --arg dur "$DEPLOY_DURATION_MS" \
  --arg started "$DEPLOY_STARTED_AT" \
  --arg aim "$_AI_MODEL" \
  --arg aiti "$_AI_TIN" \
  --arg aito "$_AI_TOUT" \
  --arg aic "$_AI_COST_FMT" \
  --arg fc "$FILE_COUNT" \
  --arg kb "$TOTAL_KB" \
  --arg gh "$GIT_HASH" \
  '{
    to: $to,
    subject: ("✓ Agent Sam Deployed — " + $env + " [" + $br + "]"),
    html: (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/></head>" +
      "<body style=\"margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;\">" +
      "<div style=\"max-width:560px;margin:0 auto;padding:28px 20px 40px;\">" +
      "<div style=\"border-bottom:1px solid #1e293b;padding-bottom:16px;margin-bottom:20px;\">" +
      "<div style=\"font-size:22px;font-weight:700;color:#0d9488;letter-spacing:-0.02em;\">Inner Animal Media</div>" +
      "<div style=\"font-size:13px;color:#94a3b8;margin-top:6px;\">Deploy Notification</div></div>" +
      "<p style=\"margin:0 0 18px;\"><span style=\"display:inline-block;padding:6px 14px;border-radius:6px;background:#166534;color:#ecfdf5;font-weight:600;font-size:13px;\">SUCCESS</span></p>" +
      "<table style=\"width:100%;border-collapse:collapse;font-size:14px;margin-bottom:22px;\">" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;width:42%;\">Worker Version ID</td><td style=\"padding:10px 8px;color:#f1f5f9;word-break:break-all;\">" + $wv + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Git Commit</td><td style=\"padding:10px 8px;color:#f1f5f9;word-break:break-all;\">" + $sha + " — " + $msg + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Branch</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $br + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Environment</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $envl + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Deploy actor (audit)</td><td style=\"padding:10px 8px;color:#f1f5f9;word-break:break-all;\">" + $actor + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Triggered By</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $by + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Duration</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $dur + "ms</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Timestamp</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $started + "</td></tr>" +
      "</table>" +
      "<div style=\"font-size:13px;color:#64748b;margin-bottom:10px;\">AI Cost <span style=\"color:#475569\">(if applicable)</span></div>" +
      "<table style=\"width:100%;border-collapse:collapse;font-size:14px;margin-bottom:28px;\">" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;width:42%;\">Model</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $aim + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Tokens In/Out</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $aiti + " / " + $aito + "</td></tr>" +
      "<tr style=\"border-bottom:1px solid #1e293b;\"><td style=\"padding:10px 8px;color:#94a3b8;\">Cost</td><td style=\"padding:10px 8px;color:#f1f5f9;\">" + $aic + "</td></tr>" +
      "</table>" +
      "<p style=\"font-size:12px;color:#64748b;margin:0 0 12px;\">Dashboard bundle: " + $fc + " files · " + $kb + " KB · short hash " + $gh + "</p>" +
      "<p style=\"font-size:12px;color:#64748b;margin:0;border-top:1px solid #1e293b;padding-top:16px;\">Inner Animal Media · inneranimalmedia.com · Auto-generated deploy notification</p>" +
      "</div></body></html>"
    )
  }')"
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

echo "✓ Done (manifest + embeddings backfill + notification)"
