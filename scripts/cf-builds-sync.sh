#!/usr/bin/env bash
# Push Workers Builds settings (build + deploy commands) via Cloudflare API.
# Loads credentials from .env.cloudflare at repo root (same pattern as other scripts).
#
# Usage (from repo root):
#   ./scripts/cf-builds-sync.sh
#
# Optional overrides: WORKER_SERVICE_NAME, WORKER_ENVIRONMENT_NAME

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
else
  echo "ERROR: .env.cloudflare not found at $ENV_FILE" >&2
  exit 1
fi

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"
SERVICE="${WORKER_SERVICE_NAME:-inneranimalmedia}"
ENV_NAME="${WORKER_ENVIRONMENT_NAME:-production}"

if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in .env.cloudflare" >&2
  exit 1
fi

TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT

cat >"$TMPFILE" <<'JSON'
{
  "build_config": {
    "build_command": "node scripts/smart-build.mjs",
    "deploy_command": "npx wrangler deploy -c wrangler.production.toml",
    "non_production_branch_deploy_command": "",
    "root_dir": "/"
  }
}
JSON

echo "[cf-builds-sync] Patching build config for ${SERVICE}/${ENV_NAME}..."

RESP="$(curl -sS -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/services/${SERVICE}/environments/${ENV_NAME}/settings" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -F "settings=<${TMPFILE};type=application/json")"

if command -v jq >/dev/null 2>&1; then
  echo "$RESP" | jq .
else
  echo "$RESP"
fi
