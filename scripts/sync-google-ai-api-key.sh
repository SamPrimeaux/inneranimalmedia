#!/usr/bin/env bash
# Sync GOOGLE_AI_API_KEY from .env.agentsam.local → Worker secret + .env.cloudflare
# Usage:
#   ./scripts/sync-google-ai-api-key.sh           # sync + verify
#   ./scripts/sync-google-ai-api-key.sh --check   # verify local + worker name only
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_ENV="${AGENTSAM_ENV_FILE:-$REPO_ROOT/.env.agentsam.local}"
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

test_google_key() {
  local key="$1"
  local code body
  code="$(curl -sS -o /tmp/iam_google_key_probe.json -w '%{http_code}' \
    "https://generativelanguage.googleapis.com/v1beta/models?key=${key}")"
  if [[ "$code" == "200" ]]; then
    echo "google_api: ok (HTTP 200 models list)"
    return 0
  fi
  body="$(python3 -c "import json; d=json.load(open('/tmp/iam_google_key_probe.json')); print((d.get('error') or {}).get('message','')[:160])" 2>/dev/null || true)"
  echo "google_api: FAIL (HTTP $code) ${body:-unknown}" >&2
  return 1
}

line_status() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    echo "$file: missing file"
    return
  fi
  local val
  val="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//' || true)"
  if [[ -z "$val" ]]; then
    echo "$file: $key not set"
  else
    echo "$file: $key $(mask_key "$val")"
  fi
}

echo "=== GOOGLE_AI_API_KEY status ==="
line_status "$LOCAL_ENV" "GOOGLE_AI_API_KEY"
line_status "$CLOUD_ENV" "GOOGLE_AI_API_KEY"

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "ERROR: $LOCAL_ENV not found" >&2
  exit 1
fi

set +u
# shellcheck source=/dev/null
source "$LOCAL_ENV"
set -u

KEY="${GOOGLE_AI_API_KEY:-${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}}"
if [[ -z "$KEY" ]]; then
  echo "ERROR: no GOOGLE_AI_API_KEY / GEMINI_API_KEY / GOOGLE_API_KEY in $LOCAL_ENV" >&2
  exit 1
fi

echo "local source: $(mask_key "$KEY")"
test_google_key "$KEY"

if [[ "$CHECK_ONLY" == true ]]; then
  echo ""
  echo "Worker secret names (values are write-only):"
  "$REPO_ROOT/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$WRANGLER_CFG" \
    | grep -E 'GOOGLE_AI_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY' || true
  echo ""
  echo "To sync local → Worker + .env.cloudflare: ./scripts/sync-google-ai-api-key.sh"
  exit 0
fi

if [[ ! -f "$CLOUD_ENV" ]]; then
  echo "ERROR: $CLOUD_ENV not found (needed for wrangler auth)" >&2
  exit 1
fi

python3 - "$CLOUD_ENV" "$KEY" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
key = "GOOGLE_AI_API_KEY"
value = sys.argv[2]
new_line = f'{key}="{value}"'

lines = env_path.read_text().splitlines()
out = []
found = False
for line in lines:
    if line.strip().startswith(f"{key}="):
        if not found:
            out.append(new_line)
            found = True
    else:
        out.append(line)
if not found:
    out.append(new_line)
env_path.write_text("\n".join(out) + "\n")
PY

echo "Updated: $CLOUD_ENV"

printf '%s' "$KEY" | "$REPO_ROOT/scripts/with-cloudflare-env.sh" \
  npx wrangler secret put GOOGLE_AI_API_KEY -c "$WRANGLER_CFG"

echo "Worker secret: GOOGLE_AI_API_KEY updated"
echo ""
echo "VERIFY:"
line_status "$CLOUD_ENV" "GOOGLE_AI_API_KEY"
test_google_key "$KEY"
echo "OK: GOOGLE_AI_API_KEY → Worker secret + .env.cloudflare"
