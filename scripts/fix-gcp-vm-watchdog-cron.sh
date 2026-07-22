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

# Prefer main-repo hardened watchdog (hysteresis + orphan reclaim). Fallback: ExecOS copy.
WATCHDOG_LOCAL="${REPO_ROOT}/scripts/gcp-execos-health-watchdog.sh"
if [[ ! -f "$WATCHDOG_LOCAL" ]]; then
  WATCHDOG_LOCAL="${EXECOS_HOME}/deploy/gcp/health-watchdog.sh"
fi
if [[ ! -f "$WATCHDOG_LOCAL" ]]; then
  echo "✗ Missing scripts/gcp-execos-health-watchdog.sh (and no ExecOS fallback)" >&2
  exit 1
fi

SELF_HEAL_LOCAL="${REPO_ROOT}/scripts/gcp-vm-self-heal.sh"

if (( DRY_RUN )); then
  echo "[dry-run] would fix cron, mask pm2-samprimeaux, deploy ${WATCHDOG_LOCAL} on ${GCP_VM_NAME}"
  exit 0
fi

# shellcheck source=scripts/lib/gcp-vm-ssh.sh
source "${REPO_ROOT}/scripts/lib/gcp-vm-ssh.sh"

gcp_vm_scp "$WATCHDOG_LOCAL" "${GCP_VM_NAME}:/tmp/health-watchdog.sh"
if [[ -f "$SELF_HEAL_LOCAL" ]]; then
  gcp_vm_scp "$SELF_HEAL_LOCAL" "${GCP_VM_NAME}:/tmp/gcp-vm-self-heal.sh"
fi

gcp_vm_ssh --command='sudo bash -s' <<'REMOTE'
set -euo pipefail
VM_EXECOS=/home/samprimeaux/ExecOS
OPERATOR=/home/samprimeaux/inneranimalmedia
install -d "$VM_EXECOS/deploy/gcp" "$OPERATOR/scripts" /var/lib/agentsam/iam-watchdog
chown agentsam:agentsam /var/lib/agentsam/iam-watchdog 2>/dev/null || true
install -m 755 /tmp/health-watchdog.sh "$OPERATOR/scripts/gcp-execos-health-watchdog.sh"
install -m 755 /tmp/health-watchdog.sh "$VM_EXECOS/deploy/gcp/health-watchdog.sh"
if [[ -f /tmp/gcp-vm-self-heal.sh ]]; then
  install -m 755 /tmp/gcp-vm-self-heal.sh "$OPERATOR/scripts/gcp-vm-self-heal.sh"
fi
ln -sfn "$VM_EXECOS" /home/samprimeaux/iam-pty 2>/dev/null || true
ln -sfn "$OPERATOR/scripts/gcp-execos-health-watchdog.sh" /usr/local/sbin/iam-execos-health-watchdog 2>/dev/null || \
  sudo ln -sfn "$OPERATOR/scripts/gcp-execos-health-watchdog.sh" /usr/local/sbin/iam-execos-health-watchdog

# Nuclear: pm2-samprimeaux cannot be started manually or on boot
systemctl stop pm2-samprimeaux.service 2>/dev/null || true
systemctl disable pm2-samprimeaux.service 2>/dev/null || true
if [[ -f /etc/systemd/system/pm2-samprimeaux.service && ! -L /etc/systemd/system/pm2-samprimeaux.service ]]; then
  mv /etc/systemd/system/pm2-samprimeaux.service "/etc/systemd/system/pm2-samprimeaux.service.bak.$(date +%Y%m%d)"
fi
systemctl daemon-reload
systemctl mask pm2-samprimeaux.service 2>/dev/null || true
systemctl enable pm2-agentsam.service 2>/dev/null || true

# Cron as root — hardened watchdog + self-heal (vite ban / git pull).
WATCH_LINE="*/5 * * * * ${OPERATOR}/scripts/gcp-execos-health-watchdog.sh >> /var/log/iam-watchdog.log 2>&1"
HEAL_LINE="*/5 * * * * ${OPERATOR}/scripts/gcp-vm-self-heal.sh >> /var/log/iam-self-heal.log 2>&1"
( sudo crontab -l 2>/dev/null \
    | grep -v 'health-watchdog' \
    | grep -v 'iam-execos-health-watchdog' \
    | grep -v 'gcp-execos-health-watchdog' \
    | grep -v 'gcp-vm-self-heal' \
    || true
  echo "$HEAL_LINE"
  echo "$WATCH_LINE"
) | sudo crontab -
# Remove legacy samprimeaux watchdog line if present
( sudo -u samprimeaux crontab -l 2>/dev/null \
    | grep -v 'health-watchdog' \
    | grep -v 'iam-execos-health-watchdog' \
    | grep -v 'gcp-execos-health-watchdog' \
    || true
) | sudo -u samprimeaux crontab - 2>/dev/null || true

echo "=== cron (root) ==="
sudo crontab -l | grep -E 'health-watchdog|iam-execos|gcp-execos|gcp-vm-self-heal' || true
echo "=== pm2-samprimeaux masked ==="
systemctl status pm2-samprimeaux --no-pager 2>&1 | head -5 || true
REMOTE

echo "✓ Watchdog cron + pm2-samprimeaux mask applied on ${GCP_VM_NAME}"
