#!/usr/bin/env bash
# Migrate ExecOS PM2 on iam-tunnel to run as agentsam (fixes exec identity mismatch).
# Sam operator lane only — never grants Connor/other users access to ~/inneranimalmedia.
#
# Usage (Mac repo root):
#   IAM_USER_ID=au_871d920d1233cbd1 ./scripts/bootstrap-gcp-vm-exec-identity.sh
#   ./scripts/bootstrap-gcp-vm-exec-identity.sh --dry-run
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/gcp-vm-paths.sh
source "${REPO_ROOT}/scripts/lib/gcp-vm-paths.sh"
# shellcheck source=scripts/lib/sam-operator-lane.sh
source "${REPO_ROOT}/scripts/lib/sam-operator-lane.sh"

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

require_sam_operator_lane_user_id

GCP_VM_NAME="${GCP_VM_NAME:-iam-tunnel}"
GCP_PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
GCP_ZONE_VAL="${GCP_ZONE:-}"
SAM_REPO="${IAM_GCP_REPO_PATH:-/home/samprimeaux/inneranimalmedia}"
EXECOS_HOME="${IAM_EXECOS_HOME:-/home/samprimeaux/ExecOS}"

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

echo "GCP VM: ${GCP_VM_NAME}"
echo "Sam operator repo: ${SAM_REPO}"
echo "ExecOS runtime: ${EXECOS_HOME}"
echo "Operator au_*: ${IAM_USER_ID:-${AGENTSAM_USER_ID:-<from env>}}"

REMOTE_CMD="$(cat <<EOF
set -euo pipefail
SAM_REPO='${SAM_REPO}'
EXECOS_HOME='${EXECOS_HOME}'
AGENTSAM_USER=agentsam

if [[ ! -f "\${EXECOS_HOME}/deploy/gcp/install-agentsam-ops.sh" ]]; then
  echo "✗ ExecOS not found at \${EXECOS_HOME}" >&2
  exit 1
fi

if [[ -d "\${EXECOS_HOME}/.git" ]]; then
  echo "→ git pull ExecOS runtime"
  git -C "\${EXECOS_HOME}" fetch origin main
  git -C "\${EXECOS_HOME}" merge --ff-only origin/main || true
fi

echo "→ install agentsam scoped ops (no Connor /workspace chown)"
sudo bash "\${EXECOS_HOME}/deploy/gcp/install-agentsam-ops.sh" --sam-repo="\${SAM_REPO}"

echo "→ grant agentsam read/write on Sam repo only"
if [[ -d "\${SAM_REPO}" ]]; then
  sudo chown -R "\${AGENTSAM_USER}:\${AGENTSAM_USER}" "\${SAM_REPO}"
fi

echo "→ migrate PM2 execos to \${AGENTSAM_USER}"
sudo bash "\${EXECOS_HOME}/deploy/gcp/install-agentsam-ops.sh" --migrate-pm2 --sam-repo="\${SAM_REPO}"

if [[ -f "\${EXECOS_HOME}/.env.cloudflare" ]]; then
  grep -q '^EXECOS_DEFAULT_CWD=' "\${EXECOS_HOME}/.env.cloudflare" 2>/dev/null && \
    sudo sed -i "s|^EXECOS_DEFAULT_CWD=.*|EXECOS_DEFAULT_CWD=\${SAM_REPO}|" "\${EXECOS_HOME}/.env.cloudflare" || \
    echo "EXECOS_DEFAULT_CWD=\${SAM_REPO}" | sudo tee -a "\${EXECOS_HOME}/.env.cloudflare" >/dev/null
fi

RUNTIME_USER="\$(sudo -u \${AGENTSAM_USER} pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0][\"pm2_env\"][\"username\"] if d else \"\")' 2>/dev/null || true)"
echo "PM2 exec user: \${RUNTIME_USER:-unknown}"
sudo -u \${AGENTSAM_USER} pm2 logs execos --lines 3 --nostream 2>/dev/null || true
curl -sf -m 8 https://terminal.inneranimalmedia.com/health | head -c 400 || true
echo ""
echo "EXECOS_IDENTITY_OK: agentsam"
EOF
)"

if (( DRY_RUN )); then
  echo "[dry-run] would migrate ExecOS PM2 to agentsam on ${GCP_VM_NAME}"
  exit 0
fi

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE_CMD"

echo ""
echo "Verify: agentsam_terminal_remote { \"command\": \"whoami && pwd\" }"
echo "  expect: agentsam + ${SAM_REPO}"
