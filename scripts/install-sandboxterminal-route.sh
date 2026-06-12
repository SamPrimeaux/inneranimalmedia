#!/usr/bin/env bash
# Add sandboxterminal.inneranimalmedia.com to the inneranimalmedia Cloudflare Tunnel (GCP iam-pty :3099).
# Also restarts GCP cloudflared + iam-pty when gcloud is available.
#
# Usage:
#   ./scripts/with-cloudflare-env.sh ./scripts/install-sandboxterminal-route.sh
#   ./scripts/install-sandboxterminal-route.sh --dry-run
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

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-ede6590ac0d2fb7daf155b35653457b2}"
TUNNEL_ID="${CF_TUNNEL_ID:-aa79ecd4-d8c6-4c40-bc17-09f9ae230508}"
TUNNEL_NAME="${CF_TUNNEL_NAME:-inneranimalmedia}"
HOST_SANDBOX="sandboxterminal.inneranimalmedia.com"
HOST_TERMINAL="terminal.inneranimalmedia.com"
SERVICE="http://localhost:3099"
API_BASE="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "✗ CLOUDFLARE_API_TOKEN required (source .env.cloudflare)" >&2
  exit 1
fi

auth_hdr=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")

merge_ingress() {
  local current="$1"
  python3 - <<'PY' "$current" "$HOST_TERMINAL" "$HOST_SANDBOX" "$SERVICE"
import json, sys
current = json.loads(sys.argv[1] or "{}")
terminal, sandbox, service = sys.argv[2], sys.argv[3], sys.argv[4]
ingress = list((current.get("config") or {}).get("ingress") or [])
if not ingress:
    ingress = []

def upsert(hostname):
    global ingress
    kept = [r for r in ingress if r.get("hostname") != hostname]
    kept.insert(0, {"hostname": hostname, "service": service, "originRequest": {}})
    ingress = kept

upsert(terminal)
upsert(sandbox)
# catch-all must be last
ingress = [r for r in ingress if r.get("hostname")]
ingress.append({"service": "http_status:404"})
print(json.dumps({"config": {"ingress": ingress}}))
PY
}

echo "→ Fetch tunnel configuration (${TUNNEL_NAME} / ${TUNNEL_ID})"
if (( DRY_RUN )); then
  echo "[dry-run] would GET ${API_BASE}/cfd_tunnel/${TUNNEL_ID}/configurations"
else
  CURR="$(curl -sS "${auth_hdr[@]}" "${API_BASE}/cfd_tunnel/${TUNNEL_ID}/configurations")"
  if ! echo "$CURR" | jq -e '.success == true' >/dev/null 2>&1; then
    echo "✗ Failed to read tunnel config:" >&2
    echo "$CURR" | jq . 2>/dev/null || echo "$CURR" >&2
    exit 1
  fi
  PAYLOAD="$(merge_ingress "$(echo "$CURR" | jq -c '.result // {}')")"
  echo "→ PUT ingress (terminal + sandboxterminal → ${SERVICE})"
  PUT_RES="$(curl -sS -X PUT "${auth_hdr[@]}" \
    "${API_BASE}/cfd_tunnel/${TUNNEL_ID}/configurations" \
    --data "$PAYLOAD")"
  if ! echo "$PUT_RES" | jq -e '.success == true' >/dev/null 2>&1; then
    echo "✗ Failed to update tunnel config:" >&2
    echo "$PUT_RES" | jq . 2>/dev/null || echo "$PUT_RES" >&2
    exit 1
  fi
  echo "OK: tunnel ingress updated"
  echo "$PUT_RES" | jq -r '.result.config.ingress[]? | "  \(.hostname // "(catch-all)") → \(.service)"' 2>/dev/null || true
fi

if command -v cloudflared >/dev/null 2>&1; then
  echo "→ DNS route (cloudflared tunnel route dns)"
  if (( DRY_RUN )); then
    echo "[dry-run] cloudflared tunnel route dns ${TUNNEL_NAME} ${HOST_SANDBOX}"
  else
    # Use tunnel UUID + -f: tunnel *name* can still point at a deleted tunnel (de599bdf…) in CF routing metadata.
    cloudflared tunnel route dns -f "${TUNNEL_ID}" "${HOST_SANDBOX}" 2>/dev/null \
      || echo "  (DNS route may already exist — check CF dashboard)"
  fi
fi

echo "→ GCP iam-tunnel restart (cloudflared + iam-pty)"
if (( DRY_RUN )); then
  echo "[dry-run] ./scripts/gcp-iam-tunnel-restart.sh --dry-run"
else
  "${REPO_ROOT}/scripts/gcp-iam-tunnel-restart.sh" || echo "⚠ GCP restart failed — run manually when VM is reachable"
fi

echo ""
echo "=== Health ==="
for host in "${HOST_SANDBOX}" "${HOST_TERMINAL}" localpty.inneranimalmedia.com; do
  code="$(curl -sS -m 12 -o /dev/null -w '%{http_code}' "https://${host}/health" 2>/dev/null || echo 000)"
  echo "  https://${host}/health → HTTP ${code}"
done

echo ""
echo "If sandboxterminal health is 530/1033, finish in Cloudflare Zero Trust UI:"
echo "  Networks → Tunnels → ${TUNNEL_NAME} → + Add route → Published application"
echo "  Hostname: ${HOST_SANDBOX}  Service: ${SERVICE}"
echo "  (Remove any stale hostname route on deleted tunnels — cloudflared may show tunnelID=de599bdf…)"
echo ""
echo "CF Zero Trust → Tunnels → ${TUNNEL_NAME} should show linux_amd64 (GCP) + optional darwin_arm64 (Mac dev)."
