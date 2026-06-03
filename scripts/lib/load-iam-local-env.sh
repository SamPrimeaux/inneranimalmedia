#!/usr/bin/env zsh
# Source IAM gitignored env in correct order (repo SSOT).
# Usage: source /path/to/inneranimalmedia/scripts/lib/load-iam-local-env.sh
# Optional: IAM_REPO=/custom/path

emulate -R zsh 2>/dev/null || true

: "${IAM_REPO:=$(
  if [[ -n "${IAM_REPO:-}" ]]; then
    print -r -- "$IAM_REPO"
  elif [[ -f "${PWD}/.env.cloudflare" ]]; then
    print -r -- "$PWD"
  elif [[ -d "${HOME}/inneranimalmedia" ]]; then
    print -r -- "${HOME}/inneranimalmedia"
  else
    print -r -- "$(cd "$(dirname "${(%):-%x}")/../.." && pwd)"
  fi
)}"

_load_iam_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  set -a
  # shellcheck source=/dev/null
  source "$f"
  set +a
}

_load_iam_file "${IAM_REPO}/.env.cloudflare"
# MCP/bridge rotation writes here; must override stale MCP_AUTH_TOKEN in .env.cloudflare
_load_iam_file "${IAM_REPO}/.mcp_exports.sh"
