#!/usr/bin/env zsh
# Put RealtimeKit platform secrets on production Worker (never commit token values).
# Prefers REALTIMEKIT_API_TOKEN (narrow Realtime Admin); Break Glass is fallback only.
# Mint narrow token: ./scripts/cloudflare/mint-realtimekit-api-token.sh --apply
# Usage: ./scripts/cloudflare/set-realtimekit-worker-secrets.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

APP_ID="${REALTIMEKIT_APP_ID:-08755a39-bfb2-4c6a-b322-527ba7ef0698}"
# Prefer dedicated narrow Realtime Admin token; Break Glass is fallback only.
RTK_TOKEN="${REALTIMEKIT_API_TOKEN:-}"
if [[ -z "$RTK_TOKEN" ]]; then
  RTK_TOKEN="${CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
  if [[ -n "$RTK_TOKEN" ]]; then
    echo "WARN: REALTIMEKIT_API_TOKEN not set — using Break Glass/API token. Mint narrow Realtime Admin in dashboard and set REALTIMEKIT_API_TOKEN in .env.cloudflare." >&2
  fi
fi

if [[ -z "$RTK_TOKEN" ]]; then
  echo "No Realtime Admin token: set CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN or CLOUDFLARE_API_TOKEN in .env.cloudflare" >&2
  exit 1
fi

WRANG=( "${REPO_ROOT}/scripts/with-cloudflare-env.sh" npx wrangler secret put -c "${REPO_ROOT}/wrangler.production.toml" )

echo "Setting REALTIMEKIT_APP_ID on inneranimalmedia worker..."
printf '%s' "$APP_ID" | "${WRANG[@]}" REALTIMEKIT_APP_ID

echo "Setting REALTIMEKIT_API_TOKEN on inneranimalmedia worker..."
printf '%s' "$RTK_TOKEN" | "${WRANG[@]}" REALTIMEKIT_API_TOKEN

echo "Done. Verify: npx wrangler secret list -c wrangler.production.toml | rg REALTIMEKIT"
