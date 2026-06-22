#!/usr/bin/env bash
# Upload /about page shell + scroll-earth scene assets to production R2 (ASSETS binding).
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

upload_html "pages/about/index.html" "static/pages/about/index.html"

SCENE_DIR="static/assets/scenes/about-earth"
for f in about-earth.css spline.js scroll.js; do
  case "$f" in
    *.css) upload_asset "scenes/about-earth/$f" "$SCENE_DIR/$f" "text/css; charset=utf-8" ;;
    *)     upload_asset "scenes/about-earth/$f" "$SCENE_DIR/$f" "text/javascript; charset=utf-8" ;;
  esac
done

echo "✓ About page + earth scene uploaded (live at /about)"
