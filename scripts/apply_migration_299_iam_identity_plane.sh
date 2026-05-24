#!/usr/bin/env bash
# Apply migration 299 (guarded ALTERs + identity plane tables/backfill).
set -euo pipefail
cd "$(dirname "$0")/.."
pwd | grep -q inneranimalmedia || { echo "Run from inneranimalmedia repo root"; exit 1; }

./scripts/with-cloudflare-env.sh bash scripts/migrations/299_iam_identity_plane_alter_safe.sh
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/299_iam_identity_plane.sql

echo "299_iam_identity_plane applied."
