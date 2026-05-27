#!/usr/bin/env zsh
# Sync Google OAuth client secret to inneranimalmedia-mcp-server (required for Drive token refresh).
# Reads GOOGLE_OAUTH_CLIENT_SECRET or GOOGLE_CLIENT_SECRET from .env.cloudflare — never prints values.
#
# Usage (from repo root):
#   ./scripts/sync-mcp-google-oauth-secret.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MCP_DIR="${REPO_ROOT}/../inneranimalmedia-mcp-server"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

if [[ ! -d "$MCP_DIR" ]]; then
  echo "MCP repo not found at $MCP_DIR" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

SECRET="${GOOGLE_OAUTH_CLIENT_SECRET:-${GOOGLE_CLIENT_SECRET:-}}"
if [[ -z "$SECRET" ]]; then
  echo "Set GOOGLE_OAUTH_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) in .env.cloudflare, then re-run." >&2
  echo "Or manually: cd inneranimalmedia-mcp-server && npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET" >&2
  exit 1
fi

printf '%s' "$SECRET" | (cd "$MCP_DIR" && npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET)
echo "OK: GOOGLE_OAUTH_CLIENT_SECRET set on inneranimalmedia-mcp-server"
