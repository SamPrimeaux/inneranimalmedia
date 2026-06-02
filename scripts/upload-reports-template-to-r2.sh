#!/usr/bin/env bash
# Sync repo reports/template/ → R2 inneranimalmedia/reports/template/
# Run after editing HTML/CSS/render.py so production template matches repo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${WRANGLER_CONFIG:-$REPO_ROOT/wrangler.production.toml}"
BUCKET="${R2_BUCKET:-inneranimalmedia}"
PREFIX="reports/template"
SOURCE="$REPO_ROOT/reports/template"

if [ ! -d "$SOURCE" ]; then
  echo "Missing $SOURCE" >&2
  exit 1
fi

content_type_for() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.css) echo "text/css; charset=utf-8" ;;
    *.js) echo "application/javascript; charset=utf-8" ;;
    *.py) echo "text/plain; charset=utf-8" ;;
    *.md) echo "text/markdown; charset=utf-8" ;;
    *) echo "application/octet-stream" ;;
  esac
}

echo "Uploading $SOURCE → r2://${BUCKET}/${PREFIX}/"
uploaded=0
while IFS= read -r -d '' file; do
  rel="${file#"$SOURCE"/}"
  key="${PREFIX}/${rel}"
  ct="$(content_type_for "$file")"
  echo "  PUT ${key}"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "$ct" \
    --config "$CONFIG" \
    --remote
  uploaded=$((uploaded + 1))
done < <(find "$SOURCE" -type f ! -name '.DS_Store' -print0)

echo "Done. Uploaded $uploaded files to r2://${BUCKET}/${PREFIX}/"
