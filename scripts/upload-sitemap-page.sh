#!/usr/bin/env bash
# Upload human-readable sitemap to R2 ASSETS (optional; Worker bundles HTML as fallback).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="${WRANGLER_CONFIG:-wrangler.production.toml}"
HTML="static/pages/sitemap/index.html"
R2_KEY="pages/sitemap/index.html"

if [[ ! -f "$HTML" ]]; then
  echo "Missing $HTML" >&2
  exit 1
fi

echo "Uploading $HTML → inneranimalmedia/$R2_KEY"
./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/${R2_KEY}" \
  -f "$HTML" \
  --content-type="text/html; charset=utf-8" \
  --remote \
  -c "$CONFIG"
echo "OK: sitemap page on R2"
