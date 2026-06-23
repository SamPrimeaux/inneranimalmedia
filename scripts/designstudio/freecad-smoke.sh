#!/usr/bin/env bash
# Headless FreeCAD smoke — runs a tiny Python script (not --version, which can SIGSEGV).
set -euo pipefail
SCRIPT_SELF="${BASH_SOURCE[0]:-}"
if [[ -n "$SCRIPT_SELF" && -f "$SCRIPT_SELF" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SELF")" && pwd)"
  # shellcheck source=lib.sh
  source "$SCRIPT_DIR/lib.sh"
  FC=$(resolve_freecad)
else
  FC="${FREECAD_BIN:-/usr/local/bin/FreeCADCmd}"
fi
if [[ -z "$FC" ]]; then
  echo "FreeCAD CLI not found. Install via install-freecad-appimage.sh --remote-apt" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SMOKE="$TMP/smoke.py"
OUT="$TMP/output.stl"

cat >"$SMOKE" <<PY
import Part
shape = Part.makeBox(10, 10, 10)
shape.exportStl("${OUT}")
print("freecad_stl_ok")
PY

export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-offscreen}"
if [[ -n "${SCRIPT_DIR:-}" && -f "${SCRIPT_DIR}/run-freecad.sh" ]]; then
  bash "$SCRIPT_DIR/run-freecad.sh" "$SMOKE" >/dev/null
else
  timeout 120 xvfb-run -a "$FC" "$SMOKE" >/dev/null
fi

if [[ ! -f "$OUT" ]]; then
  echo "FreeCAD smoke failed: no STL at $OUT" >&2
  exit 1
fi

bytes="$(wc -c <"$OUT" | tr -d ' ')"
echo "OK: FreeCAD headless STL (${bytes} bytes) via $FC"
