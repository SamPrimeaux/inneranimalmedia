#!/usr/bin/env bash
# Push Workers Builds settings (build + deploy commands) via Cloudflare Builds Triggers API.
# Loads credentials from .env.cloudflare at repo root (same pattern as other scripts).
#
# Usage (from repo root):
#   ./scripts/cf-builds-sync.sh
#
# Optional overrides: WORKER_SERVICE_NAME

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
WORKER_TAG="${WORKER_SERVICE_NAME:-inneranimalmedia}"

BUILD_COMMAND="${CF_BUILDS_BUILD_COMMAND:-node scripts/smart-build.mjs}"
DEPLOY_COMMAND="${CF_BUILDS_DEPLOY_COMMAND:-npx wrangler deploy -c wrangler.production.toml}"

if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in .env.cloudflare" >&2
  exit 1
fi

auth_header=(-H "Authorization: Bearer ${API_TOKEN}" -H "Content-Type: application/json")

echo "[cf-builds-sync] Listing triggers for worker tag ${WORKER_TAG}..."
TRIGGERS_JSON="$(curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/builds/workers/${WORKER_TAG}/triggers" \
  "${auth_header[@]}")"

if command -v jq >/dev/null 2>&1; then
  TRIGGER_UUID="$(echo "$TRIGGERS_JSON" | jq -r '.result[0].trigger_uuid // empty')"
else
  TRIGGER_UUID="$(python3 - <<PY
import json, sys
data = json.loads(sys.argv[1])
rows = data.get("result") or []
print(rows[0].get("trigger_uuid", "") if rows else "")
PY
"$TRIGGERS_JSON")"
fi

if [[ -z "$TRIGGER_UUID" ]]; then
  echo "[cf-builds-sync] No Builds triggers returned for ${WORKER_TAG}." >&2
  echo "[cf-builds-sync] Update manually in Cloudflare dashboard → Workers → ${WORKER_TAG} → Settings → Builds:" >&2
  echo "  Build command:  ${BUILD_COMMAND}" >&2
  echo "  Deploy command: ${DEPLOY_COMMAND}" >&2
  echo "[cf-builds-sync] Never use 'npx wrangler versions upload' — it inherits deleted legacy VECTORIZE bindings." >&2
  exit 1
fi

PATCH_BODY="$(cat <<JSON
{
  "build_command": "${BUILD_COMMAND}",
  "deploy_command": "${DEPLOY_COMMAND}",
  "root_directory": "/"
}
JSON
)"

echo "[cf-builds-sync] Patching trigger ${TRIGGER_UUID}..."
RESP="$(curl -sS -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/builds/triggers/${TRIGGER_UUID}" \
  "${auth_header[@]}" \
  -d "$PATCH_BODY")"

if command -v jq >/dev/null 2>&1; then
  echo "$RESP" | jq .
else
  echo "$RESP"
fi

echo "$RESP" | grep -q '"success":true' || exit 1
echo "[cf-builds-sync] OK — deploy_command=${DEPLOY_COMMAND}"
