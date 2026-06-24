#!/usr/bin/env bash
# Anthropic: paste key → .env + wrangler + BYOK (Node — no fragile bash/curl)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$REPO_ROOT/scripts/with-cloudflare-env.sh" node "$REPO_ROOT/scripts/sync-env-secret.mjs" anthropic "$@"
