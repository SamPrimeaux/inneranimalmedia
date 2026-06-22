#!/usr/bin/env bash
# Sync MESHYAI_API_KEY from stdin / clipboard → .env.cloudflare + Worker secret.
#
# Usage:
#   pbpaste | ./scripts/sync-meshy-api-key.sh
#   printf '%s' 'msk-...' | ./scripts/sync-meshy-api-key.sh
#   ./scripts/sync-meshy-api-key.sh --check
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOUD_ENV="$REPO_ROOT/.env.cloudflare"
WRANGLER_CFG="$REPO_ROOT/wrangler.production.toml"
CHECK_ONLY=false

if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

mask_key() {
  local v="$1"
  local len=${#v}
  if [[ "$len" -eq 0 ]]; then
    echo "<missing>"
  elif [[ "$len" -le 12 ]]; then
    echo "<set:${len}chars>"
  else
    echo "${v:0:8}...${v: -4} (${len} chars)"
  fi
}

line_status() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    echo "$file: missing file"
    return
  fi
  local val
  val="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
  echo "$file: $(mask_key "$val")"
}

if [[ "$CHECK_ONLY" == true ]]; then
  line_status "$CLOUD_ENV" "MESHYAI_API_KEY"
  echo ""
  echo "Worker secret names (values are write-only):"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$WRANGLER_CFG" \
    | grep -E 'MESHYAI_API_KEY' || true
  echo ""
  echo "To sync: pbpaste | ./scripts/sync-meshy-api-key.sh"
  exit 0
fi

if [[ -t 0 ]]; then
  read -rs KEY
  echo
else
  KEY="$(cat)"
fi
KEY="$(printf '%s' "$KEY" | tr -d '\n\r')"
if [[ -z "$KEY" ]]; then
  echo "ERROR: empty MESHYAI_API_KEY" >&2
  exit 1
fi

if [[ ! -f "$CLOUD_ENV" ]]; then
  echo "ERROR: $CLOUD_ENV not found — copy from .env.cloudflare.example" >&2
  exit 1
fi

"$REPO_ROOT/scripts/upsert-env-cloudflare-var.sh" MESHYAI_API_KEY <<<"$KEY"

printf '%s' "$KEY" | "$REPO_ROOT/scripts/with-cloudflare-env.sh" \
  npx wrangler secret put MESHYAI_API_KEY -c "$WRANGLER_CFG"

echo ""
echo "VERIFY:"
line_status "$CLOUD_ENV" "MESHYAI_API_KEY"
echo "Worker secret: MESHYAI_API_KEY updated (production inneranimalmedia)"
echo "OK: MESHYAI_API_KEY → .env.cloudflare + Worker secret"
