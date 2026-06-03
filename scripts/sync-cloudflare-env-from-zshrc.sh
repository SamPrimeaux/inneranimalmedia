#!/usr/bin/env zsh
# Merge CLOUDFLARE_* from current shell into repo .env.cloudflare (preserves other keys).
# Run: source ~/.zshrc && ./scripts/sync-cloudflare-env-from-zshrc.sh
# Full zsh + MCP install: ./scripts/install-zsh-env-cloudflare.sh

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  print -u2 "CLOUDFLARE_API_TOKEN not set. Run: source ~/.zshrc" >&2
  exit 1
fi

upsert_kv() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${(q)val}|" "$file"
  elif grep -q "^export ${key}=" "$file" 2>/dev/null; then
    sed -i '' "s|^export ${key}=.*|export ${key}=${(q)val}|" "$file"
  else
    print -r -- "${key}=${(q)val}" >>"$file"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "${REPO_ROOT}/.env.cloudflare.example" "$ENV_FILE" 2>/dev/null || print -r -- "# Synced from shell" >"$ENV_FILE"
fi

upsert_kv CLOUDFLARE_ACCOUNT_ID "${CLOUDFLARE_ACCOUNT_ID:-}" "$ENV_FILE"
upsert_kv CLOUDFLARE_API_TOKEN "$CLOUDFLARE_API_TOKEN" "$ENV_FILE"

print -r -- "Updated CLOUDFLARE_* in $ENV_FILE"
print -r -- "Run ./scripts/install-zsh-env-cloudflare.sh to wire ~/.zshrc + MCP bearer"
