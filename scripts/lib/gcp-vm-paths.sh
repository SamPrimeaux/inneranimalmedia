#!/usr/bin/env bash
# Shared GCP iam-tunnel operator repo paths (GitHub clone on VM — not Mac, not /workspace sandbox).
#
# Source from other scripts:
#   source "$(dirname "$0")/lib/gcp-vm-paths.sh"

: "${IAM_GCP_REPO_PATH:=/home/samprimeaux/inneranimalmedia}"
: "${IAM_SANDBOX_REPO_URL:=git@github.com:SamPrimeaux/inneranimalmedia.git}"
: "${GCP_VM_NAME:=iam-tunnel}"

_GCP_VM_PATHS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/gcp-vm-ssh.sh
source "${_GCP_VM_PATHS_DIR}/gcp-vm-ssh.sh"
