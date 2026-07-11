#!/usr/bin/env bash
# Push Workers Builds settings (build + deploy commands) via Cloudflare Builds Triggers API.
# Loads credentials from .env.cloudflare at repo root (same pattern as other scripts).
#
# Usage (from repo root):
#   ./scripts/cf-builds-sync.sh
#
# Optional overrides: WORKER_SERVICE_NAME, CF_BUILDS_BUILD_COMMAND,
# CF_BUILDS_MAIN_DEPLOY_COMMAND, CF_BUILDS_NON_MAIN_DEPLOY_COMMAND,
# CF_BUILDS_NON_MAIN_BRANCH_EXCLUDES
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

# Bloat map (from failed CF Builds log 2026-07-11)
#
# | Step                         | Time     | Status |
# |------------------------------|----------|--------|
# | npm ci                       | ~19s     | needed |
# | copy-cms-vendor npm install  | ~19s     | KILLED — skipped on CI |
# | Vite 5972 modules            | ~60s     | needed (excalidraw/realtimekit are fat) |
# | wrangler r2 ×132 objects     | ~5m      | KILLED — cf-api / S3 parallel |
# | with-cloudflare-env.sh (zsh) | fail     | KILLED — bash + direct wrangler |
#
# Target CF Builds wall clock: npm ci + Vite + R2 delta (~10–20s) + wrangler ≈ 2–3 min first cold; <90s warm delta.
BUILD_COMMAND="${CF_BUILDS_BUILD_COMMAND:-node scripts/smart-build.mjs}"
MAIN_DEPLOY_COMMAND="${CF_BUILDS_MAIN_DEPLOY_COMMAND:-npm run deploy:fast:cf}"
NON_MAIN_DEPLOY_COMMAND="${CF_BUILDS_NON_MAIN_DEPLOY_COMMAND:-npm run deploy:cf-builds}"
NON_MAIN_BRANCH_EXCLUDES="${CF_BUILDS_NON_MAIN_BRANCH_EXCLUDES:-main,production}"

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
  echo "  Main deploy:    ${MAIN_DEPLOY_COMMAND}" >&2
  echo "  Non-main deploy: ${NON_MAIN_DEPLOY_COMMAND}" >&2
  echo "[cf-builds-sync] Never use 'npx wrangler versions upload' — it inherits deleted legacy VECTORIZE bindings." >&2
  exit 1
fi

patch_trigger() {
  local trigger_uuid="$1"
  local deploy_command="$2"
  local branch_excludes_json="$3"
  # path_excludes: never exclude dashboard/** — Mac-free SPA ship requires Builds to see UI changes.
  local path_excludes_json='["snapshot-*.json","docs/**","*.md"]'
  local patch_body
  patch_body="$(cat <<JSON
{
  "build_command": "${BUILD_COMMAND}",
  "deploy_command": "${deploy_command}",
  "root_directory": "/",
  "branch_excludes": ${branch_excludes_json},
  "path_includes": ["*"],
  "path_excludes": ${path_excludes_json}
}
JSON
)"
  echo "[cf-builds-sync] Patching trigger ${trigger_uuid} (deploy=${deploy_command})..."
  curl -sS -X PATCH \
    "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/builds/triggers/${trigger_uuid}" \
    "${auth_header[@]}" \
    -d "$patch_body"
}

patched=0
if command -v jq >/dev/null 2>&1; then
  while IFS=$'\t' read -r TRIGGER_UUID BRANCH_INCLUDES_JSON; do
    [[ -z "$TRIGGER_UUID" ]] && continue
    if echo "$BRANCH_INCLUDES_JSON" | jq -e '.[] | select(. == "main")' >/dev/null 2>&1; then
      DEPLOY_COMMAND="$MAIN_DEPLOY_COMMAND"
      BRANCH_EXCLUDES_JSON='["main"]'
    else
      DEPLOY_COMMAND="$NON_MAIN_DEPLOY_COMMAND"
      BRANCH_EXCLUDES_JSON="$(printf '%s' "$NON_MAIN_BRANCH_EXCLUDES" | jq -Rc 'split(",") | map(gsub("^\\s+|\\s+$";""))')"
    fi
    RESP="$(patch_trigger "$TRIGGER_UUID" "$DEPLOY_COMMAND" "$BRANCH_EXCLUDES_JSON")"
    echo "$RESP" | jq .
    echo "$RESP" | grep -q '"success":true' || exit 1
    patched=$((patched + 1))
  done < <(echo "$TRIGGERS_JSON" | jq -r '.result[] | [.trigger_uuid, (.branch_includes | tojson)] | @tsv')
else
  while IFS= read -r TRIGGER_UUID; do
    [[ -z "$TRIGGER_UUID" ]] && continue
    DEPLOY_COMMAND="$MAIN_DEPLOY_COMMAND"
    BRANCH_EXCLUDES_JSON='["main"]'
    RESP="$(patch_trigger "$TRIGGER_UUID" "$DEPLOY_COMMAND" "$BRANCH_EXCLUDES_JSON")"

    echo "$RESP"
    echo "$RESP" | grep -q '"success":true' || exit 1
    patched=$((patched + 1))
  done <<< "$TRIGGER_UUIDS"
fi

echo "[cf-builds-sync] OK — patched ${patched} trigger(s); main_deploy=${MAIN_DEPLOY_COMMAND}; non_main_deploy=${NON_MAIN_DEPLOY_COMMAND}"
