#!/usr/bin/env bash
# Workers Builds deploy step — use pinned wrangler from package-lock and retry transient 100146.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONFIG="${CF_BUILDS_WRANGLER_CONFIG:-wrangler.production.toml}"
MAX_ATTEMPTS="${CF_BUILDS_DEPLOY_ATTEMPTS:-3}"
SLEEP_SECS="${CF_BUILDS_DEPLOY_RETRY_SLEEP:-8}"

attempt=1
while [[ "$attempt" -le "$MAX_ATTEMPTS" ]]; do
  echo "[cf-builds-deploy] attempt ${attempt}/${MAX_ATTEMPTS}: wrangler deploy -c ${CONFIG}"
  log_file="$(mktemp)"
  if npm exec -- wrangler deploy -c "$CONFIG" 2>&1 | tee "$log_file"; then
    rm -f "$log_file"
    exit 0
  fi

  if grep -qE '100146|Worker version could not be found' "$log_file"; then
    echo "[cf-builds-deploy] transient 100146 — retrying in ${SLEEP_SECS}s…" >&2
    rm -f "$log_file"
    sleep "$SLEEP_SECS"
    attempt=$((attempt + 1))
    continue
  fi

  rm -f "$log_file"
  exit 1
done

echo "[cf-builds-deploy] failed after ${MAX_ATTEMPTS} attempts" >&2
exit 1
