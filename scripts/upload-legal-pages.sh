#!/usr/bin/env bash
# Upload version-controlled legal pages to production R2 (ASSETS binding).
# Source of truth: static/pages/{privacy,terms}/index.html
# Worker serves: pages/privacy/index.html, pages/terms/index.html (no Worker redeploy needed).
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

upload_one "pages/privacy/index.html" "static/pages/privacy/index.html"
upload_one "pages/terms/index.html" "static/pages/terms/index.html"

echo "✓ Legal pages uploaded to R2 (live immediately at /privacy and /terms)"
