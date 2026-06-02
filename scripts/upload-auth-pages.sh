#!/usr/bin/env bash
# Upload version-controlled public auth shells to production R2 (ASSETS binding).
# Source of truth: static/pages/auth/{login,signup}.html
# Worker serves: pages/auth/login.html, pages/auth/signup.html (no Worker redeploy needed).
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

upload_one "pages/auth/login.html" "static/pages/auth/login.html"
upload_one "pages/auth/signup.html" "static/pages/auth/signup.html"

echo "✓ Auth pages uploaded to R2 (live immediately at /auth/login and /auth/signup)"
