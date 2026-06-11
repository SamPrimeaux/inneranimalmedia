#!/usr/bin/env bash
# Upload version-controlled contact page shell to production R2 (ASSETS binding).
# CMS copy (hero, paths, collaborate) is hydrated from D1 cms_page_sections at request time.
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

upload_one "pages/contact/index.html" "static/pages/contact/index.html"

echo "✓ Contact page uploaded to R2 (live at /contact; CMS sections from D1)"
