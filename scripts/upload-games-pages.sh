#!/usr/bin/env bash
# Upload version-controlled public games shells to production R2 (ASSETS binding).
# Source of truth: static/pages/games/{index,room}.html
# Worker serves: pages/games/index.html, pages/games/room.html (no Worker redeploy for HTML-only).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TOML="wrangler.production.toml"
BUCKET="inneranimalmedia"

upload_one() {
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

upload_one "pages/games/index.html" "static/pages/games/index.html"
upload_one "pages/games/room.html" "static/pages/games/room.html"

echo "✓ Games pages uploaded to R2 (live at /games and /games/room_*)"
