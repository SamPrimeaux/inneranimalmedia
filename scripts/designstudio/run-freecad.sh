#!/usr/bin/env bash
# Run a FreeCAD Python script headless (FreeCADCmd or AppImage wrapper).
# Usage: run-freecad.sh input.py
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

INPUT="${1:-}"
if [[ -z "$INPUT" || ! -f "$INPUT" ]]; then
  echo "Usage: run-freecad.sh path/to/script.py" >&2
  exit 1
fi

FC=$(resolve_freecad)
if [[ -z "$FC" ]]; then
  echo "freecad_not_found: set FREECAD_BIN or install AppImage via scripts/designstudio/install-freecad-appimage.sh" >&2
  exit 1
fi

export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}"
XVFB_SCREEN='-screen 0 1280x720x24 +extension GLX'

run_freecad() {
  if [[ "$FC" == *.AppImage ]]; then
    exec "$FC" FreeCADCmd "$INPUT"
  fi
  exec "$FC" "$INPUT"
}

# Wrapper at /usr/local/bin/FreeCADCmd already uses xvfb-run when installed via install script.
if [[ "$FC" == /usr/local/bin/FreeCADCmd || "$FC" == /usr/local/bin/freecadcmd ]]; then
  run_freecad
fi

if command -v xvfb-run >/dev/null 2>&1; then
  if [[ "$FC" == *.AppImage ]]; then
    exec xvfb-run -a -s "$XVFB_SCREEN" env QT_QPA_PLATFORM="$QT_QPA_PLATFORM" "$FC" FreeCADCmd "$INPUT"
  fi
  exec xvfb-run -a -s "$XVFB_SCREEN" env QT_QPA_PLATFORM="$QT_QPA_PLATFORM" "$FC" "$INPUT"
fi

run_freecad
