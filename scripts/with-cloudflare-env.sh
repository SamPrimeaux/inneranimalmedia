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
# .env.cloudflare is in .gitignore — never commit it.

emulate -R zsh
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

# Prefer Homebrew / system tools before other shims when resolving npx/node.
prepend_std_node_toolchain_path() {
  local -a prefix_dirs
  prefix_dirs=(/opt/homebrew/bin /usr/local/bin /usr/bin /bin)
  local d existing=()
  for d in $prefix_dirs; do
    [[ -d $d ]] && existing+=($d)
  done
  if (( ${#existing} )); then
    export PATH="${(j.:.)existing}:$PATH"
  fi
}

if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  prepend_std_node_toolchain_path
  exec "$@"
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
elif [[ -f "$HOME/.zshrc" ]]; then
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
