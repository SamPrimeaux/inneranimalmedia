#!/usr/bin/env bash
# scripts/cf-builds-sync.sh
# One-shot: push Workers Builds settings (deploy command, watch paths) via Cloudflare API.
#
# Run manually (loads CLOUDFLARE_* from .env.cloudflare):
#   ./scripts/with-cloudflare-env.sh ./scripts/cf-builds-sync.sh
#
# Requires API token with permission to edit Workers / account resources (same class as CI deploy).
# If the API returns errors, compare the JSON body to current Cloudflare API docs for
# Workers service environment settings — field names change over time.

set -euo pipefail

: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

SERVICE_NAME="${WORKER_SERVICE_NAME:-inneranimalmedia}"
ENV_NAME="${WORKER_ENVIRONMENT_NAME:-production}"

URL="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/services/${SERVICE_NAME}/environments/${ENV_NAME}/settings"

BODY='{
  "build": {
    "build_command": "",
    "deploy_command": "npx wrangler deploy -c wrangler.production.toml",
    "non_production_deploy_command": "",
    "watch_dirs": ["src", "worker.js", "wrangler.production.toml", "package.json", "migrations"]
  }
}'

RESP="$(curl -sS -X PATCH "$URL" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY")"

if command -v jq >/dev/null 2>&1; then
  echo "$RESP" | jq .
else
  echo "$RESP"
fi
