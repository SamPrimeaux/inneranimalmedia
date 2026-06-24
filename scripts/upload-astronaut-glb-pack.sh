#!/usr/bin/env bash
# Upload astronaut GLB pack to production R2 (Worker: /assets/glb/astronaut/*).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
PREFIX="glb/astronaut"
SRC="$REPO_ROOT/public/assets/glb/astronaut"

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

if [ ! -d "$SRC" ]; then
  echo "✗ Missing $SRC — run: node scripts/astronaut-glb-merge-and-stage.mjs"
  exit 1
fi

put_file() {
  local key="$1"
  local file="$2"
  echo "→ put ${BUCKET}/${key}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${key}" \
    --file "$file" \
    --content-type "model/gltf-binary" \
    --config "$CONFIG" \
    --remote
}

echo "Uploading astronaut GLB pack to R2…"

for glb in "$SRC"/*_opt.glb; do
  [ -f "$glb" ] || continue
  base="$(basename "$glb")"
  put_file "${PREFIX}/${base}" "$glb"
done

if [ -f "$SRC/manifest.json" ]; then
  echo "→ put ${BUCKET}/${PREFIX}/manifest.json"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${PREFIX}/manifest.json" \
    --file "$SRC/manifest.json" \
    --content-type "application/json; charset=utf-8" \
    --config "$CONFIG" \
    --remote
fi

echo "✓ Live at https://inneranimalmedia.com/assets/${PREFIX}/"
echo "  Rig + clips: https://inneranimalmedia.com/assets/${PREFIX}/astronaut_rig_animations_opt.glb"
echo "  Texture body: https://inneranimalmedia.com/assets/${PREFIX}/astronaut_texture_opt.glb"
