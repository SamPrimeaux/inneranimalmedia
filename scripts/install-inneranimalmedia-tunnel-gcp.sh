#!/usr/bin/env bash
# Reinstall inneranimalmedia Cloudflare Tunnel connector on GCP iam-tunnel (linux_amd64 replica).
#
# Usage:
#   ./scripts/install-inneranimalmedia-tunnel-gcp.sh
#   TUNNEL_TOKEN='eyJ...' ./scripts/install-inneranimalmedia-tunnel-gcp.sh --dry-run
#
# Token: same as Mac LaunchAgent (install-inneranimalmedia-tunnel-mac.sh) — NOT samsmac.
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

# Default: inneranimalmedia tunnel token (aa79ecd4-d8c6-4c40-bc17-09f9ae230508) — same as Mac user LaunchAgent
TUNNEL_TOKEN="${TUNNEL_TOKEN:-${INNERANIMALMEDIA_TUNNEL_TOKEN:-eyJhIjoiZWRlNjU5MGFjMGQyZmI3ZGFmMTU1YjM1NjUzNDU3YjIiLCJ0IjoiYWE3OWVjZDQtZDhjNi00YzQwLWJjMTctMDlmOWFlMjMwNTA4IiwicyI6IlkyUmhZalk0Wm1JdE1HUTJZUzAwWVdSbExUa3pPR1V0TnpJNE16TXpaVGszTVdVd09EWmlOVFV4WkRrdE56WmxaaTAwTjJaakxUbGxOV1F0WkdReVpUQTBNekZoWXpkbSJ9}}"

if [[ -z "$GCP_PROJECT" || -z "$GCP_ZONE_VAL" ]]; then
  echo "✗ Set GCP_PROJECT_ID and GCP_ZONE in .env.cloudflare" >&2
  exit 1
fi
if [[ -z "$TUNNEL_TOKEN" ]]; then
  echo "✗ TUNNEL_TOKEN or INNERANIMALMEDIA_TUNNEL_TOKEN required" >&2
  exit 1
fi

REMOTE_SCRIPT="$(cat <<'REMOTE'
set -euo pipefail
TOKEN="$(printf '%s' "$1" | base64 -d)"
echo "→ cloudflared version: $(cloudflared --version 2>/dev/null | head -1 || echo missing)"
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "Installing cloudflared…"
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main" | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y cloudflared
fi
echo "→ Stop + uninstall existing cloudflared service"
sudo systemctl stop cloudflared 2>/dev/null || true
sudo cloudflared service uninstall 2>/dev/null || true
echo "→ Install inneranimalmedia tunnel token"
sudo cloudflared service install "$TOKEN"
# Type=notify + 15s timeout causes systemd flap when connector retries; use simple + no start timeout.
if [[ -f /etc/systemd/system/cloudflared.service ]]; then
  sudo sed -i 's/^Type=notify/Type=simple/' /etc/systemd/system/cloudflared.service
  sudo sed -i 's/^TimeoutStartSec=.*/TimeoutStartSec=0/' /etc/systemd/system/cloudflared.service
fi
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl restart cloudflared
sleep 6
echo "=== systemctl ==="
systemctl is-active cloudflared || true
systemctl status cloudflared --no-pager 2>&1 | head -12 || true
echo "=== journal (last 8) ==="
journalctl -u cloudflared -n 8 --no-pager 2>/dev/null || true
echo "=== iam-pty :3099 ==="
curl -sf -m 5 http://127.0.0.1:3099/health || echo "iam-pty health failed"
REMOTE
)"

if (( DRY_RUN )); then
  echo "[dry-run] would ssh ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL}) and reinstall cloudflared"
  exit 0
fi

TOKEN_B64="$(printf '%s' "$TUNNEL_TOKEN" | base64 | tr -d '\n')"
echo "→ GCP ${GCP_VM_NAME} (${GCP_PROJECT}/${GCP_ZONE_VAL}) — inneranimalmedia tunnel connector"
gcloud compute ssh "$GCP_VM_NAME" \
  --project="$GCP_PROJECT" \
  --zone="$GCP_ZONE_VAL" \
  --command="bash -s -- '${TOKEN_B64}'" <<< "$REMOTE_SCRIPT"

echo ""
echo "→ Sync iam-pty env + PM2"
"${REPO_ROOT}/scripts/install-terminal-tunnel-env.sh" --gcp-only 2>/dev/null || true

echo ""
echo "=== Public health ==="
for host in terminal.inneranimalmedia.com sandboxterminal.inneranimalmedia.com; do
  code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "https://${host}/health" 2>/dev/null || echo 000)"
  body="$(curl -sS -m 15 "https://${host}/health" 2>/dev/null | head -c 120 || true)"
  echo "  ${host} → HTTP ${code}  ${body}"
done

echo ""
echo "CF Zero Trust → Tunnels → inneranimalmedia → expect linux_amd64 (GCP) + darwin_arm64 (Mac optional)"
