#!/usr/bin/env bash
# Bootstrap Sam's operator repo on GCP iam-tunnel — sparse partial clone at ~/inneranimalmedia.
#
# Remote lane job: git ops, file reads/edits, lightweight scripts when Mac is asleep.
# NOT a CI box — route npm run build:vite-only, Playwright, GLB tooling to MY_CONTAINER sandbox.
#
# Default sparse paths (IAM_GCP_SPARSE_PATHS): src dashboard/src scripts
# Clone: --filter=blob:none + cone sparse-checkout (lazy blobs, minimal disk).
#
# Usage (Mac repo root):
#   ./scripts/bootstrap-gcp-vm-repo.sh
#   ./scripts/bootstrap-gcp-vm-repo.sh --dry-run
#   ./scripts/bootstrap-gcp-vm-repo.sh --sync-env
#   ./scripts/bootstrap-gcp-vm-repo.sh --reconvert-sparse   # wipe + fresh sparse clone
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
RECONVERT_SPARSE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --sync-env) SYNC_ENV=1 ;;
    --migrate-execos) MIGRATE_EXECOS=1 ;;
    --reconvert-sparse) RECONVERT_SPARSE=1 ;;
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
SPARSE_PATHS="${IAM_GCP_SPARSE_PATHS:-src dashboard/src scripts}"

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
echo "Operator repo (sparse partial): ${VM_REPO}"
echo "Sparse cone paths: ${SPARSE_PATHS}"

REMOTE_CMD="$(cat <<EOF
set -euo pipefail
REPO_DIR='${VM_REPO}'
REPO_URL='${REPO_URL}'
SPARSE_PATHS='${SPARSE_PATHS}'
AGENTSAM_USER=agentsam
RECONVERT='${RECONVERT_SPARSE}'

clear_stale_git_locks() {
  local repo="\$1"
  local stale_min="\${2:-2}"
  [[ -d "\${repo}/.git" ]] || return 0
  local before after
  before="\$(find "\${repo}/.git" -name '*.lock' -type f 2>/dev/null | wc -l | tr -d ' ')"
  find "\${repo}/.git" -name '*.lock' -type f -mmin "+\${stale_min}" -delete 2>/dev/null || true
  after="\$(find "\${repo}/.git" -name '*.lock' -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "\${before:-0}" != "\${after:-0}" ]]; then
    echo "[iam-git-lock] cleared stale locks under \${repo}/.git (before=\${before} after=\${after})"
  fi
}

git_as_bootstrap() {
  sudo -u samprimeaux git config --global --add safe.directory "\$REPO_DIR" 2>/dev/null || true
  sudo -u samprimeaux git -C "\$REPO_DIR" "\$@"
}

repo_git_prep() {
  sudo chown -R samprimeaux:samprimeaux "\$REPO_DIR"
  clear_stale_git_locks "\$REPO_DIR"
}

repo_git_finalize() {
  clear_stale_git_locks "\$REPO_DIR"
  sudo chown -R "\${AGENTSAM_USER}:\${AGENTSAM_USER}" "\$REPO_DIR"
}

sparse_configure() {
  git_as_bootstrap sparse-checkout init --cone
  # shellcheck disable=SC2086
  git_as_bootstrap sparse-checkout set \$SPARSE_PATHS
}

fresh_sparse_clone() {
  echo "→ fresh sparse clone (--filter=blob:none)"
  sudo rm -rf "\$REPO_DIR"
  sudo mkdir -p "\$(dirname "\$REPO_DIR")"
  sudo -u samprimeaux git clone --filter=blob:none --no-checkout "\$REPO_URL" "\$REPO_DIR"
  sparse_configure
  git_as_bootstrap checkout main
  repo_git_finalize
}

if [[ "\$RECONVERT" == "1" ]]; then
  fresh_sparse_clone
elif [[ -d "\$REPO_DIR/.git" ]]; then
  echo "→ existing clone — sparse sync"
  repo_git_prep
  if [[ "\$(git_as_bootstrap config --get core.sparseCheckout 2>/dev/null || true)" != "true" ]]; then
    echo "→ converting full checkout to sparse partial"
    sparse_configure
  else
    # shellcheck disable=SC2086
    git_as_bootstrap sparse-checkout set \$SPARSE_PATHS
  fi
  # Serialize against agentsam self-heal cron (same iam-sync.flock).
  clear_stale_git_locks "\$REPO_DIR"
  if command -v flock >/dev/null 2>&1; then
    flock -w 60 "\$REPO_DIR/.git/iam-sync.flock" \
      sudo -u samprimeaux git -C "\$REPO_DIR" fetch origin main
    flock -w 60 "\$REPO_DIR/.git/iam-sync.flock" \
      sudo -u samprimeaux git -C "\$REPO_DIR" checkout main
    flock -w 60 "\$REPO_DIR/.git/iam-sync.flock" \
      sudo -u samprimeaux git -C "\$REPO_DIR" reset --hard origin/main
  else
    git_as_bootstrap fetch origin main
    git_as_bootstrap checkout main
    git_as_bootstrap reset --hard origin/main
  fi
  repo_git_finalize
elif [[ -d "\$REPO_DIR" ]]; then
  echo "→ repairing non-git directory at \$REPO_DIR"
  fresh_sparse_clone
else
  fresh_sparse_clone
fi

echo "--- disk after bootstrap ---"
df -h /home/samprimeaux | tail -1
du -sh "\$REPO_DIR" 2>/dev/null || true
test -d "\$REPO_DIR/src" && test -d "\$REPO_DIR/scripts" && \
  echo "REPO_OK: \$(sudo -u \${AGENTSAM_USER} git -C "\$REPO_DIR" rev-parse --short HEAD) sparse"
EOF
)"

if (( DRY_RUN )); then
  echo "[dry-run] would ssh and sparse-bootstrap ${VM_REPO}"
  exit 0
fi

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE_CMD"

if (( ! DRY_RUN )); then
  "${REPO_ROOT}/scripts/ensure-gcp-vm-swap.sh" 2>/dev/null || true
fi

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
echo "Remote PTY (git/shell lane — no root npm ci; builds → agentsam_terminal_sandbox):"
echo "  cd ${VM_REPO} && source scripts/lib/load-iam-local-env.sh"
echo ""
curl -sS -m 12 -o /dev/null -w '  terminal %{http_code}\n' https://terminal.inneranimalmedia.com/health || true
