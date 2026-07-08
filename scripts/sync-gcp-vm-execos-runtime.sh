#!/usr/bin/env bash
# ExecOS runtime sync → iam-tunnel via VM-side git pull (not Mac SCP).
#
# VM owns its own ExecOS clone from GitHub. Mac is never required.
# After one bootstrap (bootstrap-gcp-vm-repo.sh), the VM self-heals.
#
# Usage:
#   ./scripts/sync-gcp-vm-execos-runtime.sh
#   ./scripts/sync-gcp-vm-execos-runtime.sh --dry-run
#   IAM_SYNC_GCP_EXECOS=0  →  skip this step entirely
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/gcp-vm-paths.sh
source "${REPO_ROOT}/scripts/lib/gcp-vm-paths.sh"

DRY_RUN=0
for arg in "$@"; do
  [[ "$arg" == --dry-run ]] && DRY_RUN=1
done

if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_ZONE_VAL="${GCP_ZONE:-}"
VM_EXECOS="/home/samprimeaux/ExecOS"
EXECOS_REPO="${EXECOS_REPO:-git@github.com-inneranimal:SamPrimeaux/ExecOS.git}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[gcp-execos-sync] skip: gcloud not installed"
  exit 0
fi

if [[ -z "$GCP_PROJECT" ]]; then
  echo "[gcp-execos-sync] skip: GCP_PROJECT_ID unset"
  exit 0
fi

if [[ -z "$GCP_ZONE_VAL" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

if [[ -z "$GCP_ZONE_VAL" ]]; then
  echo "[gcp-execos-sync] skip: cannot resolve GCP zone for ${GCP_VM_NAME}"
  exit 0
fi

if (( DRY_RUN )); then
  echo "[dry-run] would run git pull ExecOS on ${GCP_VM_NAME} and pm2 restart execos"
  exit 0
fi

echo "[gcp-execos-sync] → ${GCP_VM_NAME} git pull ExecOS from GitHub (no SCP)"

# VM pulls ExecOS from GitHub directly. If clone missing, clone it first.
# pm2 restart follows. Mac files are never involved.
REMOTE_CMD="$(cat <<'REMOTESCRIPT'
set -euo pipefail
VM_EXECOS="/home/samprimeaux/ExecOS"
EXECOS_REPO="git@github.com-inneranimal:SamPrimeaux/ExecOS.git"

if [[ -d "${VM_EXECOS}/.git" ]]; then
  echo "[vm] git pull ExecOS"
  git -C "${VM_EXECOS}" pull --ff-only 2>&1 || {
    echo "[vm] ff-only failed, fetching and resetting to origin/main"
    git -C "${VM_EXECOS}" fetch origin
    git -C "${VM_EXECOS}" reset --hard origin/main
  }
else
  echo "[vm] cloning ExecOS from GitHub"
  mkdir -p "$(dirname "${VM_EXECOS}")"
  git clone "${EXECOS_REPO}" "${VM_EXECOS}"
fi

# Restart pm2 process — try both process names used historically
if pm2 list 2>/dev/null | grep -qE 'execos|agentsam'; then
  pm2 restart execos --update-env 2>/dev/null || \
  pm2 restart agentsam --update-env 2>/dev/null || true
  echo "[vm] pm2 restarted"
else
  echo "[vm] pm2 execos process not found — health check only"
fi

# Quick health check
if [[ -f "${VM_EXECOS}/server.js" ]]; then
  echo "[vm] ExecOS server.js present ✓"
else
  echo "[vm] WARNING: server.js missing after pull"
  exit 1
fi
REMOTESCRIPT
)"

gcp_vm_ssh --command="$REMOTE_CMD"
echo "[gcp-execos-sync] done — VM ExecOS updated from GitHub"
