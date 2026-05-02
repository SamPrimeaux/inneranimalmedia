#!/usr/bin/env bash
# Minimal OpenSCAD → STL → GLB in a temp dir (requires openscad, blender, python3).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat >"$TMP/smoke.scad" <<'EOF'
// Design Studio smoke test
cube([10, 10, 10], center = true);
EOF

os=$(resolve_openscad)
[[ -n "$os" ]] || { echo "openscad missing"; exit 1; }

"$SCRIPT_DIR/run-openscad.sh" "$TMP/smoke.scad" "$TMP/smoke.stl"
# Omit blender path so stl-to-glb.py can pick BLENDER_BIN or macOS .app bundle
python3 "$SCRIPT_DIR/stl-to-glb.py" "$TMP/smoke.stl" "$TMP/smoke.glb"
echo "OK: $TMP/smoke.glb ($(wc -c <"$TMP/smoke.glb" | tr -d ' ') bytes)"
