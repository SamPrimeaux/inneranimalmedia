#!/usr/bin/env bash
# Bootstrap Sam's operator repo on GCP iam-tunnel — GitHub clone at ~/inneranimalmedia.
# This is the path AgentSam uses when Mac localpty is asleep (terminal.inneranimalmedia.com).
#
# Usage (Mac repo root):
#   ./scripts/bootstrap-gcp-vm-repo.sh
#   ./scripts/bootstrap-gcp-vm-repo.sh --dry-run
#   ./scripts/bootstrap-gcp-vm-repo.sh --sync-env
#   IAM_USER_ID=au_871d920d1233cbd1 ./scripts/bootstrap-gcp-vm-repo.sh --migrate-execos
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SCRIPT_LIB="${REPO_ROOT}/scripts/lib/gcp-vm-paths.sh"
# shellcheck source=scripts/lib/gcp-vm-paths.sh
source "$SCRIPT_LIB"
# shellcheck source=scripts/lib/sam-operator-lane.sh
source "${REPO_ROOT}/scripts/lib/sam-operator-lane.sh"

DRY_RUN=0
SYNC_ENV=0
MIGRATE_EXECOS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --sync-env) SYNC_ENV=1 ;;
    --migrate-execos) MIGRATE_EXECOS=1 ;;
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
VM_REPO="${IAM_VM_ENV_REPO_PATHS:-${IAM_GCP_REPO_PATH:-/home/samprimeaux/inneranimalmedia}}"
VM_REPO="${VM_REPO%%,*}"
REPO_URL="${IAM_SANDBOX_REPO_URL:-git@github.com:SamPrimeaux/inneranimalmedia.git}"

if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "✗ gcloud not installed — install Google Cloud SDK" >&2
  exit 1
fi
if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 1
fi

echo "GCP VM: ${GCP_VM_NAME} (${GCP_PROJECT} / ${GCP_ZONE_VAL})"
echo "Operator repo (GitHub clone): ${VM_REPO}"

REMOTE_CMD="$(cat <<EOF
set -euo pipefail
REPO_DIR='${VM_REPO}'
REPO_URL='${REPO_URL}'
AGENTSAM_USER=agentsam
git_as_bootstrap() {
  sudo -u samprimeaux git config --global --add safe.directory "\$REPO_DIR" 2>/dev/null || true
  sudo -u samprimeaux git -C "\$REPO_DIR" "\$@"
}
if [[ -d "\$REPO_DIR/.git" ]]; then
  echo "→ existing clone — fetching main"
  sudo chown -R samprimeaux:samprimeaux "\$REPO_DIR"
  git_as_bootstrap fetch origin main
  git_as_bootstrap checkout main
  git_as_bootstrap merge --ff-only origin/main
  sudo chown -R "\${AGENTSAM_USER}:\${AGENTSAM_USER}" "\$REPO_DIR"
else
  echo "→ cloning from GitHub"
  sudo mkdir -p "\$(dirname "\$REPO_DIR")"
  sudo -u samprimeaux git clone "\$REPO_URL" "\$REPO_DIR"
  git_as_bootstrap checkout main
  sudo chown -R "\${AGENTSAM_USER}:\${AGENTSAM_USER}" "\$REPO_DIR"
fi
test -f "\$REPO_DIR/package.json" && echo "REPO_OK: \$(sudo -u \${AGENTSAM_USER} git -C "\$REPO_DIR" rev-parse --short HEAD)"
EOF
)"

if (( DRY_RUN )); then
  echo "[dry-run] would ssh and bootstrap ${VM_REPO}"
  exit 0
fi

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE_CMD"

if (( SYNC_ENV )) || [[ -x "${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh" ]]; then
  echo ""
  echo "→ Sync .env.cloudflare to VM"
  IAM_VM_ENV_REPO_PATHS="$VM_REPO" "${REPO_ROOT}/scripts/sync-vm-env-cloudflare.sh"
fi

if (( MIGRATE_EXECOS )); then
  require_sam_operator_lane_user_id
  echo ""
  "${REPO_ROOT}/scripts/bootstrap-gcp-vm-exec-identity.sh"
fi

echo ""
echo "Remote PTY:"
echo "  cd ${VM_REPO} && source scripts/lib/load-iam-local-env.sh"
echo ""
curl -sS -m 12 -o /dev/null -w '  terminal %{http_code}\n' https://terminal.inneranimalmedia.com/health || true
