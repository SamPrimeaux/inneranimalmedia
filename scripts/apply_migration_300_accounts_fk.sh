#!/usr/bin/env bash
# Apply migrations/300_accounts_fk.sql (trigger + membership indexes).
set -euo pipefail
cd "$(dirname "$0")/.."
pwd | grep -q inneranimalmedia || { echo "Run from inneranimalmedia repo root"; exit 1; }

DB="${D1_DATABASE:-inneranimalmedia-business}"
WRANGLER_CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"

./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" \
  --file=./migrations/300_accounts_fk.sql

echo "300_accounts_fk applied."
