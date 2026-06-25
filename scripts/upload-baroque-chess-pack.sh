#!/usr/bin/env bash
# Upload Baroque chess GLB pack to R2 (glb/chess/baroque/*.glb).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
PREFIX="glb/chess/baroque"
SRC="$REPO_ROOT/public/assets/glb/chess/baroque"

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

if [ ! -d "$SRC" ]; then
  echo "✗ Missing $SRC"
  exit 1
fi

echo "Uploading Baroque chess pack to R2…"
for glb in "$SRC"/*.glb; do
  [ -f "$glb" ] || continue
  base="$(basename "$glb")"
  echo "→ put ${BUCKET}/${PREFIX}/${base}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${PREFIX}/${base}" \
    --file "$glb" \
    --content-type "model/gltf-binary" \
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

echo "✓ Baroque chess at ${CHESS_ASSETS_ORIGIN:-https://assets.inneranimalmedia.com}/${PREFIX}/"
