#!/usr/bin/env bash
# Backfill accounts rows for auth_users skipped by migration 299 (status=invited).
set -euo pipefail
cd "$(dirname "$0")/.."
pwd | grep -q inneranimalmedia || { echo "Run from inneranimalmedia repo root"; exit 1; }

DB="${D1_DATABASE:-inneranimalmedia-business}"
WRANGLER_CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"

./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" \
  --file=./migrations/300_accounts_invited_backfill.sql

echo "Invited accounts backfill applied."
