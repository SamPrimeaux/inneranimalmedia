#!/usr/bin/env bash
# Ensure ripgrep is on system PATH for operator SSH on iam-tunnel.
# Prefer agentsam's newer binary at /usr/local/bin/rg; apt ripgrep is fallback.
#
# From Mac:
#   ./scripts/ensure-gcp-vm-rg.sh
# On VM (root / self-heal):
#   ./scripts/gcp-vm-self-heal.sh  # step 6
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/gcp-vm-paths.sh
source "${REPO_ROOT}/scripts/lib/gcp-vm-paths.sh" 2>/dev/null || true

if [[ -f "${REPO_ROOT}/.env.cloudflare" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${REPO_ROOT}/.env.cloudflare"
  set +a
fi

GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
GCP_ZONE_VAL="${GCP_ZONE:-us-central1-a}"

REMOTE=$(cat <<'EOF'
set -eu
SRC=/var/lib/agentsam/.local/bin/rg
DEST=/usr/local/bin/rg
if [ -x "$SRC" ]; then
  sudo ln -sfn "$SRC" "$DEST"
elif ! command -v rg >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ripgrep
  sudo ln -sfn "$(command -v rg)" "$DEST"
elif [ ! -e "$DEST" ]; then
  sudo ln -sfn "$(command -v rg)" "$DEST"
fi
hash -r
echo "rg=$(command -v rg)"
rg --version 2>&1 | head -n 1 || true
ls -la "$DEST"
EOF
)

if [[ "$(hostname -s 2>/dev/null || true)" == "iam-tunnel" ]] || [[ "${IAM_ON_GCP_VM:-0}" == "1" ]]; then
  eval "$REMOTE"
  exit 0
fi

exec gcloud compute ssh "$GCP_VM_NAME" --zone="$GCP_ZONE_VAL" --command "$REMOTE"
