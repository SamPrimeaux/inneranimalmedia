#!/usr/bin/env bash
# Upload stock GLB poster WebPs to R2 (glb/posters/*.webp).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
PREFIX="glb/posters"
SRC="$REPO_ROOT/public/assets/glb/posters"

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

if [ ! -d "$SRC" ]; then
  echo "✗ Missing $SRC — run: node scripts/designstudio/generate-stock-glb-posters.mjs"
  exit 1
fi

echo "Uploading stock GLB posters to R2…"
for webp in "$SRC"/*.webp; do
  [ -f "$webp" ] || continue
  base="$(basename "$webp")"
  echo "→ put ${BUCKET}/${PREFIX}/${base}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${PREFIX}/${base}" \
    --file "$webp" \
    --content-type "image/webp" \
    --config "$CONFIG" \
    --remote
done

if [ -f "$SRC/manifest.json" ]; then
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${PREFIX}/manifest.json" \
    --file "$SRC/manifest.json" \
    --content-type "application/json; charset=utf-8" \
    --config "$CONFIG" \
    --remote
fi

echo "✓ Posters at https://inneranimalmedia.com/assets/${PREFIX}/"
