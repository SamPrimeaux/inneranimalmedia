#!/usr/bin/env zsh
# Load Cloudflare env from a gitignored file and run a command.
# Uses zsh (not bash) so ~/.zshrc fallbacks work — many zshrc files source Bun or
# other zsh-specific snippets that crash under bash.
#
# Usage: ./scripts/with-cloudflare-env.sh <command...>
# Example: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute ...
#
# Create .env.cloudflare from .env.cloudflare.example and add:
#   CLOUDFLARE_ACCOUNT_ID=...
#   CLOUDFLARE_API_TOKEN=...
#   R2_ACCESS_KEY_ID=...  R2_SECRET_ACCESS_KEY=...  (scripts + deploy; mirror as Worker secrets)
# .env.cloudflare is in .gitignore — never commit it.
# Preflight R2: ./scripts/check-r2-s3-env.sh

emulate -R zsh
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

# Prefer Homebrew / system tools before other shims when resolving npx/node.
prepend_std_node_toolchain_path() {
  local -a prefix_dirs
  # Resolve active nvm node bin so nvm-managed node/npx/wrangler wins over Homebrew shims.
  local nvm_bin=""
  if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    source "$HOME/.nvm/nvm.sh" --no-use 2>/dev/null || true
    nvm_bin="$(nvm which default 2>/dev/null | xargs dirname 2>/dev/null || true)"
  fi
  if [[ -z "$nvm_bin" && -n "${NVM_BIN:-}" && -d "${NVM_BIN}" ]]; then
    nvm_bin="$NVM_BIN"
  fi
  if [[ -n "$nvm_bin" && -d "$nvm_bin" ]]; then
    prefix_dirs=($nvm_bin /opt/homebrew/bin /usr/local/bin /usr/bin /bin)
  else
    prefix_dirs=(/opt/homebrew/bin /usr/local/bin /usr/bin /bin)
  fi
  local d existing=()
  for d in $prefix_dirs; do
    [[ -d $d ]] && existing+=($d)
  done
  if (( ${#existing} )); then
    export PATH="${(j.:.)existing}:$PATH"
  fi
}

# Always load .env.cloudflare first. Do not early-exit just because
# CLOUDFLARE_API_TOKEN already exists in the parent shell; deploy-specific vars
# like DEPLOY_NOTIFY_EMAIL / RESEND_FROM may live only in .env.cloudflare.
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi
# Bridge/MCP rotation exports (gitignored) — used by deploy post-deploy + optional email auth.
MCP_EXPORTS="${REPO_ROOT}/.mcp_exports.sh"
if [[ -f "$MCP_EXPORTS" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$MCP_EXPORTS"
  set +a
fi
if [[ ! -f "$ENV_FILE" ]] && [[ -f "$HOME/.zshrc" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$HOME/.zshrc"
  set +a
fi

prepend_std_node_toolchain_path

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  print -u2 "CLOUDFLARE_API_TOKEN not set."
  print -u2 "  Set it in ~/.zshrc (export CLOUDFLARE_API_TOKEN=...) or create .env.cloudflare from .env.cloudflare.example"
  exit 1
fi

exec "$@"
