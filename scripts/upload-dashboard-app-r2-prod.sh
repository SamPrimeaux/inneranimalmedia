#!/usr/bin/env bash
# Production: upload Vite dashboard dist to R2 bucket inneranimalmedia (DASHBOARD binding).
# New canonical prefix: static/dashboard/app/
# HTML shell: static/dashboard/app.html (and optional static/dashboard/app/index.html)
#
# Does not delete existing objects. Does not touch learn/* course resources.
#
# Optional: mirror the same files to legacy static/dashboard/agent/ for transition:
#   UPLOAD_DASHBOARD_MIRROR_LEGACY_AGENT=1 ./scripts/upload-dashboard-app-r2-prod.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "$REPO_ROOT/.env.cloudflare" ]]; then
  set -o allexport && source "$REPO_ROOT/.env.cloudflare" && set +o allexport
fi

DIST="dashboard/dist"
BUCKET="inneranimalmedia"
PREFIX="static/dashboard/app"
TOML="wrangler.production.toml"
W=(./scripts/with-cloudflare-env.sh npx wrangler)

ctype() {
  case "$1" in
    *.js)    echo "application/javascript" ;;
    *.css)   echo "text/css" ;;
    *.html)  echo "text/html" ;;
    *.map)   echo "application/json" ;;
    *.woff2) echo "font/woff2" ;;
    *.woff)  echo "font/woff" ;;
    *.ttf)   echo "font/ttf" ;;
    *.svg)   echo "image/svg+xml" ;;
    *.json)  echo "application/json" ;;
    *.avif)  echo "image/avif" ;;
    *.png)   echo "image/png" ;;
    *)       echo "application/octet-stream" ;;
  esac
}

echo "→ Building dashboard (production)..."
npm run build:vite-only

echo "→ Pre-deploy secret scan on $DIST ..."
SCAN_HITS=$( (grep -rE \
  --exclude='*.map' \
  'sk_live_[a-zA-Z0-9]{24,}|cfut_[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9\-]{80,}|iam-bridge-[a-zA-Z0-9]{20,}|re_[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}|sk-proj-[a-zA-Z0-9\-_]{40,}' \
  "$DIST" 2>/dev/null || true) | wc -l | tr -d ' ')

if [[ "$SCAN_HITS" != "0" ]]; then
  echo "✗ SECURITY ABORT: $SCAN_HITS potential secret(s) in bundle." >&2
  exit 1
fi
echo "   Bundle scan clean."

echo "→ Uploading dist → r2://$BUCKET/$PREFIX/"
find "$DIST" -type f ! -name ".deploy-manifest" ! -name ".DS_Store" | sort | while read -r f; do
  rel="${f#$DIST/}"
  ct=$(ctype "$rel")
  echo "  $PREFIX/$rel"
  "${W[@]}" r2 object put "$BUCKET/$PREFIX/$rel" \
    --file "$f" --content-type "$ct" \
    --remote -c "$TOML"

  if [[ "${UPLOAD_DASHBOARD_MIRROR_LEGACY_AGENT:-}" == "1" ]]; then
    echo "  (mirror) static/dashboard/agent/$rel"
    "${W[@]}" r2 object put "$BUCKET/static/dashboard/agent/$rel" \
      --file "$f" --content-type "$ct" \
      --remote -c "$TOML"
  fi
done

echo "→ Uploading SPA shell → r2://$BUCKET/static/dashboard/app.html"
"${W[@]}" r2 object put "$BUCKET/static/dashboard/app.html" \
  --file "$DIST/index.html" --content-type "text/html" \
  --remote -c "$TOML"

echo "→ Uploading SPA shell copy → r2://$BUCKET/static/dashboard/app/index.html"
"${W[@]}" r2 object put "$BUCKET/static/dashboard/app/index.html" \
  --file "$DIST/index.html" --content-type "text/html" \
  --remote -c "$TOML"

if [[ "${UPLOAD_DASHBOARD_MIRROR_LEGACY_AGENT:-}" == "1" ]]; then
  echo "→ Mirror shell → r2://$BUCKET/static/dashboard/agent.html"
  "${W[@]}" r2 object put "$BUCKET/static/dashboard/agent.html" \
    --file "$DIST/index.html" --content-type "text/html" \
    --remote -c "$TOML"
fi

if [[ -f "$REPO_ROOT/static/dashboard/shell.css" ]]; then
  echo "→ Uploading global shell.css → r2://$BUCKET/static/dashboard/shell.css"
  "${W[@]}" r2 object put "$BUCKET/static/dashboard/shell.css" \
    --file "$REPO_ROOT/static/dashboard/shell.css" --content-type "text/css" \
    --remote -c "$TOML"
fi

echo "Done. Deploy Worker if src/core/dashboard-r2-assets.js or src/index.js changed."
echo "Legacy R2 keys under static/dashboard/agent/ were not deleted."
echo "Set UPLOAD_DASHBOARD_MIRROR_LEGACY_AGENT=1 to duplicate uploads to the legacy prefix."
