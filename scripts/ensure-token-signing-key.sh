#!/usr/bin/env bash
# Provision TOKEN_SIGNING_KEY on production inneranimalmedia Worker (HMAC MCP workspace tokens).
# - Generates 32 bytes (base64) via openssl — never printed or committed.
# - Stores only in Cloudflare (wrangler secret); D1 holds per-token HMAC hashes, not this key.
#
# Usage:
#   ./scripts/ensure-token-signing-key.sh           # set if missing
#   ./scripts/ensure-token-signing-key.sh --check   # exit 0 if present, 1 if missing
#   ./scripts/ensure-token-signing-key.sh --force   # rotate (invalidates existing HMAC MCP tokens)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOML="${REPO_ROOT}/wrangler.production.toml"
SECRET_NAME="TOKEN_SIGNING_KEY"
CHECK_ONLY=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$TOML" ]]; then
  echo "✗ Missing $TOML" >&2
  exit 1
fi

list_secrets() {
  "${REPO_ROOT}/scripts/with-cloudflare-env.sh" npx wrangler secret list -c "$TOML" 2>/dev/null || true
}

has_secret() {
  list_secrets | grep -q "\"name\": \"${SECRET_NAME}\""
}

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  if has_secret; then
    echo "✓ ${SECRET_NAME} is configured on inneranimalmedia"
    exit 0
  fi
  echo "✗ ${SECRET_NAME} is not configured on inneranimalmedia" >&2
  exit 1
fi

if has_secret && [[ "$FORCE" -ne 1 ]]; then
  echo "✓ ${SECRET_NAME} already exists on inneranimalmedia (use --force to rotate)"
  exit 0
fi

if [[ "$FORCE" -eq 1 ]]; then
  echo "⚠ Rotating ${SECRET_NAME} — existing HMAC-format MCP tokens (bearer with '.') will stop working."
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "✗ openssl required to generate signing key" >&2
  exit 1
fi

TMPKEY="$(mktemp)"
trap 'rm -f "$TMPKEY"' EXIT
# 32 raw bytes → base64 (~44 chars); suitable as HMAC signing material in Web Crypto
openssl rand -base64 32 | tr -d '\n' >"$TMPKEY"

echo "→ Uploading ${SECRET_NAME} to inneranimalmedia (value not logged)..."
<"$TMPKEY" "${REPO_ROOT}/scripts/with-cloudflare-env.sh" npx wrangler secret put "$SECRET_NAME" -c "$TOML"

if has_secret; then
  echo "✓ ${SECRET_NAME} is configured on inneranimalmedia"
else
  echo "✗ ${SECRET_NAME} upload may have failed — run: ./scripts/ensure-token-signing-key.sh --check" >&2
  exit 1
fi

echo "  MCP mint: generateMcpToken (Settings / API) — D1 stores token_hash (HMAC hex), not the raw bearer after issue."
