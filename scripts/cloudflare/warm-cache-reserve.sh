#!/usr/bin/env zsh
# Seed edge + Cache Reserve with cache-eligible IAM static assets.
#
# Usage:
#   ./scripts/cloudflare/warm-cache-reserve.sh

emulate -R zsh
set -euo pipefail

ORIGIN="${IAM_CACHE_WARM_ORIGIN:-https://inneranimalmedia.com}"
ASSETS="${IAM_ASSETS_ORIGIN:-https://assets.inneranimalmedia.com}"

urls=(
  "${ORIGIN}/static/dashboard/app/dashboard.js"
  "${ORIGIN}/static/dashboard/app/dashboard.css"
  "${ORIGIN}/static/dashboard/app/index.html"
  "${ORIGIN}/manifest.webmanifest"
  "${ASSETS}/cms/themes/meaux-ocean-soft-dark/theme.css"
  "${ASSETS}/cms/themes/meaux-ocean-soft-dark/manifest.json"
  "${ASSETS}/chess-pieces/chess_board_opt.glb"
)

echo "=== Warming cache-eligible URLs ==="
for url in "${urls[@]}"; do
  echo "→ $url"
  headers="$(/usr/bin/curl -sSI "$url" | tr -d '\r')"
  http_status="$(printf '%s\n' "$headers" | awk 'toupper($1) ~ /^HTTP/ {print $2; exit}')"
  cf_cache="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="cf-cache-status" {print $2; exit}')"
  cc="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="cache-control" {print $2; exit}')"
  echo "   HTTP ${http_status:-?}  cf-cache-status=${cf_cache:-n/a}  cache-control=${cc:-n/a}"
done

echo
echo "Re-run after Cache Rules install. Target cf-cache-status: HIT (after 2nd request) for static assets."
