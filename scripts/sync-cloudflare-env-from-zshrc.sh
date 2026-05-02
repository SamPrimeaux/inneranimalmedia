#!/usr/bin/env bash
# One-time: copy CLOUDFLARE_* from your current shell (e.g. after source ~/.zshrc) into .env.cloudflare.
# Run from repo root: source ~/.zshrc && ./scripts/sync-cloudflare-env-from-zshrc.sh
# Does not print secrets; creates/overwrites .env.cloudflare.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
  echo "CLOUDFLARE_API_TOKEN not set in this shell. Run: source ~/.zshrc" >&2
  exit 1
fi

mkdir -p "$REPO_ROOT"
printf '%s\n' \
  "# Synced from env; do not commit" \
  "CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-}" \
  "CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}" \
  > "$ENV_FILE"
echo "Wrote $ENV_FILE (from current env)."
echo "Verify: ./scripts/with-cloudflare-env.sh sh -c 'echo Token set: \${CLOUDFLARE_API_TOKEN:+yes}'"
