#!/usr/bin/env bash
# Upload marketing CMS template shells + runtime assets to production R2.
# Source of truth: static/pages/marketing/{london-train,bridge-fly}/*
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TOML="wrangler.production.toml"
BUCKET="inneranimalmedia"

upload_html() {
  local key="$1"
  local file="$2"
  if [[ ! -f "$file" ]]; then
    echo "✗ Missing file: $file" >&2
    exit 1
  fi
  echo "→ Uploading $file → $BUCKET/$key"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="text/html; charset=utf-8" \
    --remote \
    -c "$TOML"
}

upload_asset() {
  local key="$1"
  local file="$2"
  local ctype="$3"
  if [[ ! -f "$file" ]]; then
    echo "✗ Missing file: $file" >&2
    exit 1
  fi
  echo "→ Uploading $file → $BUCKET/$key"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
    --file="$file" \
    --content-type="$ctype" \
    --remote \
    -c "$TOML"
}

upload_html "static/pages/marketing/london-train/index.html" "static/pages/marketing/london-train/index.html"
upload_html "static/pages/marketing/bridge-fly/index.html" "static/pages/marketing/bridge-fly/index.html"

upload_asset "marketing/london-train/styles.css" "static/pages/marketing/london-train/styles.css" "text/css; charset=utf-8"
upload_asset "marketing/london-train/main.js" "static/pages/marketing/london-train/main.js" "text/javascript; charset=utf-8"
upload_asset "marketing/bridge-fly/app.js" "static/pages/marketing/bridge-fly/app.js" "text/javascript; charset=utf-8"
upload_asset "marketing/bridge-fly/app.css" "static/pages/marketing/bridge-fly/app.css" "text/css; charset=utf-8"

echo "✓ Marketing template shells uploaded (template source keys + /assets/marketing/* runtime assets)"
