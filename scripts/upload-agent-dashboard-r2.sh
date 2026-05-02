#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f ".env.cloudflare" ]]; then
  set -o allexport && source .env.cloudflare && set +o allexport
fi

BUCKET="agent-sam-sandbox-cicd"
CFG="wrangler.jsonc"
DIST="dashboard/dist"
PREFIX="static/dashboard/agent"
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

echo "Building..."
npm run build:vite-only

echo "Uploading dist to $BUCKET/$PREFIX/"
find "$DIST" -type f ! -name ".deploy-manifest" ! -name ".DS_Store" | sort | while read -r f; do
  rel="${f#$DIST/}"
  ct=$(ctype "$rel")
  echo "  $rel"
  "${W[@]}" r2 object put "$BUCKET/$PREFIX/$rel" \
    --file "$f" --content-type "$ct" \
    --remote -c "$CFG"
done

echo "Uploading SPA shell to $BUCKET/static/dashboard/agent.html"
"${W[@]}" r2 object put "$BUCKET/static/dashboard/agent.html" \
  --file "$DIST/index.html" --content-type "text/html" \
  --remote -c "$CFG"

echo "Uploading shell.css"
"${W[@]}" r2 object put "$BUCKET/static/dashboard/shell.css" \
  --file "static/dashboard/shell.css" --content-type "text/css" \
  --remote -c "$CFG"

echo "Done."
