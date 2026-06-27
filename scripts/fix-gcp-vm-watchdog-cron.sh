#!/usr/bin/env bash
# Fix iam-tunnel cron + systemd so health-watchdog and PM2 never run as samprimeaux.
#
# Usage:
#   ./scripts/fix-gcp-vm-watchdog-cron.sh
#   ./scripts/fix-gcp-vm-watchdog-cron.sh --dry-run
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
EXECOS_HOME="${EXECOS_HOME:-$HOME/ExecOS}"

if [[ -z "$GCP_ZONE_VAL" && -n "$GCP_PROJECT" ]]; then
  GCP_ZONE_VAL="$(gcloud compute instances list \
    --project="$GCP_PROJECT" \
    --filter="name=$GCP_VM_NAME" \
    --format='value(zone)' 2>/dev/null | head -1 || true)"
fi

if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE" >&2
  exit 1
fi

WATCHDOG_LOCAL="${EXECOS_HOME}/deploy/gcp/health-watchdog.sh"
if [[ ! -f "$WATCHDOG_LOCAL" ]]; then
  echo "✗ Missing ${WATCHDOG_LOCAL}" >&2
  exit 1
fi

if (( DRY_RUN )); then
  echo "[dry-run] would fix cron, mask pm2-samprimeaux, deploy health-watchdog on ${GCP_VM_NAME}"
  exit 0
fi

gcloud compute scp "$WATCHDOG_LOCAL" \
  "${GCP_VM_NAME}:/tmp/health-watchdog.sh" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL"

gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command='sudo bash -s' <<'REMOTE'
set -euo pipefail
VM_EXECOS=/home/samprimeaux/ExecOS
install -d "$VM_EXECOS/deploy/gcp"
install -m 755 /tmp/health-watchdog.sh "$VM_EXECOS/deploy/gcp/health-watchdog.sh"
ln -sfn "$VM_EXECOS" /home/samprimeaux/iam-pty 2>/dev/null || true
ln -sfn "$VM_EXECOS/deploy/gcp/health-watchdog.sh" /usr/local/sbin/iam-execos-health-watchdog 2>/dev/null || \
  sudo ln -sfn "$VM_EXECOS/deploy/gcp/health-watchdog.sh" /usr/local/sbin/iam-execos-health-watchdog

# Nuclear: pm2-samprimeaux cannot be started manually or on boot
systemctl stop pm2-samprimeaux.service 2>/dev/null || true
systemctl disable pm2-samprimeaux.service 2>/dev/null || true
if [[ -f /etc/systemd/system/pm2-samprimeaux.service && ! -L /etc/systemd/system/pm2-samprimeaux.service ]]; then
  mv /etc/systemd/system/pm2-samprimeaux.service "/etc/systemd/system/pm2-samprimeaux.service.bak.$(date +%Y%m%d)"
fi
systemctl daemon-reload
systemctl mask pm2-samprimeaux.service 2>/dev/null || true
systemctl enable pm2-agentsam.service 2>/dev/null || true

# Cron as root — do not rely on samprimeaux sudo inside cron.
CRON_LINE="*/5 * * * * ${VM_EXECOS}/deploy/gcp/health-watchdog.sh >> /var/log/iam-watchdog.log 2>&1"
( sudo crontab -l 2>/dev/null | grep -v 'health-watchdog' | grep -v 'iam-execos-health-watchdog' || true
  echo "$CRON_LINE"
) | sudo crontab -
# Remove legacy samprimeaux watchdog line if present
( sudo -u samprimeaux crontab -l 2>/dev/null | grep -v 'health-watchdog' | grep -v 'iam-execos-health-watchdog' || true
) | sudo -u samprimeaux crontab - 2>/dev/null || true

echo "=== cron (root) ==="
sudo crontab -l | grep -E 'health-watchdog|iam-execos' || true
echo "=== pm2-samprimeaux masked ==="
systemctl status pm2-samprimeaux --no-pager 2>&1 | head -5 || true
REMOTE

echo "✓ Watchdog cron + pm2-samprimeaux mask applied on ${GCP_VM_NAME}"
