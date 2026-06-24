#!/usr/bin/env bash
# Align AGENT_SESSION_MINT_SECRET → .env.cloudflare + Worker secret (+ optional MCP worker).
#
# Usage:
#   ./scripts/sync-agent-session-mint-secret.sh          # hidden prompt (paste existing key)
#   ./scripts/sync-agent-session-mint-secret.sh --generate # new iam_agent_mint_* key (fixes mismatch)
#   ./scripts/sync-agent-session-mint-secret.sh --check
#   ./scripts/sync-agent-session-mint-secret.sh --verify   # mint smoke after sync
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLOUD_ENV="$REPO_ROOT/.env.cloudflare"
WRANGLER_CFG="$REPO_ROOT/wrangler.production.toml"
MODE="prompt"
CHECK_ONLY=false
VERIFY_ONLY=false
GENERATE=false

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    --verify) VERIFY_ONLY=true ;;
    --generate) GENERATE=true; MODE="generate" ;;
    --stdin) MODE="stdin" ;;
    --paste) MODE="paste" ;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \?//'
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
  if [[ "$len" -eq 0 ]]; then echo "<missing>"; elif [[ "$len" -le 12 ]]; then echo "<set:${len}chars>"; else echo "${v:0:12}...${v: -4} (${len} chars)"; fi
}

line_status() {
  local file="$1" key="$2"
  if [[ ! -f "$file" ]]; then echo "$file: missing file"; return; fi
  local val
  val="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'" || true)"
  echo "$file: $(mask_key "$val")"
}

looks_like_mint_secret() {
  local k="$1"
  [[ "$k" =~ ^iam_agent_mint_[A-Za-z0-9_-]+$ ]] && return 0
  [[ ${#k} -ge 32 ]] && return 0
  return 1
}

mint_verify() {
  echo "VERIFY: POST /api/auth/agent-session/mint (retries while Worker secret propagates) ..."
  if "$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$REPO_ROOT/scripts/verify-agent-session-mint.mjs"; then
    echo "  Session mint: OK"
    return 0
  else
    echo "  Session mint: FAILED" >&2
    return 1
  fi
}

if [[ "$CHECK_ONLY" == true ]]; then
  line_status "$CLOUD_ENV" "AGENT_SESSION_MINT_SECRET"
  echo ""
  echo "Worker secret names (values are write-only):"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$WRANGLER_CFG" \
    | grep -E 'AGENT_SESSION_MINT_SECRET' || echo "  (not listed on worker)"
  echo ""
  echo "Fix mismatch:  npm run sync:agent-session-mint -- --generate"
  echo "Then retry:    ./scripts/with-cloudflare-env.sh node scripts/sync-meshy-byok-only.mjs"
  exit 0
fi

if [[ "$VERIFY_ONLY" == true ]]; then
  mint_verify
  exit 0
fi

KEY=""
case "$MODE" in
  generate)
    KEY="iam_agent_mint_$(openssl rand -hex 24)"
    echo "Generated new AGENT_SESSION_MINT_SECRET ($(mask_key "$KEY"))"
    ;;
  prompt)
    if [[ -p /dev/stdin ]] && [[ ! -t 0 ]]; then
      KEY="$(cat)"
    else
      echo "Paste AGENT_SESSION_MINT_SECRET (must match Worker, or use --generate for a fresh key):"
      read -rs KEY
      echo
    fi
    ;;
  paste)
    KEY="$(pbpaste)"
    ;;
  stdin)
    KEY="$(cat)"
    ;;
esac

KEY="$(printf '%s' "$KEY" | tr -d '\n\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [[ -z "$KEY" ]]; then
  echo "ERROR: empty AGENT_SESSION_MINT_SECRET" >&2
  exit 1
fi

if [[ "$MODE" != "generate" ]] && ! looks_like_mint_secret "$KEY"; then
  echo "WARN: key format unusual (expected iam_agent_mint_* or long random string)" >&2
fi

if [[ ! -f "$CLOUD_ENV" ]]; then
  echo "ERROR: $CLOUD_ENV not found" >&2
  exit 1
fi

"$REPO_ROOT/scripts/upsert-env-cloudflare-var.sh" AGENT_SESSION_MINT_SECRET <<<"$KEY"

printf '%s' "$KEY" | "$REPO_ROOT/scripts/with-cloudflare-env.sh" \
  npx wrangler secret put AGENT_SESSION_MINT_SECRET -c "$WRANGLER_CFG"

echo ""
line_status "$CLOUD_ENV" "AGENT_SESSION_MINT_SECRET"
echo "Worker secret: AGENT_SESSION_MINT_SECRET updated (inneranimalmedia)"

echo ""
mint_verify || {
  echo "WARN: mint still failed after retries — run: npm run sync:agent-session-mint:verify" >&2
  exit 1
}

echo ""
echo "OK: AGENT_SESSION_MINT_SECRET aligned. Retry Meshy BYOK:"
echo "  ./scripts/with-cloudflare-env.sh node scripts/sync-meshy-byok-only.mjs"
