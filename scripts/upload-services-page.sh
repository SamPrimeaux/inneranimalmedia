#!/usr/bin/env bash
# Upload version-controlled /services shell to production R2 (ASSETS binding).
# Source of truth: static/pages/services.html
# Worker serves: pages/services/index.html (no Worker redeploy for HTML-only).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TOML="wrangler.production.toml"
BUCKET="inneranimalmedia"
FILE="static/pages/services.html"
KEY="pages/services/index.html"

if [[ ! -f "$FILE" ]]; then
  echo "✗ Missing file: $FILE" >&2
  exit 1
fi

echo "→ Uploading $FILE → $BUCKET/$KEY"
./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${KEY}" \
  --file="$FILE" \
  --content-type="text/html; charset=utf-8" \
  --remote \
  -c "$TOML"

echo "✓ Services page uploaded to R2 (live at /services)"
