#!/usr/bin/env bash
# Restart iam-pty + cloudflared on GCP iam-tunnel (Lane 3 CLOUD production).
# Usage: ./scripts/gcp-iam-tunnel-restart.sh
#        ./scripts/gcp-iam-tunnel-restart.sh --dry-run
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=scripts/lib/gcp-vm-paths.sh
source "${REPO_ROOT}/scripts/lib/gcp-vm-paths.sh"

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

if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare (or gcloud default + iam-tunnel VM)" >&2
  exit 1
fi

REMOTE='set -e
EXECOS_DIR="$HOME/ExecOS"
[[ -d "$EXECOS_DIR" ]] || EXECOS_DIR="$HOME/iam-pty"
if [[ -d "$EXECOS_DIR" ]]; then
  sudo git config --global --add safe.directory "$EXECOS_DIR" 2>/dev/null || true
  sudo -u samprimeaux git -C "$EXECOS_DIR" pull --ff-only 2>/dev/null || true
  npm install --omit=dev 2>/dev/null || npm install 2>/dev/null || true
  if [[ -x "$EXECOS_DIR/deploy/gcp/health-watchdog.sh" ]]; then
    sudo bash "$EXECOS_DIR/deploy/gcp/health-watchdog.sh" || true
  elif command -v pm2 >/dev/null 2>&1; then
    sudo -u agentsam bash -lc "export PM2_HOME=/var/lib/agentsam/.pm2; cd \"$EXECOS_DIR\" && pm2 restart execos --update-env && pm2 save"
  fi
fi
if systemctl is-active cloudflared >/dev/null 2>&1; then
  sudo systemctl restart cloudflared
elif launchctl list 2>/dev/null | grep -q cloudflared; then
  echo "cloudflared: launchd (not systemd)"
fi
echo "--- health localhost:3099 ---"
curl -sf http://127.0.0.1:3099/health || echo "iam-pty not responding on 3099"
lsof -i :3099 2>/dev/null | head -3 || true
'

if (( DRY_RUN )); then
  echo "[dry-run] would ssh ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL})"
  exit 0
fi

echo "→ GCP ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL})"
gcp_vm_ssh --command="$REMOTE"

echo ""
echo "→ Public health"
for host in terminal.inneranimalmedia.com sandboxterminal.inneranimalmedia.com; do
  code="$(curl -sS -m 12 -o /dev/null -w '%{http_code}' "https://${host}/health" || echo 000)"
  echo "  https://${host}/health → HTTP ${code}"
done
