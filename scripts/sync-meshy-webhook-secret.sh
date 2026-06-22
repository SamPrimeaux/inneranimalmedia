#!/usr/bin/env bash
# Sync MESHYAI_WEBHOOK_SECRET → .env.cloudflare + Worker secret.
# Copy from meshy.ai → Settings → API → Webhooks → Secret (eye icon).
#
# Usage (recommended — hidden prompt):
#   ./scripts/sync-meshy-webhook-secret.sh
#
# Optional:
#   ./scripts/sync-meshy-webhook-secret.sh --paste
#   ./scripts/sync-meshy-webhook-secret.sh --check
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOUD_ENV="$REPO_ROOT/.env.cloudflare"
WRANGLER_CFG="$REPO_ROOT/wrangler.production.toml"
VAR_NAME="MESHYAI_WEBHOOK_SECRET"
MODE="prompt"
CHECK_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    --paste) MODE="paste" ;;
    --stdin) MODE="stdin" ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

mask_secret() {
  local v="$1"
  local len=${#v}
  if [[ "$len" -eq 0 ]]; then
    echo "<missing>"
  elif [[ "$len" -le 8 ]]; then
    echo "<set:${len}chars>"
  else
    echo "${v:0:6}...${v: -4} (${len} chars)"
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
  echo "$file: $(mask_secret "$val")"
}

if [[ "$CHECK_ONLY" == true ]]; then
  line_status "$CLOUD_ENV" "$VAR_NAME"
  echo ""
  echo "Worker secret names (values are write-only):"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$WRANGLER_CFG" \
    | grep -E "$VAR_NAME" || true
  echo ""
  echo "Webhook URL in Meshy: https://inneranimalmedia.com/api/webhooks/meshy"
  echo "To sync: ./scripts/sync-meshy-webhook-secret.sh"
  exit 0
fi

SECRET=""
case "$MODE" in
  prompt)
    if [[ -p /dev/stdin ]] && [[ ! -t 0 ]]; then
      echo "NOTE: stdin is piped — reading piped value. For a hidden prompt, run without pbpaste:" >&2
      echo "      ./scripts/sync-meshy-webhook-secret.sh" >&2
      SECRET="$(cat)"
    else
      echo "Paste Meshy webhook secret (meshy.ai → Settings → API → Webhooks → Secret, eye icon):"
      read -rs SECRET
      echo
    fi
    ;;
  paste)
    if ! command -v pbpaste >/dev/null 2>&1; then
      echo "ERROR: pbpaste not found (macOS only). Use ./scripts/sync-meshy-webhook-secret.sh instead." >&2
      exit 1
    fi
    SECRET="$(pbpaste)"
    ;;
  stdin)
    SECRET="$(cat)"
    ;;
esac

SECRET="$(printf '%s' "$SECRET" | tr -d '\n\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [[ -z "$SECRET" ]]; then
  echo "ERROR: empty $VAR_NAME" >&2
  exit 1
fi
if [[ ${#SECRET} -lt 16 ]]; then
  echo "ERROR: secret looks too short (${#SECRET} chars). Copy the full value from Meshy webhooks." >&2
  exit 1
fi

if [[ ! -f "$CLOUD_ENV" ]]; then
  echo "ERROR: $CLOUD_ENV not found — copy from .env.cloudflare.example" >&2
  exit 1
fi

"$REPO_ROOT/scripts/upsert-env-cloudflare-var.sh" "$VAR_NAME" <<<"$SECRET"

printf '%s' "$SECRET" | "$REPO_ROOT/scripts/with-cloudflare-env.sh" \
  npx wrangler secret put "$VAR_NAME" -c "$WRANGLER_CFG"

echo ""
echo "VERIFY:"
line_status "$CLOUD_ENV" "$VAR_NAME"
echo "Worker secret: $VAR_NAME updated (production inneranimalmedia)"
echo "OK: $VAR_NAME → .env.cloudflare + Worker secret"
