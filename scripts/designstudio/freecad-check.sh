#!/usr/bin/env bash
# Optional: verify FreeCADCmd / freecadcmd on PATH.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

fc=$(resolve_freecad)
if [[ -z "$fc" ]]; then
  echo "FreeCAD CLI not found (optional). Install FreeCAD or set FREECAD_BIN."
  exit 1
fi
echo "OK: $fc"
exec "$fc" --version
