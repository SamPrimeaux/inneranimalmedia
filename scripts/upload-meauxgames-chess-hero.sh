#!/usr/bin/env bash
# Upload MeauxChess hero covers to production R2 (assets.inneranimalmedia.com).
# Source: public/assets/meauxgames/chess/
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TOML="wrangler.production.toml"
BUCKET="inneranimalmedia"
SRC_DIR="public/assets/meauxgames/chess"
R2_PREFIX="meauxgames/chess"

content_type() {
  case "$1" in
    *.avif) echo "image/avif" ;;
    *.webp) echo "image/webp" ;;
    *) echo "application/octet-stream" ;;
  esac
}

for file in "$SRC_DIR"/meauxgames-chess-hero-*.{avif,webp}; do
  [[ -f "$file" ]] || continue
  base="$(basename "$file")"
  ct="$(content_type "$base")"
  echo "→ Uploading $file → $BUCKET/$R2_PREFIX/$base"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${R2_PREFIX}/${base}" \
    --file="$file" \
    --content-type="$ct" \
    --remote \
    -c "$TOML"
done

echo "✓ MeauxChess hero images live at https://assets.inneranimalmedia.com/${R2_PREFIX}/"
