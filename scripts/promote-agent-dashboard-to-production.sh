#!/usr/bin/env bash
# Promote agent shell + Vite bundle from repo to production R2 (inneranimalmedia bucket, dashboard/app/ prefix).
# Does NOT deploy the Worker. Sam must type deploy approved before any wrangler deploy.
#
# Usage:
#   PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh
#
# Steps:
#   1. npm run build in agent-dashboard/
#   2. wrangler r2 object put -> inneranimalmedia/dashboard/app/agent.html, agent-dashboard.js, agent-dashboard.css
#   3. Additional chunks/assets from dist/ -> inneranimalmedia/dashboard/app/<filename>
#
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="wrangler.production.toml"
WRAP=(./scripts/with-cloudflare-env.sh npx wrangler r2 object put)
BUCKET_KEY_PREFIX="inneranimalmedia/dashboard/app"
DIST_DIR="dashboard/dist"

if [[ "${PROMOTE_OK:-}" != "1" ]]; then
  echo "Refusing to upload to production without PROMOTE_OK=1." >&2
  echo "  PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh" >&2
  exit 1
fi

echo "Building agent-dashboard..."
npm run build:vite-only

echo "Uploading dashboard app bundle to inneranimalmedia (dashboard/app/)..."
"${WRAP[@]}" "${BUCKET_KEY_PREFIX}/agent.html" --file=dashboard/dist/index.html --content-type='text/html; charset=utf-8' --remote -c "$CONFIG"
"${WRAP[@]}" "${BUCKET_KEY_PREFIX}/agent-dashboard.js" --file=dashboard/dist/agent-dashboard.js --content-type='application/javascript; charset=utf-8' --remote -c "$CONFIG"
"${WRAP[@]}" "${BUCKET_KEY_PREFIX}/agent-dashboard.css" --file=dashboard/dist/agent-dashboard.css --content-type='text/css; charset=utf-8' --remote -c "$CONFIG"

if [[ -d "$DIST_DIR" ]]; then
  while IFS= read -r -d '' f; do
    base="$(basename "$f")"
    case "$base" in
      agent-dashboard.js|agent-dashboard.css) continue ;;
    esac
    ct="application/octet-stream"
    [[ "$base" == *.js ]] && ct="application/javascript; charset=utf-8"
    [[ "$base" == *.css ]] && ct="text/css; charset=utf-8"
    [[ "$base" == *.map ]] && ct="application/json; charset=utf-8"
    echo "  + ${BUCKET_KEY_PREFIX}/${base}"
    "${WRAP[@]}" "${BUCKET_KEY_PREFIX}/${base}" --file="$f" --content-type="$ct" --remote -c "$CONFIG"
  done < <(find "$DIST_DIR" -type f \( -name '*.js' -o -name '*.css' -o -name '*.map' \) -print0 2>/dev/null)
fi

echo "Done. R2 updated. If worker.js routing changed, run deploy only after Sam types: deploy approved"
