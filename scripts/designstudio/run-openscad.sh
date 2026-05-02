#!/usr/bin/env bash
# Usage: run-openscad.sh input.scad output.stl
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

[[ $# -ge 2 ]] || { echo "usage: $0 input.scad output.stl" >&2; exit 1; }
IN="$1"
OUT="$2"
[[ -f "$IN" ]] || { echo "not found: $IN" >&2; exit 1; }

os=$(resolve_openscad)
[[ -n "$os" ]] || { echo "openscad not found; set OPENSCAD_BIN or install OpenSCAD" >&2; exit 1; }

exec "$os" -o "$OUT" "$IN"
