#!/usr/bin/env bash
# One last terminal/tunnel diagnostic using CLOUDFLARE_API_TOKEN.
# Run from repo root: ./scripts/with-cloudflare-env.sh ./scripts/terminal-debug.sh
# Optional: TERMINAL_WS_URL=https://terminal.inneranimalmedia.com TERMINAL_SECRET=xxx ./scripts/with-cloudflare-env.sh ./scripts/terminal-debug.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-ede6590ac0d2fb7daf155b35653457b2}"
BASE="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}"
TERMINAL_WS_URL="${TERMINAL_WS_URL:-https://terminal.inneranimalmedia.com}"
# TERMINAL_SECRET not required for this script; we only test if the host responds.

echo "=== 1. List tunnels (account $ACCOUNT_ID) ==="
TUNNELS_JSON=$(curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN required}" \
  "${BASE}/cfd_tunnel")
echo "$TUNNELS_JSON" | jq -r '.result[]? | "  \(.name)  id=\(.id)  status=\(.status // "n/a")"' 2>/dev/null || echo "$TUNNELS_JSON"

echo ""
echo "=== 2. Tunnel details (first tunnel with 'terminal' in name or first tunnel) ==="
TUNNEL_ID=$(echo "$TUNNELS_JSON" | jq -r '(.result[]? | select(.name | test("terminal"; "i")) | .id) // .result[0].id // empty')
if [[ -z "$TUNNEL_ID" ]]; then
  echo "  No tunnels found."
else
  echo "  Tunnel ID: $TUNNEL_ID"
  DETAIL=$(curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" "${BASE}/cfd_tunnel/${TUNNEL_ID}")
  echo "$DETAIL" | jq -r '
    .result | "  status: \(.status // "n/a")\n  connections: \(.connections | length)\n  conns_active_at: \(.conns_active_at // "null")"
  ' 2>/dev/null || echo "$DETAIL"
fi

echo ""
echo "=== 3. WebSocket upgrade test: $TERMINAL_WS_URL ==="
# Use HTTPS URL; we want to see 101 (OK), 426 (need Upgrade), 403 (blocked), or connection error.
WS_HOST="${TERMINAL_WS_URL#https://}"
WS_HOST="${WS_HOST#http://}"
WS_HOST="${WS_HOST%%/*}"
RESP=$(curl -sS -i -o /tmp/terminal-debug-response.txt -w "%{http_code}" \
  --connect-timeout 5 \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://${WS_HOST}/" 2>/dev/null || true)
echo "  HTTP status: ${RESP:- (curl failed)}"
if [[ -f /tmp/terminal-debug-response.txt ]]; then
  head -20 /tmp/terminal-debug-response.txt | sed 's/^/  /'
  rm -f /tmp/terminal-debug-response.txt
fi

echo ""
echo "=== 4. Worker log hint ==="
echo "  After opening the Terminal tab, check Workers → inneranimalmedia → Logs for:"
echo "  - [terminal/ws] upstream status: XXX  (if not 101, upstream rejected)"
echo "  - [terminal/ws] closed: client   (browser/dashboard closed)"
echo "  - [terminal/ws] closed: upstream (tunnel or terminal server closed)"
echo ""
echo "  If you see 'closed: upstream', the tunnel or node server is ending the connection."
echo "  If you see 'closed: client', React or the dashboard is closing it."
