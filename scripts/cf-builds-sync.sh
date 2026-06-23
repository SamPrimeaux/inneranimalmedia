#!/usr/bin/env bash
# Push Workers Builds settings (build + deploy commands) via Cloudflare Builds Triggers API.
# Loads credentials from .env.cloudflare at repo root (same pattern as other scripts).
#
# Usage (from repo root):
#   ./scripts/cf-builds-sync.sh
#
# Optional overrides: WORKER_SERVICE_NAME, CF_BUILDS_BUILD_COMMAND, CF_BUILDS_DEPLOY_COMMAND
#
# Trigger discovery: the Builds API keys triggers by external_script_id (Workers script tag),
# not by worker name. This script resolves the tag from workers/services first.

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
WORKER_NAME="${WORKER_SERVICE_NAME:-inneranimalmedia}"

BUILD_COMMAND="${CF_BUILDS_BUILD_COMMAND:-node scripts/smart-build.mjs}"
DEPLOY_COMMAND="${CF_BUILDS_DEPLOY_COMMAND:-npm run deploy:cf-builds}"

if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in .env.cloudflare" >&2
  exit 1
fi

auth_header=(-H "Authorization: Bearer ${API_TOKEN}" -H "Content-Type: application/json")

echo "[cf-builds-sync] Resolving script tag for worker ${WORKER_NAME}..."
SERVICE_JSON="$(curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/services/${WORKER_NAME}" \
  "${auth_header[@]}")"

if command -v jq >/dev/null 2>&1; then
  SCRIPT_TAG="$(echo "$SERVICE_JSON" | jq -r '.result.default_environment.script_tag // empty')"
else
  SCRIPT_TAG="$(python3 - <<PY
import json, sys
data = json.loads(sys.argv[1])
result = data.get("result") or {}
env = result.get("default_environment") or {}
print(env.get("script_tag", ""))
PY
"$SERVICE_JSON")"
fi

if [[ -z "$SCRIPT_TAG" ]]; then
  echo "[cf-builds-sync] Could not resolve script tag for ${WORKER_NAME}." >&2
  echo "$SERVICE_JSON" | head -c 2000 >&2 || true
  exit 1
fi

echo "[cf-builds-sync] Listing triggers for external_script_id ${SCRIPT_TAG}..."
TRIGGERS_JSON="$(curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/builds/workers/${SCRIPT_TAG}/triggers" \
  "${auth_header[@]}")"

if command -v jq >/dev/null 2>&1; then
  TRIGGER_UUIDS="$(echo "$TRIGGERS_JSON" | jq -r '.result[].trigger_uuid // empty')"
else
  TRIGGER_UUIDS="$(python3 - <<PY
import json, sys
data = json.loads(sys.argv[1])
for row in data.get("result") or []:
    uid = row.get("trigger_uuid")
    if uid:
        print(uid)
PY
"$TRIGGERS_JSON")"
fi

if [[ -z "$TRIGGER_UUIDS" ]]; then
  echo "[cf-builds-sync] No Builds triggers returned for ${WORKER_NAME} (script tag ${SCRIPT_TAG})." >&2
  echo "[cf-builds-sync] Update manually in Cloudflare dashboard → Workers → ${WORKER_NAME} → Settings → Builds:" >&2
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

patched=0
while IFS= read -r TRIGGER_UUID; do
  [[ -z "$TRIGGER_UUID" ]] && continue
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
  patched=$((patched + 1))
done <<< "$TRIGGER_UUIDS"

echo "[cf-builds-sync] OK — patched ${patched} trigger(s); deploy_command=${DEPLOY_COMMAND}"
