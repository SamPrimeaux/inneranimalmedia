#!/usr/bin/env bash
# Verify OpenSCAD, Blender, FreeCAD (optional), Python 3 — for developer machines.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ok=0
fail() { echo "  MISSING: $1"; ok=1; }

os=$(resolve_openscad)
bl=$(resolve_blender)
fc=$(resolve_freecad)

echo "Design Studio local toolchain"
echo "-------------------------------"
if [[ -n "$os" ]]; then echo "OpenSCAD: $("$os" --version 2>&1 | head -1)"; else fail "OpenSCAD (set OPENSCAD_BIN or install)"; fi
if [[ -n "$bl" ]]; then echo "Blender:   $("$bl" --version 2>&1 | head -1)"; else fail "Blender (set BLENDER_BIN or install)"; fi
if [[ -n "$fc" ]]; then echo "FreeCAD:  $($fc --version 2>&1 | head -1)"; else echo "FreeCAD:  (optional, not found)"; fi
if command -v python3 >/dev/null 2>&1; then echo "Python3:  $(python3 --version)"; else fail "python3"; fi

exit "$ok"
