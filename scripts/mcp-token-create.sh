#!/usr/bin/env bash
set -euo pipefail

SECRET_NAME=""
LABEL=""
TOKEN_ID=""
WORKSPACE="ws_inneranimalmedia"
TENANT="tenant_sam_primeaux"
TOOLS="null"
RATE_LIMIT=10000

while [[ $# -gt 0 ]]; do
  case $1 in
    --secret)    SECRET_NAME="$2"; shift 2 ;;
    --label)     LABEL="$2";       shift 2 ;;
    --token-id)  TOKEN_ID="$2";    shift 2 ;;
    --workspace) WORKSPACE="$2";   shift 2 ;;
    --tenant)    TENANT="$2";      shift 2 ;;
    --tools)     TOOLS="$2";       shift 2 ;;
    --rate)      RATE_LIMIT="$2";  shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$SECRET_NAME" || -z "$LABEL" || -z "$TOKEN_ID" ]]; then
  echo "Usage: $0 --secret SECRET_NAME --label 'Label' --token-id tok_xxx"
  exit 1
fi

PART1=$(openssl rand -hex 4)
PART2=$(openssl rand -hex 4)
PART3=$(openssl rand -hex 4)
PART4=$(openssl rand -hex 4)
TOKEN="i-am-${PART1}-${PART2}-${PART3}-${PART4}"
HASH=$(echo -n "$TOKEN" | shasum -a 256 | awk '{print $1}')

echo ""
echo "Token:  $TOKEN"
echo "Hash:   $HASH"
echo "Secret: $SECRET_NAME"
echo "ID:     $TOKEN_ID"
echo ""

echo "$TOKEN" | npx wrangler secret put "$SECRET_NAME" --config wrangler.production.toml
echo "$TOKEN" | npx wrangler secret put "$SECRET_NAME" --name inneranimalmedia-mcp-server

if [[ "$TOOLS" != "null" ]]; then
  ESCAPED=$(echo "$TOOLS" | sed "s/'/''/g")
  ALLOWED_TOOLS_SQL="'${ESCAPED}'"
else
  ALLOWED_TOOLS_SQL="NULL"
fi

npx wrangler d1 execute inneranimalmedia-business \
  --remote --config wrangler.production.toml \
  --command "INSERT INTO mcp_workspace_tokens (id, workspace_id, tenant_id, label, token_hash, allowed_tools, rate_limit_per_hour, is_active) VALUES ('${TOKEN_ID}', '${WORKSPACE}', '${TENANT}', '${LABEL}', '${HASH}', ${ALLOWED_TOOLS_SQL}, ${RATE_LIMIT}, 1) ON CONFLICT(id) DO UPDATE SET token_hash='${HASH}', label='${LABEL}', allowed_tools=${ALLOWED_TOOLS_SQL}, rate_limit_per_hour=${RATE_LIMIT}, is_active=1;"

echo ""
echo "Done. Cursor bearer: $TOKEN"
echo "Save this — it will not be shown again."
