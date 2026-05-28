#!/usr/bin/env bash
# Wrapper: load Cloudflare env when zsh wrapper unavailable, run audit vectorize pipeline.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

exec python3 "${REPO_ROOT}/scripts/ingest_dashboard_agent_audit_vectorize.py" "$@"
