#!/usr/bin/env bash
# Restart iam-pty + cloudflared on GCP iam-tunnel (Lane 3 CLOUD production).
# Usage: ./scripts/gcp-iam-tunnel-restart.sh
#        ./scripts/gcp-iam-tunnel-restart.sh --dry-run
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

if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare (or gcloud default + iam-tunnel VM)" >&2
  exit 1
fi

REMOTE='set -e
if [[ -d "$HOME/iam-pty" ]]; then
  cd "$HOME/iam-pty"
  git pull --ff-only 2>/dev/null || true
  npm install --omit=dev 2>/dev/null || npm install 2>/dev/null || true
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart iam-pty --update-env 2>/dev/null || pm2 start ecosystem.config.cjs
    pm2 save 2>/dev/null || true
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
gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="$REMOTE"

echo ""
echo "→ Public health"
for host in terminal.inneranimalmedia.com sandboxterminal.inneranimalmedia.com; do
  code="$(curl -sS -m 12 -o /dev/null -w '%{http_code}' "https://${host}/health" || echo 000)"
  echo "  https://${host}/health → HTTP ${code}"
done
