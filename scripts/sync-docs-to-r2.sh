#!/usr/bin/env bash
# sync-docs-to-r2.sh
# Uploads docs/ tree to R2 bucket inneranimalmedia under docs/.
# Run from repo root: ./scripts/sync-docs-to-r2.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_DIR="$REPO_ROOT/docs"
cd "$REPO_ROOT"
WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

echo "=== Syncing docs/ to R2 (inneranimalmedia/docs/) ==="
count=0

ctype_for() {
  case "$1" in
    *.md) echo "text/markdown" ;;
    *.html) echo "text/html" ;;
    *.css) echo "text/css" ;;
    *.js) echo "application/javascript" ;;
    *.json) echo "application/json" ;;
    *.sql) echo "application/sql" ;;
    *.txt) echo "text/plain" ;;
    *.svg) echo "image/svg+xml" ;;
    *.png) echo "image/png" ;;
    *.jpg|*.jpeg|*.JPG|*.JPEG) echo "image/jpeg" ;;
    *.webp) echo "image/webp" ;;
    *.pdf) echo "application/pdf" ;;
    *) echo "application/octet-stream" ;;
  esac
}

while IFS= read -r -d '' f; do
  rel="${f#$DOCS_DIR/}"
  key="docs/${rel}"
  ctype="$(ctype_for "$f")"
  echo "  Uploading ${key}..."
  "${WRANGLER[@]}" r2 object put "inneranimalmedia/${key}" \
    --file "$f" \
    --content-type "$ctype" \
    --remote -c wrangler.production.toml
  count=$((count + 1))
done < <(find "$DOCS_DIR" -type f ! -path '*/.*' -print0)

echo "Done — ${count} files synced to R2 inneranimalmedia/docs/"
