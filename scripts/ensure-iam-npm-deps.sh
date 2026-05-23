#!/usr/bin/env bash
# Ensure dashboard vite + root deploy tooling exist (devDependencies skipped when NODE_ENV=production).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

iam_npm_deps_missing() {
  [[ ! -f "$REPO_ROOT/dashboard/node_modules/vite/package.json" ]] && return 0
  [[ ! -d "$REPO_ROOT/node_modules/aws4fetch" ]] && return 0
  return 1
}

ensure_iam_npm_deps() {
  if ! iam_npm_deps_missing; then
    return 0
  fi
  echo "[ensure-iam-npm-deps] missing vite and/or aws4fetch — npm install with NODE_ENV=development" >&2
  NODE_ENV=development npm install --prefix "$REPO_ROOT/dashboard" --no-audit --no-fund
  NODE_ENV=development npm install --prefix "$REPO_ROOT" --no-audit --no-fund
  if iam_npm_deps_missing; then
    echo "[ensure-iam-npm-deps] ✗ deps still missing after install" >&2
    return 1
  fi
  echo "[ensure-iam-npm-deps] ✓ deps OK" >&2
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  ensure_iam_npm_deps
fi
