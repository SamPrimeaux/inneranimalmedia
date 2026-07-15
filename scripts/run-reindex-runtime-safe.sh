#!/usr/bin/env bash
# Long-running runtime CODE lane reindex with:
#   - caffeinate (keeps Mac awake while this script's subtree runs)
#   - auto-restart on crash / sleep-kill until checkpoint completes
#   - --resume built into the Node script (hash + local .scratch checkpoint)
#
# Usage:
#   npm run run:reindex_runtime:safe
#   ./scripts/run-reindex-runtime-safe.sh
#   ./scripts/run-reindex-runtime-safe.sh --fresh          # wipe checkpoint, start over
#   ./scripts/run-reindex-runtime-safe.sh --runtime-prefix=src/do
#
# Stop permanently: Ctrl-C twice within ~15s, or: touch .scratch/STOP_REINDEX_RUNTIME
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

STOP_FILE="$REPO_ROOT/.scratch/STOP_REINDEX_RUNTIME"
MAX_RESTARTS="${MAX_REINDEX_RESTARTS:-80}"
SLEEP_BETWEEN="${REINDEX_RESTART_SLEEP_SEC:-15}"

EXTRA_ARGS=("$@")
# Always pass --runtime unless caller already did
has_runtime=0
for a in "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"; do
  if [[ "$a" == "--runtime" || "$a" == --runtime-prefix=* ]]; then
    has_runtime=1
    break
  fi
done
if [[ "$has_runtime" -eq 0 ]]; then
  EXTRA_ARGS=(--runtime "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}")
fi

mkdir -p "$REPO_ROOT/.scratch"
rm -f "$STOP_FILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[reindex-runtime:safe] caffeinate + auto-resume/restart"
echo "  stop:   Ctrl-C twice quickly, or: touch $STOP_FILE"
echo "  fresh:  pass --fresh to wipe .scratch checkpoint"
echo "  max restarts: $MAX_RESTARTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

attempt=0
while true; do
  if [[ -f "$STOP_FILE" ]]; then
    echo "[reindex-runtime:safe] STOP file present — exiting"
    exit 0
  fi

  attempt=$((attempt + 1))
  echo ""
  echo "[reindex-runtime:safe] attempt ${attempt}/${MAX_RESTARTS} @ $(date '+%Y-%m-%d %H:%M:%S')"

  set +e
  # -d display sleep, -i idle sleep, -m disk sleep, -s system sleep (while process runs)
  caffeinate -dims \
    ./scripts/with-cloudflare-env.sh \
    node scripts/reindex_codebase_dashboard_agent.mjs \
    "${EXTRA_ARGS[@]}"
  code=$?
  set -e

  if [[ "$code" -eq 0 ]]; then
    echo "[reindex-runtime:safe] completed successfully"
    # Email + receipt: summary + smart next steps (skip with SKIP_REINDEX_NOTIFY=1)
    ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs --status=completed || \
      echo "[reindex-runtime:safe] notify failed (non-fatal)" >&2
    exit 0
  fi

  # 78 = commit-pin abort / failed_partial checkpoint — do not thrash restarts
  if [[ "$code" -eq 78 ]]; then
    echo "[reindex-runtime:safe] terminal exit 78 (commit pin / abandoned run) — not restarting" >&2
    ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs --status=failed --exit-code="$code" || true
    exit 78
  fi

  if [[ -f "$STOP_FILE" ]]; then
    echo "[reindex-runtime:safe] STOP file set after exit $code — stopping"
    ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs --status=stopped --exit-code="$code" || true
    exit "$code"
  fi

  if [[ "$attempt" -ge "$MAX_RESTARTS" ]]; then
    echo "[reindex-runtime:safe] hit MAX_RESTARTS=$MAX_RESTARTS (last exit $code)" >&2
    ./scripts/with-cloudflare-env.sh node scripts/notify-reindex-runtime.mjs --status=failed --exit-code="$code" || true
    exit "$code"
  fi

  echo "[reindex-runtime:safe] exited $code — resume in ${SLEEP_BETWEEN}s (checkpoint will skip finished files)"
  sleep "$SLEEP_BETWEEN"
done
