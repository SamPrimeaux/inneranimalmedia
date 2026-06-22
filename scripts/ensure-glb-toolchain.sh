#!/usr/bin/env bash
# Ensure sharp + @gltf-transform/cli are installed locally (no global -g required).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

glb_toolchain_missing() {
  [[ ! -x "$REPO_ROOT/node_modules/.bin/gltf-transform" ]] && return 0
  [[ ! -d "$REPO_ROOT/node_modules/sharp" ]] && return 0
  return 1
}

ensure_glb_toolchain() {
  if ! glb_toolchain_missing; then
    return 0
  fi
  echo "[ensure-glb-toolchain] installing @gltf-transform/cli + sharp (local, with sharp scripts)" >&2
  NODE_ENV=development npm install --prefix "$REPO_ROOT" --no-audit --no-fund
  if command -v npm >/dev/null 2>&1 && npm approve-scripts --help >/dev/null 2>&1; then
    npm approve-scripts sharp --prefix "$REPO_ROOT" 2>/dev/null || true
  fi
  if glb_toolchain_missing; then
    echo "[ensure-glb-toolchain] ✗ gltf-transform or sharp still missing" >&2
    return 1
  fi
  echo "[ensure-glb-toolchain] ✓ gltf-transform + sharp OK" >&2
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  ensure_glb_toolchain
fi
