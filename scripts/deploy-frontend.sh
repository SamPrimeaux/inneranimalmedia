#!/bin/bash
set -e

DIST="dashboard/dist"
BUCKET="inneranimalmedia"
PREFIX="static/dashboard/agent"
TOML="wrangler.production.toml"

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
./scripts/with-cloudflare-env.sh npx wrangler deploy -c "$TOML"
echo "✓ Worker deployed"

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

# Post-deploy: Resend notification
GIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "unknown")
TOTAL_KB=$(du -sk "$DIST" | cut -f1)

echo "→ Sending deploy notification via Resend..."
curl -s -X POST "https://inneranimalmedia.com/api/email/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"info@inneranimals.com\",
    \"subject\": \"[Agent Sam] Deploy ${GIT_HASH} → prod\",
    \"html\": \"<h2>Deploy Complete</h2><p><b>Commit:</b> ${GIT_HASH} — ${GIT_MSG}</p><p><b>Files synced:</b> ${FILE_COUNT}</p><p><b>Bundle size:</b> ${TOTAL_KB} KB</p><p><b>Branch:</b> ${BRANCH}</p><p><b>Time:</b> ${TS}</p>\"
  }"

echo "✓ Done (manifest + notification)"
