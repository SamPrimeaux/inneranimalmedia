#!/usr/bin/env bash
# One-time iam-tunnel setup: agentsam GitHub SSH + self-heal cron.
# Run from Mac repo root after deploy (or anytime the VM lost GitHub access).
#
# Usage:
#   ./scripts/setup-gcp-vm-self-heal-once.sh
#   ./scripts/setup-gcp-vm-self-heal-once.sh --dry-run
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

if ! command -v gcloud >/dev/null 2>&1; then
  echo "✗ gcloud not installed" >&2
  exit 1
fi
if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 1
fi

SELF_HEAL_REMOTE="/home/samprimeaux/inneranimalmedia/scripts/gcp-vm-self-heal.sh"

REMOTE_CMD="$(cat <<EOF
set -euo pipefail
AGENTSAM_USER=agentsam
SAM_HOME=/home/samprimeaux
SAM_SSH="\${SAM_HOME}/.ssh"
AGENTSAM_SSH=/var/lib/agentsam/.ssh
SELF_HEAL_REMOTE='${SELF_HEAL_REMOTE}'
CRON_LINE='*/5 * * * * ${SELF_HEAL_REMOTE} >> /var/log/iam-self-heal.log 2>&1'

if [[ ! -f "\${SAM_SSH}/id_ed25519" ]]; then
  echo "✗ Missing \${SAM_SSH}/id_ed25519 — run ./scripts/install-terminal-github-cli.sh --gcp-only first" >&2
  exit 1
fi

echo "→ install GitHub SSH for \${AGENTSAM_USER}"
install -d -m 700 -o "\${AGENTSAM_USER}" -g "\${AGENTSAM_USER}" "\${AGENTSAM_SSH}"
install -m 600 -o "\${AGENTSAM_USER}" -g "\${AGENTSAM_USER}" "\${SAM_SSH}/id_ed25519" "\${AGENTSAM_SSH}/id_ed25519"
if [[ -f "\${SAM_SSH}/id_ed25519.pub" ]]; then
  install -m 644 -o "\${AGENTSAM_USER}" -g "\${AGENTSAM_USER}" "\${SAM_SSH}/id_ed25519.pub" "\${AGENTSAM_SSH}/id_ed25519.pub"
fi
cat > "\${AGENTSAM_SSH}/config" <<'SSHEOF'
# IAM PTY — GitHub SSH (agentsam runtime — setup-gcp-vm-self-heal-once.sh)
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes

Host github.com-inneranimal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes

Host github-inneranimal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
SSHEOF
chown "\${AGENTSAM_USER}:\${AGENTSAM_USER}" "\${AGENTSAM_SSH}/config"
chmod 600 "\${AGENTSAM_SSH}/config"

echo "→ verify GitHub SSH for \${AGENTSAM_USER}"
sudo -u "\${AGENTSAM_USER}" ssh -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | head -1 || true
# GitHub SSH test exits 1 on success — do not fail the script.
true

for repo in "\${SAM_HOME}/inneranimalmedia" "\${SAM_HOME}/ExecOS"; do
  if [[ -d "\${repo}/.git" ]]; then
    echo "→ git pull \${repo}"
    sudo -u "\${AGENTSAM_USER}" git -C "\${repo}" pull --ff-only || {
      echo "  ⚠ ff-only failed — fetch + reset origin/main"
      sudo -u "\${AGENTSAM_USER}" git -C "\${repo}" fetch origin
      sudo -u "\${AGENTSAM_USER}" git -C "\${repo}" reset --hard origin/main
    }
  fi
done

if [[ -f "\${SELF_HEAL_REMOTE}" ]]; then
  chmod +x "\${SELF_HEAL_REMOTE}"
  echo "→ install root cron for self-heal"
  ( crontab -l 2>/dev/null | grep -v 'gcp-vm-self-heal' || true
    echo "\${CRON_LINE}"
  ) | crontab -
  echo "=== root crontab (self-heal) ==="
  crontab -l | grep gcp-vm-self-heal || true
  echo "→ run self-heal once"
  bash "\${SELF_HEAL_REMOTE}" || true
else
  echo "⚠ \${SELF_HEAL_REMOTE} not found — git pull operator repo first, then re-run this script"
fi
EOF
)"

if (( DRY_RUN )); then
  echo "[dry-run] would configure agentsam GitHub SSH + self-heal cron on ${GCP_VM_NAME}"
  exit 0
fi

echo "→ one-time self-heal setup on ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL})"
gcp_vm_ssh --command="sudo bash -c $(printf '%q' "$REMOTE_CMD")"

echo ""
echo "✓ iam-tunnel self-heal ready. Logs: /var/log/iam-self-heal.log"
echo "  deploy:full no longer syncs ExecOS unless IAM_SYNC_GCP_EXECOS=1"
