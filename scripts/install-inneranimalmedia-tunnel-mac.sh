#!/usr/bin/env bash
# Run the inneranimalmedia Cloudflare Tunnel on this Mac WITHOUT replacing samsmac.
#
# Mac layout (two tunnels, two cloudflared processes):
#   LaunchDaemon  com.cloudflare.cloudflared          → samsmac (localpty.inneranimalmedia.com)
#   LaunchAgent   com.cloudflare.cloudflared.inneranimalmedia → inneranimalmedia (terminal + iam-vpc)
#
# Do NOT run: sudo cloudflared service install <inneranimalmedia-token>
# That conflicts with the existing system daemon (samsmac).
#
# Usage:
#   ./scripts/install-inneranimalmedia-tunnel-mac.sh
#   TUNNEL_TOKEN='eyJ...' ./scripts/install-inneranimalmedia-tunnel-mac.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.cloudflare.cloudflared.inneranimalmedia"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
CLOUDFLARED="${CLOUDFLARED_BIN:-$(command -v cloudflared || true)}"

# Default: inneranimalmedia tunnel token (aa79ecd4-d8c6-4c40-bc17-09f9ae230508)
TUNNEL_TOKEN="${TUNNEL_TOKEN:-eyJhIjoiZWRlNjU5MGFjMGQyZmI3ZGFmMTU1YjM1NjUzNDU3YjIiLCJ0IjoiYWE3OWVjZDQtZDhjNi00YzQwLWJjMTctMDlmOWFlMjMwNTA4IiwicyI6IlkyUmhZalk0Wm1JdE1HUTJZUzAwWVdSbExUa3pPR1V0TnpJNE16TXpaVGszTVdVd09EWmlOVFV4WkRrdE56WmxaaTAwTjJaakxUbGxOV1F0WkdReVpUQTBNekZoWXpkbSJ9}"

if [[ -z "$CLOUDFLARED" || ! -x "$CLOUDFLARED" ]]; then
  echo "✗ cloudflared not found. brew install cloudflared" >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${CLOUDFLARED}</string>
    <string>tunnel</string>
    <string>run</string>
    <string>--token</string>
    <string>${TUNNEL_TOKEN}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/Library/Logs/cloudflared-inneranimalmedia.out.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/Library/Logs/cloudflared-inneranimalmedia.err.log</string>
  <key>ThrottleInterval</key>
  <integer>5</integer>
</dict>
</plist>
EOF

chmod 644 "$PLIST"
echo "→ Wrote ${PLIST}"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl start "$LABEL" 2>/dev/null || true

sleep 3
echo ""
echo "=== Tunnel status (this Mac) ==="
echo "samsmac (system):     $(sudo launchctl list com.cloudflare.cloudflared 2>/dev/null | awk 'NR==2{print "pid "$1" exit "$2}')"
echo "inneranimalmedia (user): $(launchctl list "$LABEL" 2>/dev/null | awk 'NR==2{print "pid "$1" exit "$2}' || echo 'not loaded')"

for host in localpty.inneranimalmedia.com terminal.inneranimalmedia.com; do
  code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "https://${host}/health" 2>/dev/null || echo 000)"
  echo "health ${host} → HTTP ${code}"
done

echo ""
echo "✓ inneranimalmedia tunnel agent installed."
echo "  Logs: ~/Library/Logs/cloudflared-inneranimalmedia.{out,err}.log"
echo "  CF dashboard → Tunnels → inneranimalmedia should show +1 replica (darwin_arm64)."
