#!/usr/bin/env bash
# Lightweight ExecOS runtime sync → iam-tunnel (server.js + shared guards, pm2 restart).
# Does not re-run full agentsam-ops install or SSH identity setup.
#
# Usage:
#   ./scripts/sync-gcp-vm-execos-runtime.sh
#   ./scripts/sync-gcp-vm-execos-runtime.sh --dry-run
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

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
EXECOS_HOME="${EXECOS_HOME:-$HOME/ExecOS}"
VM_EXECOS="/home/samprimeaux/ExecOS"

if [[ ! -f "${EXECOS_HOME}/server.js" ]]; then
  echo "[gcp-execos-sync] skip: no Mac ExecOS at ${EXECOS_HOME}"
  exit 0
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "[gcp-execos-sync] skip: gcloud not installed"
  exit 0
fi

if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  if [[ -n "$GCP_PROJECT" ]]; then
    GCP_ZONE_VAL="$(gcloud compute instances list \
      --project="$GCP_PROJECT" \
      --filter="name=$GCP_VM_NAME" \
      --format='value(zone)' 2>/dev/null | head -1 || true)"
  fi
fi

if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "[gcp-execos-sync] skip: set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare"
  exit 0
fi

if (( DRY_RUN )); then
  echo "[dry-run] would sync ExecOS runtime to ${GCP_VM_NAME} and pm2 restart execos (agentsam)"
  exit 0
fi

echo "[gcp-execos-sync] → ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL})"

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command='rm -rf /tmp/execos-runtime-sync && mkdir -p /tmp/execos-runtime-sync/shared /tmp/execos-runtime-sync/deploy/gcp'

gcloud compute scp "${EXECOS_HOME}/server.js" \
  "${GCP_VM_NAME}:/tmp/execos-runtime-sync/server.js" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL"

for rel in shared/guard.mjs shared/sam-operator-lane.mjs shared/sudo-allowlist.mjs deploy/gcp/install-agentsam-ops.sh; do
  if [[ -f "${EXECOS_HOME}/${rel}" ]]; then
    dest="/tmp/execos-runtime-sync/${rel}"
    gcloud compute scp "${EXECOS_HOME}/${rel}" \
      "${GCP_VM_NAME}:${dest}" \
      --project="$GCP_PROJECT" \
      --zone="$GCP_ZONE_VAL"
  fi
done

REMOTE_CMD="$(cat <<EOF
set -euo pipefail
VM_EXECOS='${VM_EXECOS}'
sudo install -d "\${VM_EXECOS}/shared" "\${VM_EXECOS}/deploy/gcp"
sudo install -m 644 /tmp/execos-runtime-sync/server.js "\${VM_EXECOS}/server.js"
for f in guard.mjs sam-operator-lane.mjs sudo-allowlist.mjs; do
  if [[ -f "/tmp/execos-runtime-sync/shared/\${f}" ]]; then
    sudo install -m 644 "/tmp/execos-runtime-sync/shared/\${f}" "\${VM_EXECOS}/shared/\${f}"
  fi
done
if [[ -f /tmp/execos-runtime-sync/deploy/gcp/install-agentsam-ops.sh ]]; then
  sudo install -m 755 /tmp/execos-runtime-sync/deploy/gcp/install-agentsam-ops.sh "\${VM_EXECOS}/deploy/gcp/install-agentsam-ops.sh"
fi
sudo chown -R agentsam:agentsam "\${VM_EXECOS}/server.js" "\${VM_EXECOS}/shared" "\${VM_EXECOS}/deploy/gcp" 2>/dev/null || true
$(bash "${REPO_ROOT}/scripts/lib/gcp-vm-execos-pm2-remote.sh")
rm -rf /tmp/execos-runtime-sync
EOF
)"

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE_CMD"

echo "[gcp-execos-sync] done"
