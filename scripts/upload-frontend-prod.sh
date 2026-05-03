#!/usr/bin/env bash
# Upload dashboard/dist to production R2 (agent-sam). Run after build.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DIST="dashboard/dist"
BUCKET="inneranimalmedia"
PREFIX="static/dashboard/agent"
TOML="wrangler.production.toml"

echo "Building frontend..."
npm run build:vite-only

echo "Running pre-deploy secret scan..."
SCAN_HITS=$(grep -rE \
  'sk_live_[a-zA-Z0-9]{90,}|cfut_[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9-]{80,}|iam-bridge-[a-zA-Z0-9]{20,}' \
  "$DIST" 2>/dev/null | wc -l | tr -d ' ')

if [ "$SCAN_HITS" -gt "0" ]; then
  echo "SECURITY ABORT: $SCAN_HITS potential secret(s) detected in bundle."
  echo "Run: grep -rE 'sk_live_|cfut_|sk-ant-|iam-bridge-' $DIST"
  echo "Deploy aborted. Fix exposures before uploading."
  exit 1
fi
echo "Bundle scan clean. Proceeding with upload."

echo "Syncing dist to R2 $BUCKET/$PREFIX ..."
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

echo "Done."
