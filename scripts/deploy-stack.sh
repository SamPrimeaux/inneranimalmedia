#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MCP_REPO_DEFAULT="${ROOT}/../inneranimalmedia-mcp-server"

say() { printf '%s\n' "$*"; }

cd "$ROOT"

say "→ inneranimalmedia: git pull (ff-only)"
git pull --ff-only

say "→ inneranimalmedia: deploy:full"
npm run deploy:full

MCP_REPO="${MCP_REPO:-$MCP_REPO_DEFAULT}"
if [[ ! -d "$MCP_REPO" ]]; then
  say "✗ MCP repo not found at: $MCP_REPO"
  say "  Set MCP_REPO to override path, e.g. MCP_REPO=/path/to/inneranimalmedia-mcp-server"
  exit 1
fi

say "→ inneranimalmedia-mcp-server: git pull (ff-only)"
cd "$MCP_REPO"
git pull --ff-only

say "→ inneranimalmedia-mcp-server: deploy:full"
npm run deploy:full

say "✓ Stack deploy complete"

