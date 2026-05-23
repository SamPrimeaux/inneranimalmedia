#!/usr/bin/env bash
# Run a command up to NODE_ENV_FALLBACK_MAX_ATTEMPTS times (default 3):
#   1 — current NODE_ENV (often production from ~/.env.inneranimal)
#   2+ — NODE_ENV=development (installs devDependencies; vite/aws4fetch available)
# Stops after 3 consecutive failures for inspection.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/ensure-iam-npm-deps.sh
source "$REPO_ROOT/scripts/ensure-iam-npm-deps.sh"

MAX_ATTEMPTS="${NODE_ENV_FALLBACK_MAX_ATTEMPTS:-3}"

if [[ $# -lt 1 ]]; then
  echo "usage: with-node-env-fallback.sh <command...>" >&2
  exit 2
fi

attempt=0
last_exit=1
initial_env="${NODE_ENV:-}"

while (( attempt < MAX_ATTEMPTS )); do
  attempt=$((attempt + 1))
  if (( attempt > 1 )); then
    export NODE_ENV=development
    ensure_iam_npm_deps || true
  fi

  if (( attempt == 1 )); then
    echo "[node-env-fallback] attempt 1/${MAX_ATTEMPTS}: NODE_ENV=${initial_env:-unset}" >&2
  else
    echo "[node-env-fallback] attempt ${attempt}/${MAX_ATTEMPTS}: NODE_ENV=development" >&2
  fi

  if "$@"; then
    if (( attempt > 1 )); then
      echo "[node-env-fallback] ✓ succeeded on attempt ${attempt} (NODE_ENV=development)" >&2
    fi
    exit 0
  fi
  last_exit=$?

  if (( attempt >= MAX_ATTEMPTS )); then
    echo "[node-env-fallback] ✗ failed after ${MAX_ATTEMPTS} consecutive attempts (exit ${last_exit}). Inspect output above." >&2
    exit "$last_exit"
  fi

  if (( attempt == 1 )); then
    echo "[node-env-fallback] attempt 1 failed (NODE_ENV=${initial_env:-unset}); retrying with NODE_ENV=development…" >&2
  else
    echo "[node-env-fallback] attempt ${attempt} failed; retrying…" >&2
  fi
done

exit "$last_exit"
