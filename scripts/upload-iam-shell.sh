#!/usr/bin/env bash
# Upload shared IAM chrome (header/footer) to production R2 for HTMLRewriter injection.
# Source of truth: static/src/components/iam-header.html
# Worker injects into marketing HTML via src/index.js (skipShellInject pages excluded).
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

upload_one "src/components/iam-header.html" "static/src/components/iam-header.html"

echo "✓ IAM header uploaded to R2 (injected on pages that use iam shell)"
