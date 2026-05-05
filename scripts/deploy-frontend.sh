#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/.env.cloudflare" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi
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

echo "→ Building frontend..."
npm run build:vite-only

echo "→ Syncing dist to R2 $BUCKET/$PREFIX ..."
find "$DIST" -type f | while read -r file; do
  key="$PREFIX/${file#$DIST/}"
  case "$file" in
    *.js)   ct="application/javascript" ;;
    *.css)  ct="text/css" ;;
    *.html) ct="text/html" ;;
    *.map)  ct="application/json" ;;
    *.svg)  ct="image/svg+xml" ;;
    *)      ct="application/octet-stream" ;;
  esac
  echo "  PUT $key"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "$BUCKET/$key" \
    --file "$file" --content-type "$ct" -c "$TOML" --remote
done

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

# After successful wrangler deploy: record in Supabase (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.cloudflare)
# If POST returns 400, add missing columns on build_deploy_events (e.g. git_message, environment, started_at, duration_ms).
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "→ Recording deploy in Supabase build_deploy_events..."
  DEPLOY_ID="deploy_$(date +%s)"
  CREATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  TRIGGER_SRC="${TRIGGER_SOURCE:-manual}"
  PAYLOAD="$(jq -n \
    --arg id "$DEPLOY_ID" \
    --arg ws "ws_inneranimalmedia" \
    --arg tid "tenant_sam_primeaux" \
    --arg ts "$TRIGGER_SRC" \
    --arg sha "$GIT_FULL_SHA" \
    --arg branch "$BRANCH_NAME" \
    --arg wv "${WORKER_VERSION_ID:-}" \
    --arg gmsg "$GIT_MSG_LINE" \
    --arg env "$DEPLOY_ENV" \
    --arg by "$DEPLOYED_BY" \
    --arg started "$DEPLOY_STARTED_AT" \
    --arg created "$CREATED_AT" \
    --argjson dur "$DEPLOY_DURATION_MS" \
    '{
      id: $id,
      workspace_id: $ws,
      tenant_id: $tid,
      event_type: "deploy",
      trigger_source: $ts,
      script_name: "inneranimalmedia",
      git_commit_sha: $sha,
      git_branch: $branch,
      git_message: $gmsg,
      status: "success",
      environment: $env,
      deployed_by: $by,
      started_at: $started,
      duration_ms: $dur,
      created_at: $created,
      worker_version_id: (if ($wv | length) == 0 then null else $wv end)
    }')"
  curl -s -X POST "$SUPABASE_URL/rest/v1/build_deploy_events" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" | jq .
else
  echo "⚠️  Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.cloudflare"
  echo "    These are needed for build_deploy_events Supabase sync on deploy."
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

echo "→ Sending deploy notification (POST /api/email/send)..."
NOTIFY_JSON="$(jq -n \
  --arg to "info@inneranimals.com" \
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
curl -sS -X POST "https://inneranimalmedia.com/api/email/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${INTERNAL_API_SECRET:-}" \
  -d "$NOTIFY_JSON"

echo "✓ Done (manifest + embeddings backfill + notification)"
