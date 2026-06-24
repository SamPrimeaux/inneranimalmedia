#!/usr/bin/env bash
# Upload astronaut pack: repo runtime rig (canonical) + optional R2-only archive variants.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
BUCKET="${IAM_R2_BUCKET:-inneranimalmedia}"
PREFIX="glb/astronaut"
SRC="$REPO_ROOT/public/assets/glb/astronaut"
RUNTIME_GLB="astronaut_rig_animations_opt.glb"
# Optional: Expansion archive optimized folder for R2-only singles (not committed to repo)
ARCHIVE_OPTIMIZED="${ASTRONAUT_ARCHIVE_OPTIMIZED:-/Volumes/Expansion/astronaut!-glb-scenes/Archive/optimized}"

WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

if [ ! -f "$SRC/$RUNTIME_GLB" ]; then
  echo "✗ Missing $SRC/$RUNTIME_GLB — run: node scripts/astronaut-glb-merge-and-stage.mjs"
  exit 1
fi

put_file() {
  local key="$1"
  local file="$2"
  local ct="${3:-model/gltf-binary}"
  echo "→ put ${BUCKET}/${key}"
  "${WRANGLER[@]}" r2 object put "${BUCKET}/${key}" \
    --file "$file" --content-type "$ct" --config "$CONFIG" --remote
}

echo "Uploading astronaut runtime rig (repo canonical)…"
put_file "${PREFIX}/${RUNTIME_GLB}" "$SRC/$RUNTIME_GLB"

if [ -f "$SRC/manifest.json" ]; then
  put_file "${PREFIX}/manifest.json" "$SRC/manifest.json" "application/json; charset=utf-8"
fi

if [ -d "$ARCHIVE_OPTIMIZED" ]; then
  echo "Uploading R2-only optimized variants from archive (not in repo)…"
  for glb in "$ARCHIVE_OPTIMIZED"/*_opt.glb; do
    [ -f "$glb" ] || continue
    base="$(basename "$glb")"
    if [ "$base" = "$RUNTIME_GLB" ]; then continue
    put_file "${PREFIX}/${base}" "$glb"
  done
fi

echo "✓ Runtime: https://inneranimalmedia.com/assets/${PREFIX}/${RUNTIME_GLB}"
echo "  Manifest: https://inneranimalmedia.com/assets/${PREFIX}/manifest.json"
