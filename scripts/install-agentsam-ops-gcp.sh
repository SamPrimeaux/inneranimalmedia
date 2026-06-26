#!/usr/bin/env bash
# Install AgentSam scoped sudo + system user on GCP iam-tunnel.
#
# Usage:
#   ./scripts/install-agentsam-ops-gcp.sh
#   ./scripts/install-agentsam-ops-gcp.sh --migrate-pm2
#   ./scripts/install-agentsam-ops-gcp.sh --dry-run
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
REMOTE_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --migrate-pm2) REMOTE_ARGS+=("--migrate-pm2") ;;
  esac
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

if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 1
fi

EXECOS_HOME="${EXECOS_HOME:-$HOME/ExecOS}"
INSTALL_SCRIPT="${EXECOS_HOME}/deploy/gcp/install-agentsam-ops.sh"

if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  echo "✗ Missing ${INSTALL_SCRIPT} — clone ExecOS on this Mac first" >&2
  exit 1
fi

REMOTE_CMD="set -euo pipefail
if [[ -f \"\$HOME/ExecOS/deploy/gcp/install-agentsam-ops.sh\" ]]; then
  cd \"\$HOME/ExecOS\"
  git pull --ff-only 2>/dev/null || true
  bash deploy/gcp/install-agentsam-ops.sh ${REMOTE_ARGS[*]:-}
elif [[ -f \"\$HOME/iam-pty/deploy/gcp/install-agentsam-ops.sh\" ]]; then
  cd \"\$HOME/iam-pty\"
  git pull --ff-only 2>/dev/null || true
  bash deploy/gcp/install-agentsam-ops.sh ${REMOTE_ARGS[*]:-}
else
  echo '✗ ExecOS runtime not found on VM — run bootstrap.sh first' >&2
  exit 1
fi
"

if (( DRY_RUN )); then
  echo "[dry-run] would ssh ${GCP_VM_NAME} and run install-agentsam-ops.sh ${REMOTE_ARGS[*]:-}"
  exit 0
fi

echo "→ Sync ExecOS deploy assets to ${GCP_VM_NAME}"
gcloud compute scp --recurse "${EXECOS_HOME}/deploy/gcp" \
  "${GCP_VM_NAME}:~/ExecOS/deploy/" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" 2>/dev/null || \
gcloud compute scp --recurse "${EXECOS_HOME}/deploy/gcp" \
  "${GCP_VM_NAME}:~/iam-pty/deploy/" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL"

echo "→ Install AgentSam scoped ops on ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL})"
gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE_CMD"

echo ""
echo "✓ AgentSam ops layer installed on iam-tunnel."
echo "  Re-deploy ExecOS server.js (git pull + pm2 restart) to pick up scoped sudo allow-list."
