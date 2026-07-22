#!/usr/bin/env bash
# launchd / manual entrypoint for Phase 1 profiler (lives in main IAM repo).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
elif [[ -f "$REPO_ROOT/.env.cloudflare" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env.cloudflare"
  set +a
fi

PY="${ROOT}/venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "[run_daily] missing venv — create with: cd tools/ml && ~/.local/bin/python3.12 -m venv venv && venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

LOG_DIR="${HOME}/Library/Logs"
mkdir -p "$LOG_DIR" "$ROOT/snapshots"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
echo "[run_daily] start ${STAMP}" | tee -a "${LOG_DIR}/inneranimalmedia-ml-profiler.log"

"$PY" "$ROOT/profiler.py" "$@" 2>&1 | tee -a "${LOG_DIR}/inneranimalmedia-ml-profiler.log"
echo "[run_daily] done $(date -u +%Y%m%dT%H%M%SZ)" | tee -a "${LOG_DIR}/inneranimalmedia-ml-profiler.log"
