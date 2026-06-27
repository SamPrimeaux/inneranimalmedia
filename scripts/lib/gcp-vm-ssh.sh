#!/usr/bin/env bash
# Shared gcloud compute ssh wrapper for iam-tunnel.
# Tries direct SSH first; falls back to IAP when port 22 is unreachable.
#
# Usage:
#   source scripts/lib/gcp-vm-ssh.sh
#   gcp_vm_ssh --command='echo ok'
#   gcp_vm_ssh -- scp local.txt "${GCP_VM_NAME}:remote.txt"
#
set -euo pipefail

_gcp_vm_ssh_mode="${GCP_VM_SSH_MODE:-auto}"

gcp_vm_ssh() {
  local vm="${GCP_VM_NAME:-iam-tunnel}"
  local project="${GCP_PROJECT_ID:-${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}}"
  local zone="${GCP_ZONE:-}"

  if [[ -z "$zone" && -n "$project" ]]; then
    zone="$(gcloud compute instances list \
      --project="$project" \
      --filter="name=$vm" \
      --format='value(zone)' 2>/dev/null | head -1 || true)"
  fi

  if [[ -z "$project" || -z "$zone" ]]; then
    echo "gcp_vm_ssh: set GCP_PROJECT_ID and GCP_ZONE (or gcloud default project + ${vm} VM)" >&2
    return 1
  fi

  local base=(gcloud compute ssh "$vm" --project="$project" --zone="$zone")
  local mode="$_gcp_vm_ssh_mode"

  if [[ "$mode" == "auto" ]]; then
    if "${base[@]}" --ssh-flag='ConnectTimeout=8' --command='echo gcp_vm_ssh_probe_ok' >/dev/null 2>&1; then
      mode="direct"
    else
      mode="iap"
      echo "[gcp-vm-ssh] direct SSH failed — using --tunnel-through-iap" >&2
    fi
  fi

  if [[ "$mode" == "iap" ]]; then
    base+=(--tunnel-through-iap)
  fi

  if [[ "${1:-}" == "--" ]]; then
    shift
    "${base[@]}" "$@"
  else
    "${base[@]}" "$@"
  fi
}

gcp_vm_scp() {
  local vm="${GCP_VM_NAME:-iam-tunnel}"
  local project="${GCP_PROJECT_ID:-${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}}"
  local zone="${GCP_ZONE:-}"

  if [[ -z "$zone" && -n "$project" ]]; then
    zone="$(gcloud compute instances list \
      --project="$project" \
      --filter="name=$vm" \
      --format='value(zone)' 2>/dev/null | head -1 || true)"
  fi

  if [[ -z "$project" || -z "$zone" ]]; then
    echo "gcp_vm_scp: set GCP_PROJECT_ID and GCP_ZONE" >&2
    return 1
  fi

  local base=(gcloud compute scp --project="$project" --zone="$zone")
  local mode="$_gcp_vm_ssh_mode"

  if [[ "$mode" == "auto" ]]; then
    if gcloud compute ssh "$vm" --project="$project" --zone="$zone" \
      --ssh-flag='ConnectTimeout=8' --command='echo gcp_vm_ssh_probe_ok' >/dev/null 2>&1; then
      mode="direct"
    else
      mode="iap"
      echo "[gcp-vm-ssh] direct SSH failed — using --tunnel-through-iap for scp" >&2
    fi
  fi

  if [[ "$mode" == "iap" ]]; then
    base+=(--tunnel-through-iap)
  fi

  "${base[@]}" "$@"
}
