#!/usr/bin/env bash
# deploy-trail-gate.sh — END of every production deploy that claims to be shipped.
# Exit 0 = trail complete. Exit 1 = trail broken — deploy MUST NOT report success.
# Not advisory. Do not swallow this exit code.
#
# Usage:
#   ./scripts/deploy-trail-gate.sh [git-ref-or-hash]
#   GIT_HASH=abc123 ./scripts/deploy-trail-gate.sh
#
# Override (logged): ALLOW_SKIP_DEPLOY_TRAIL=1 — only for explicit operator bypass.
#
# Cloudflare Builds has no zsh — never require with-cloudflare-env.sh (zsh) when
# CLOUDFLARE_API_TOKEN is already in the environment or zsh is missing.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Load gitignored env files with bash (CF Builds / Linux). Mac operators may still
# use with-cloudflare-env.sh when zsh is available and token is unset.
load_cf_env_bash() {
  local env_file="${REPO_ROOT}/.env.cloudflare"
  local mcp_exports="${REPO_ROOT}/.mcp_exports.sh"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
  fi
  if [[ -f "$mcp_exports" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$mcp_exports"
    set +a
  fi
}

run_cf_node() {
  local do_exec="${1:-1}"
  shift
  # Prefer zsh wrapper on Mac when token not yet loaded (reads ~/.zshrc).
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && command -v zsh >/dev/null 2>&1; then
    if [[ "$do_exec" == "1" ]]; then
      exec "$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$@"
    fi
    "$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$@"
    return $?
  fi
  load_cf_env_bash
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo "[deploy-trail-gate] CLOUDFLARE_API_TOKEN not set (bash/CI path)" >&2
    exit 1
  fi
  if [[ "$do_exec" == "1" ]]; then
    exec node "$@"
  fi
  node "$@"
}

if [[ "${ALLOW_SKIP_DEPLOY_TRAIL:-0}" == "1" ]]; then
  echo "[deploy-trail-gate] ALLOW_SKIP_DEPLOY_TRAIL=1 — bypass logged; trail NOT verified" >&2
  run_cf_node 0 "$REPO_ROOT/scripts/notify-ops.mjs" \
    --severity=critical \
    --message="Deploy trail gate BYPASSED (ALLOW_SKIP_DEPLOY_TRAIL=1) at $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    || true
  exit 0
fi

GIT_REF="${1:-${GIT_HASH:-}}"
if [[ -z "$GIT_REF" ]]; then
  GIT_REF="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -z "$GIT_REF" ]]; then
  echo "❌ DEPLOY TRAIL GATE FAILED: git hash required" >&2
  exit 1
fi

run_cf_node 1 "$REPO_ROOT/scripts/deploy-trail-gate.mjs" "$GIT_REF"
