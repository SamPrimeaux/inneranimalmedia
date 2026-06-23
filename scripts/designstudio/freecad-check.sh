#!/usr/bin/env bash
# Verify FreeCADCmd / freecadcmd on PATH (Python smoke — not --version).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

fc=$(resolve_freecad)
if [[ -z "$fc" ]]; then
  echo "FreeCAD CLI not found (optional). Install FreeCAD or set FREECAD_BIN."
  exit 1
fi

smoke="$(mktemp /tmp/freecad_check.XXXXXX.py)"
trap 'rm -f "$smoke"' EXIT
printf '%s\n' 'print("freecad_check_ok")' >"$smoke"

export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
bash "$SCRIPT_DIR/run-freecad.sh" "$smoke" | grep -q freecad_check_ok
echo "OK: $fc"
