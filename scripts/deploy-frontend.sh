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
echo "✓ Done"

# Post-deploy: write analytics build record + send Resend notification
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FILE_COUNT=$(find "$DIST" -type f | wc -l | tr -d ' ')
TOTAL_KB=$(du -sk "$DIST" | cut -f1)
VERSION_ID="b1bdcb2b-3442-4739-9127-0f3b7b9297e4"  # update via wrangler output

BUILD_RECORD=$(cat <<JSON
{
  "timestamp": "$TIMESTAMP",
  "git_hash": "$GIT_HASH",
  "git_message": "$GIT_MSG",
  "file_count": $FILE_COUNT,
  "total_size_kb": $TOTAL_KB,
  "version_id": "$VERSION_ID",
  "environment": "production",
  "deployer": "$(whoami)"
}
JSON
)

echo "$BUILD_RECORD" > /tmp/build-record.json

echo "→ Writing analytics build record to R2..."
./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
  "inneranimalmedia/analytics/app-builds/${TIMESTAMP}.json" \
  --file /tmp/build-record.json \
  --content-type application/json \
  -c wrangler.production.toml --remote

echo "→ Sending deploy notification via Resend..."
curl -s -X POST "https://inneranimalmedia.com/api/email/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"info@inneranimals.com\",
    \"subject\": \"[Agent Sam] Deploy ${GIT_HASH} → prod\",
    \"html\": \"<h2>Deploy Complete</h2><p><b>Commit:</b> ${GIT_HASH} — ${GIT_MSG}</p><p><b>Files synced:</b> ${FILE_COUNT}</p><p><b>Bundle size:</b> ${TOTAL_KB}KB</p><p><b>Version:</b> ${VERSION_ID}</p><p><b>Time:</b> ${TIMESTAMP}</p>\"
  }"

echo "✓ Analytics + notification done"
