#!/usr/bin/env bash
# Bootstrap Sam's GCP sandbox clone at platform_workspace path (sandboxterminal lane).
# Run from Mac repo root — uses gcloud ssh to iam-tunnel VM, NOT your iMac shell.
#
# Usage:
#   ./scripts/bootstrap-gcp-sandbox-repo.sh
#   ./scripts/bootstrap-gcp-sandbox-repo.sh --dry-run
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

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

SAM_TENANT="${IAM_SANDBOX_TENANT_ID:-tenant_sam_primeaux}"
SAM_USER="${IAM_SANDBOX_USER_ID:-au_871d920d1233cbd1}"
WORKSPACE_ROOT="${IAM_GCP_WORKSPACES_ROOT:-/workspace}"
REPO_DIR="${WORKSPACE_ROOT}/${SAM_TENANT}/${SAM_USER}/inneranimalmedia"
REPO_URL="${IAM_SANDBOX_REPO_URL:-git@github.com:SamPrimeaux/inneranimalmedia.git}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "✗ gcloud not installed — install Google Cloud SDK" >&2
  exit 1
fi
if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 1
fi

echo "GCP VM: ${GCP_VM_NAME} (${GCP_PROJECT} / ${GCP_ZONE_VAL})"
echo "Clone path: ${REPO_DIR}"

REMOTE_CMD="$(cat <<EOF
set -euo pipefail
REPO_DIR='${REPO_DIR}'
REPO_URL='${REPO_URL}'
PARENT="\$(dirname "\$REPO_DIR")"
mkdir -p "\$PARENT"
if [[ -d "\$REPO_DIR/.git" ]]; then
  echo "→ existing clone — fetching main"
  cd "\$REPO_DIR"
  git fetch origin main
  git checkout main
  git merge --ff-only origin/main
else
  echo "→ cloning"
  git clone "\$REPO_URL" "\$REPO_DIR"
  cd "\$REPO_DIR"
  git checkout main
fi
test -f package.json && echo "REPO_OK: \$(pwd)" && git rev-parse --short HEAD
EOF
)"

if (( DRY_RUN )); then
  echo "[dry-run] would ssh and run bootstrap in ${REPO_DIR}"
  exit 0
fi

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE_CMD"

echo ""
echo "→ Sync .env.cloudflare to VM (optional): ./scripts/sync-vm-env-cloudflare.sh"
echo "  Set IAM_VM_ENV_REPO_PATHS=${REPO_DIR} in .env.cloudflare"
echo ""
echo "Health:"
curl -sS -m 12 -o /dev/null -w '  sandboxterminal %{http_code}\n' https://sandboxterminal.inneranimalmedia.com/health || true
