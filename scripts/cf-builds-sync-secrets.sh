#!/usr/bin/env bash
# cf-builds-sync-secrets.sh — upsert deploy-critical Build secrets/vars onto the main Workers Builds trigger.
# Reads values from .env.cloudflare / .mcp_exports.sh (never prints them).
#
# Usage (Mac, from repo root):
#   ./scripts/cf-builds-sync-secrets.sh
#
# Required for CF Builds deploy:fast to fire push + agentsam_deploy_events:
#   INTERNAL_API_SECRET or AGENTSAM_BRIDGE_KEY
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
#   IAM_SUPABASE_WORKSPACE_ID, IAM_SUPABASE_USER_ID (public vars OK)
# Optional: PUSH_SERVICE_TOKEN, WORKSPACE_ID
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck source=scripts/lib/load-deploy-env.sh
source "$REPO_ROOT/scripts/lib/load-deploy-env.sh"

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
WORKER_NAME="${WORKER_SERVICE_NAME:-inneranimalmedia}"

if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "ERROR: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required" >&2
  exit 1
fi

auth_header=(-H "Authorization: Bearer ${API_TOKEN}" -H "Content-Type: application/json")

echo "[cf-builds-secrets] Resolving script tag for ${WORKER_NAME}…"
SERVICE_JSON="$(curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/services/${WORKER_NAME}" \
  "${auth_header[@]}")"
SCRIPT_TAG="$(echo "$SERVICE_JSON" | jq -r '.result.default_environment.script_tag // empty')"
if [[ -z "$SCRIPT_TAG" ]]; then
  echo "[cf-builds-secrets] FATAL: could not resolve script_tag" >&2
  echo "$SERVICE_JSON" | head -c 500 >&2
  exit 1
fi

TRIGGERS_JSON="$(curl -sS \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/builds/workers/${SCRIPT_TAG}/triggers" \
  "${auth_header[@]}")"
if ! echo "$TRIGGERS_JSON" | jq -e '.success == true' >/dev/null 2>&1; then
  echo "[cf-builds-secrets] FATAL: triggers API failed" >&2
  echo "$TRIGGERS_JSON" | head -c 800 >&2
  exit 1
fi

MAIN_TRIGGER="$(echo "$TRIGGERS_JSON" | jq -r '
  .result[]
  | select((.branch_includes // []) | index("main"))
  | .trigger_uuid
' | head -1)"
if [[ -z "$MAIN_TRIGGER" ]]; then
  echo "[cf-builds-secrets] FATAL: no main-branch Builds trigger" >&2
  exit 1
fi
echo "[cf-builds-secrets] main trigger=${MAIN_TRIGGER}"

# Build PATCH body — only include keys that are set locally (never empty overwrite).
BODY='{}'
add_secret() {
  local key="$1" val="$2" secret_flag="$3"
  [[ -n "$val" ]] || return 0
  BODY="$(jq -c --arg k "$key" --arg v "$val" --argjson s "$secret_flag" \
    '. + {($k): {value: $v, is_secret: $s}}' <<<"$BODY")"
}

add_secret INTERNAL_API_SECRET "${INTERNAL_API_SECRET:-}" true
add_secret AGENTSAM_BRIDGE_KEY "${AGENTSAM_BRIDGE_KEY:-}" true
add_secret SUPABASE_SERVICE_ROLE_KEY "${SUPABASE_SERVICE_ROLE_KEY:-}" true
add_secret SUPABASE_URL "${SUPABASE_URL:-}" true
add_secret PUSH_SERVICE_TOKEN "${PUSH_SERVICE_TOKEN:-}" true
add_secret IAM_SUPABASE_WORKSPACE_ID "${IAM_SUPABASE_WORKSPACE_ID:-}" false
add_secret IAM_SUPABASE_USER_ID "${IAM_SUPABASE_USER_ID:-}" false
add_secret WORKSPACE_ID "${WORKSPACE_ID:-}" false
add_secret D1_AUTH_USER_ID "${D1_AUTH_USER_ID:-${IAM_D1_AUTH_USER_ID:-}}" false
add_secret IAM_D1_AUTH_USER_ID "${IAM_D1_AUTH_USER_ID:-${D1_AUTH_USER_ID:-}}" false

KEYS="$(echo "$BODY" | jq -r 'keys | join(",")')"
if [[ -z "$KEYS" || "$BODY" == "{}" ]]; then
  echo "[cf-builds-secrets] FATAL: nothing to upsert — load .env.cloudflare first" >&2
  exit 1
fi

# Require the critical pair for push + supabase ledger.
missing=0
[[ -n "${INTERNAL_API_SECRET:-}${AGENTSAM_BRIDGE_KEY:-}" ]] || { echo "[cf-builds-secrets] missing INTERNAL_API_SECRET/AGENTSAM_BRIDGE_KEY" >&2; missing=1; }
[[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || { echo "[cf-builds-secrets] missing SUPABASE_SERVICE_ROLE_KEY" >&2; missing=1; }
[[ -n "${SUPABASE_URL:-}" ]] || { echo "[cf-builds-secrets] missing SUPABASE_URL" >&2; missing=1; }
[[ -n "${IAM_SUPABASE_WORKSPACE_ID:-}" ]] || { echo "[cf-builds-secrets] missing IAM_SUPABASE_WORKSPACE_ID" >&2; missing=1; }
[[ -n "${IAM_SUPABASE_USER_ID:-}" ]] || { echo "[cf-builds-secrets] missing IAM_SUPABASE_USER_ID" >&2; missing=1; }
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

echo "[cf-builds-secrets] Upserting keys: ${KEYS}"
RESP="$(curl -sS -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/builds/triggers/${MAIN_TRIGGER}/environment_variables" \
  "${auth_header[@]}" \
  -d "$BODY")"
if ! echo "$RESP" | jq -e '.success == true' >/dev/null 2>&1; then
  echo "[cf-builds-secrets] FATAL: upsert failed" >&2
  echo "$RESP" | jq '{success, errors}' 2>/dev/null || echo "$RESP" | head -c 800 >&2
  exit 1
fi

# List names only (secret values are null)
echo "$RESP" | jq -r '
  .result
  | to_entries
  | map("\(.key)=\(if .value.is_secret then "secret" else (.value.value // "") end)")
  | .[]
' | sed 's/^/[cf-builds-secrets] /'
echo "[cf-builds-secrets] OK — main Build trigger env upserted"
