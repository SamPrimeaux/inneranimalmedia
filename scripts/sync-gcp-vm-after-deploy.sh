#!/usr/bin/env bash
# Post-deploy: keep iam-tunnel in sync with Mac (repo pull, env, ExecOS runtime).
#
# Wired into deploy:full, deploy:worker, and MCP deploy:full by default.
#
# Opt-out:  IAM_SKIP_GCP_VM_SYNC=1
# Dry-run:  IAM_SKIP_GCP_VM_SYNC=1 is unset; pass --dry-run
#
# Usage:
#   ./scripts/sync-gcp-vm-after-deploy.sh
#   ./scripts/sync-gcp-vm-after-deploy.sh --dry-run
#   IAM_SKIP_GCP_VM_SYNC=1 ./scripts/deploy-frontend.sh   # skips this step
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
for arg in "$@"; do
  [[ "$arg" == --dry-run ]] && DRY_RUN=1
done

if [[ "${IAM_SKIP_GCP_VM_SYNC:-}" == "1" ]]; then
  echo "[gcp-vm-sync] skipped (IAM_SKIP_GCP_VM_SYNC=1)"
  exit 0
fi

# Default on when gcloud + project are available unless explicitly disabled.
if [[ "${IAM_SYNC_GCP_VM:-auto}" == "0" ]]; then
  echo "[gcp-vm-sync] skipped (IAM_SYNC_GCP_VM=0)"
  exit 0
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[gcp-vm-sync] skip: gcloud not installed"
  exit 0
fi

if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "$GCP_PROJECT" ]]; then
  echo "[gcp-vm-sync] skip: GCP_PROJECT_ID unset"
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "→ GCP iam-tunnel sync (repo + env + ExecOS runtime)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SYNC_ARGS=()
(( DRY_RUN )) && SYNC_ARGS+=(--dry-run)

# Never fail the parent deploy — log warnings and continue.
set +e

echo "→ git pull operator repo on VM"
"${REPO_ROOT}/scripts/bootstrap-gcp-vm-repo.sh" "${SYNC_ARGS[@]}"
_repo_rc=$?
if (( _repo_rc != 0 )); then
  echo "⚠️  [gcp-vm-sync] bootstrap-gcp-vm-repo.sh exited ${_repo_rc}" >&2
fi

echo "→ sync .env.cloudflare to VM"
"${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh" "${SYNC_ARGS[@]}"
_env_rc=$?
if (( _env_rc != 0 )); then
  echo "⚠️  [gcp-vm-sync] sync-vm-env-cloudflare.sh exited ${_env_rc}" >&2
fi

if [[ "${IAM_SYNC_GCP_EXECOS:-1}" != "0" ]]; then
  echo "→ sync ExecOS runtime + pm2 restart"
  "${REPO_ROOT}/scripts/sync-gcp-vm-execos-runtime.sh" "${SYNC_ARGS[@]}"
  _execos_rc=$?
  if (( _execos_rc != 0 )); then
    echo "⚠️  [gcp-vm-sync] sync-gcp-vm-execos-runtime.sh exited ${_execos_rc}" >&2
  fi
fi

set -e

echo "[gcp-vm-sync] complete (non-fatal — check warnings above)"
echo ""
