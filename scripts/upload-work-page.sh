#!/usr/bin/env bash
# Upload /work page shell + scroll-globe scene assets to production R2 (ASSETS binding).
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

upload_html "pages/work/index.html" "static/pages/work/index.html"

# Worker /assets/* passthrough strips the prefix: URL /assets/scenes/... → R2 key scenes/...
SCENE_DIR="static/assets/scenes/work-globe"
for f in work-globe.css globe.js scroll.js charts.js; do
  case "$f" in
    *.css) upload_asset "scenes/work-globe/$f" "$SCENE_DIR/$f" "text/css; charset=utf-8" ;;
    *)     upload_asset "scenes/work-globe/$f" "$SCENE_DIR/$f" "text/javascript; charset=utf-8" ;;
  esac
done

echo "✓ Work page + globe scene uploaded (live at /work)"
