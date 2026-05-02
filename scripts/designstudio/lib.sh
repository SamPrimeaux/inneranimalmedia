#!/usr/bin/env bash
# Shared paths for Design Studio scripts (source from other scripts: source "$(dirname "$0")/lib.sh")
set -euo pipefail

DESIGNSTUDIO_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DESIGNSTUDIO_SCRIPT_DIR/../.." && pwd)"

# Override with env if tools are not on PATH
: "${OPENSCAD_BIN:=}"
: "${BLENDER_BIN:=}"
: "${FREECAD_BIN:=}"

resolve_openscad() {
  if [[ -n "${OPENSCAD_BIN}" && -x "${OPENSCAD_BIN}" ]]; then echo "${OPENSCAD_BIN}"; return; fi
  command -v openscad 2>/dev/null || true
}

resolve_blender() {
  if [[ -n "${BLENDER_BIN}" && -x "${BLENDER_BIN}" ]]; then echo "${BLENDER_BIN}"; return; fi
  command -v blender 2>/dev/null || true
}

resolve_freecad() {
  if [[ -n "${FREECAD_BIN}" && -x "${FREECAD_BIN}" ]]; then echo "${FREECAD_BIN}"; return; fi
  command -v FreeCADCmd 2>/dev/null || command -v freecadcmd 2>/dev/null || true
}
