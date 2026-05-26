#!/usr/bin/env bash
# Copy Design Studio stock GLBs from public R2 dev bucket into IAM ASSETS (inneranimalmedia).
# Run from repo root after: chmod +x scripts/sync-designstudio-glb-to-r2.sh
set -euo pipefail
[[ "$(basename "$(pwd)")" == "inneranimalmedia" ]] || { echo "Run from repo root"; exit 1; }

SRC_BASE="https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev"
TMP="${TMPDIR:-/tmp}/iam-designstudio-glb"
mkdir -p "$TMP"

declare -a PAIRS=(
  "inneranimalmediafooterglb.glb|glb/inneranimalmediafooterglb.glb"
  "Kinetic_Symmetry_0831084700_generate%20(1).glb|glb/Kinetic_Symmetry_0831084700_generate (1).glb"
  "Meshy_AI_Jet_in_Flight_0104205113_texture.glb|glb/Meshy_AI_Jet_in_Flight_0104205113_texture.glb"
)

for pair in "${PAIRS[@]}"; do
  src_file="${pair%%|*}"
  r2_key="${pair##*|}"
  local_name="$(basename "$r2_key")"
  out="$TMP/$local_name"
  echo "→ download $SRC_BASE/$src_file"
  curl -fsSL "$SRC_BASE/$src_file" -o "$out"
  echo "→ put $r2_key ($(wc -c <"$out") bytes)"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "inneranimalmedia/$r2_key" \
    --file "$out" \
    --content-type "model/gltf-binary" \
    -c wrangler.production.toml \
    --remote
done

echo "✓ Design Studio GLBs synced to ASSETS bucket"
