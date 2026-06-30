#!/usr/bin/env bash
# Idempotent 1GB swap on iam-tunnel — OOM safety for git/wrangler bursts on ~1GB RAM.
#
# Usage (Mac repo root):
#   ./scripts/ensure-gcp-vm-swap.sh
#   ./scripts/ensure-gcp-vm-swap.sh --dry-run
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_ZONE_VAL="${GCP_ZONE:-}"
if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "✗ gcloud not installed" >&2
  exit 1
fi
if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 1
fi

REMOTE_CMD='set -euo pipefail
if grep -q "/swapfile" /proc/swaps 2>/dev/null; then
  echo "swap already active"
else
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
  echo "swap enabled (1G)"
fi
cat /proc/swaps
free -h | grep -E "Mem|Swap" || free -h
'

if (( DRY_RUN )); then
  echo "[dry-run] would ensure 1G swap on ${GCP_VM_NAME}"
  exit 0
fi

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE_CMD"
