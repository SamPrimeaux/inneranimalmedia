#!/usr/bin/env bash
# Usage: run-blender-glb.sh input.stl output.glb
# Delegates to stl-to-glb.py (Blender batch).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -ge 2 ]] || { echo "usage: $0 input.stl output.glb" >&2; exit 1; }
exec python3 "$SCRIPT_DIR/stl-to-glb.py" "$1" "$2"
