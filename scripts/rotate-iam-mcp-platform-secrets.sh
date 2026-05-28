#!/usr/bin/env bash
# Rotate AGENTSAM_BRIDGE_KEY then INTERNAL_API_SECRET on IAM + MCP workers,
# update D1 (mcp_workspace_tokens + secret_audit_log), rewrite .env.cloudflare.
#
# Prereqs:
#   - Repo root: inneranimalmedia (this script's parent/..)
#   - Sibling:   ~/inneranimalmedia-mcp-server with wrangler.jsonc
#   - .env.cloudflare: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
#
# Does NOT rotate OPENAI_API_KEY — set on MCP worker manually:
#   cd ~/inneranimalmedia-mcp-server
#   ../inneranimalmedia/scripts/with-cloudflare-env.sh npx wrangler secret put OPENAI_API_KEY -c wrangler.jsonc
#
# Usage:
#   bash scripts/rotate-iam-mcp-platform-secrets.sh           # prompts y/N
#   bash scripts/rotate-iam-mcp-platform-secrets.sh --dry-run
#   bash scripts/rotate-iam-mcp-platform-secrets.sh --force

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "$(basename "$ROOT")" != "inneranimalmedia" ]]; then
  echo "Run from inneranimalmedia repo root (got: $ROOT)" >&2
  exit 1
fi

exec python3 scripts/rotate_bridge_key.py --platform-pair "$@"
