#!/usr/bin/env bash
# Sync MESHYAI_API_KEY → .env.cloudflare + Worker secret.
#
# Usage (recommended — prompts for key, input hidden):
#   ./scripts/sync-meshy-api-key.sh
#
# Optional:
#   ./scripts/sync-meshy-api-key.sh --paste     # read from macOS clipboard
#   printf '%s' 'msy-...' | ./scripts/sync-meshy-api-key.sh --stdin
#   ./scripts/sync-meshy-api-key.sh --check
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOUD_ENV="$REPO_ROOT/.env.cloudflare"
WRANGLER_CFG="$REPO_ROOT/wrangler.production.toml"
MODE="prompt"
CHECK_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    --paste) MODE="paste" ;;
    --stdin) MODE="stdin" ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

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

looks_like_meshy_key() {
  local k="$1"
  [[ "$k" =~ ^msy[-_][A-Za-z0-9_-]+$ ]] && return 0
  [[ "$k" == "msy_dummy_api_key_for_test_mode_12345678" ]] && return 0
  return 1
}

reject_bad_key() {
  local k="$1"
  if looks_like_meshy_key "$k"; then
    return 0
  fi
  echo "ERROR: that does not look like a Meshy API key." >&2
  echo "  Expected format: msy-... or msy_... (from meshy.ai → Settings → API)" >&2
  echo "  Got preview: $(mask_key "$k")" >&2
  if [[ "$k" == *"cd "* || "$k" == *"./scripts"* || "$k" == *"pbpaste"* || "$k" == *".sh"* ]]; then
    echo "  Hint: your clipboard had shell commands, not the key. Copy the key from meshy.ai first." >&2
  fi
  exit 1
}

if [[ "$CHECK_ONLY" == true ]]; then
  line_status "$CLOUD_ENV" "MESHYAI_API_KEY"
  echo ""
  echo "Worker secret names (values are write-only):"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$WRANGLER_CFG" \
    | grep -E 'MESHYAI_API_KEY' || true
  echo ""
  echo "To sync (interactive prompt): ./scripts/sync-meshy-api-key.sh"
  exit 0
fi

KEY=""
case "$MODE" in
  prompt)
    if [[ -p /dev/stdin ]] && [[ ! -t 0 ]]; then
      echo "NOTE: stdin is piped — reading piped value. For a hidden prompt, run without pbpaste:" >&2
      echo "      ./scripts/sync-meshy-api-key.sh" >&2
      KEY="$(cat)"
    else
      echo "Paste your Meshy API key from meshy.ai → Settings → API (input hidden, Enter to submit):"
      read -rs KEY
      echo
    fi
    ;;
  paste)
    if ! command -v pbpaste >/dev/null 2>&1; then
      echo "ERROR: pbpaste not found (macOS only). Use ./scripts/sync-meshy-api-key.sh instead." >&2
      exit 1
    fi
    KEY="$(pbpaste)"
    ;;
  stdin)
    KEY="$(cat)"
    ;;
esac

KEY="$(printf '%s' "$KEY" | tr -d '\n\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [[ -z "$KEY" ]]; then
  echo "ERROR: empty MESHYAI_API_KEY" >&2
  exit 1
fi

reject_bad_key "$KEY"

echo "VALIDATE: Meshy API balance check..."
BALANCE_HTTP="$(curl -sS -o /tmp/meshy_balance.json -w '%{http_code}' \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  "https://api.meshy.ai/openapi/v1/balance" || echo "000")"
if [[ "$BALANCE_HTTP" != "200" ]]; then
  echo "ERROR: Meshy rejected this key (HTTP ${BALANCE_HTTP})." >&2
  if [[ -f /tmp/meshy_balance.json ]]; then
    head -c 300 /tmp/meshy_balance.json >&2
    echo >&2
  fi
  echo "  Get a fresh key at https://www.meshy.ai/settings/api" >&2
  exit 1
fi
BALANCE_VAL="$(python3 -c "import json; d=json.load(open('/tmp/meshy_balance.json')); print(d.get('balance', d.get('credits', '?')))" 2>/dev/null || echo "?")"
echo "  Meshy balance: ${BALANCE_VAL}"

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

echo ""
echo "BYOK: upserting meshy row in dashboard (user_api_keys)..."
if "$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$REPO_ROOT/scripts/sync-meshy-byok-only.mjs"; then
  echo "BYOK: meshy row aligned"
else
  echo "WARN: BYOK upsert failed — platform wrangler secret is still updated." >&2
  echo "WARN: BYOK upsert failed — align automation mint secret first:" >&2
  echo "  npm run sync:agent-session-mint -- --generate" >&2
  echo "  ./scripts/with-cloudflare-env.sh node scripts/sync-meshy-byok-only.mjs" >&2
fi

echo ""
echo "SMOKE (optional — needs logged-in session or mint):"
echo "  curl -s -b \"session=...\" -H \"X-IAM-Workspace-Id: ws_inneranimalmedia\" \\"
echo "    https://inneranimalmedia.com/api/cad/meshy/balance | jq"
echo ""
echo "OK: MESHYAI_API_KEY → .env.cloudflare + Worker secret + BYOK (when mint secret present)"
