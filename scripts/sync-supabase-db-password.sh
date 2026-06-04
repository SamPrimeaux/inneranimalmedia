#!/usr/bin/env zsh
# Sync Supabase DB password → .env.cloudflare SUPABASE_DB_URL + Cloudflare Hyperdrive.
# Prompts for password (hidden). Does not print or log the password.
#
# Usage (from repo root):
#   ./scripts/sync-supabase-db-password.sh
#
# Requires: CLOUDFLARE_API_TOKEN in .env.cloudflare (or shell), node, pg, wrangler.

emulate -R zsh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${REPO_ROOT}/.env.cloudflare"
HYPERDRIVE_ID="08183bb9d2914e87ac8395d7e4ecff60"
WRANGLER_CONFIG="wrangler.production.toml"

PG_HOST="aws-1-us-east-2.pooler.supabase.com"
PG_PORT="5432"
PG_USER="postgres.dpmuvynqixblxsilnlut"
PG_DATABASE="postgres"

if [[ ! -f "$ENV_FILE" ]]; then
  print -u2 "Missing ${ENV_FILE} — create from .env.cloudflare.example first."
  exit 1
fi

print "Supabase DB password sync (session pooler ${PG_HOST}:${PG_PORT})"
print ""
print -n "New database password: "
read -s DB_PASS
print ""
print -n "Confirm password: "
read -s DB_PASS_CONFIRM
print ""

if [[ -z "${DB_PASS}" ]]; then
  print -u2 "Password empty — aborted."
  exit 1
fi

if [[ "${DB_PASS}" != "${DB_PASS_CONFIRM}" ]]; then
  print -u2 "Passwords do not match — aborted."
  unset DB_PASS DB_PASS_CONFIRM
  exit 1
fi
unset DB_PASS_CONFIRM

# Build URL with encoded password (safe for special chars if you ever use non-hex).
DB_URL="$(node -e "
const user = process.argv[1];
const pass = process.argv[2];
const host = process.argv[3];
const port = process.argv[4];
const db = process.argv[5];
process.stdout.write(
  'postgresql://' +
  encodeURIComponent(user) + ':' +
  encodeURIComponent(pass) + '@' +
  host + ':' + port + '/' + db
);
" "${PG_USER}" "${DB_PASS}" "${PG_HOST}" "${PG_PORT}" "${PG_DATABASE}")"

unset DB_PASS

print ""
print "→ Updating ${ENV_FILE} (SUPABASE_DB_URL, port ${PG_PORT})…"

node -e "
const fs = require('fs');
const path = process.argv[1];
const newLine = 'SUPABASE_DB_URL=' + process.argv[2];
const lines = fs.readFileSync(path, 'utf8').split('\n');
let found = false;
const out = lines.map((line) => {
  if (line.startsWith('SUPABASE_DB_URL=')) {
    found = true;
    return newLine;
  }
  return line;
});
if (!found) out.push(newLine);
fs.writeFileSync(path, out.join('\n'));
" "$ENV_FILE" "$DB_URL"

export SUPABASE_DB_URL="$DB_URL"

set -a
source "$ENV_FILE"
set +a
export SUPABASE_DB_URL="$DB_URL"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  print -u2 "CLOUDFLARE_API_TOKEN not set in ${ENV_FILE} — cannot update Hyperdrive."
  exit 1
fi

print "→ Testing direct Postgres (local pg client)…"
TRIES=6
OK=0
for i in {1..$TRIES}; do
  if node scripts/verify-supabase-pg.mjs; then
    OK=1
    break
  fi
  if (( i < TRIES )); then
    print "  …retry ${i}/${TRIES} in 5s"
    sleep 5
  fi
done
unset DB_URL

if (( ! OK )); then
  print -u2 "Postgres test FAILED — Hyperdrive not updated. Check Supabase password and retry."
  exit 1
fi

print ""
print "→ Updating Hyperdrive ${HYPERDRIVE_ID}…"
npx wrangler hyperdrive update "$HYPERDRIVE_ID" \
  --connection-string "$SUPABASE_DB_URL" \
  --sslmode require \
  -c "$WRANGLER_CONFIG"

print ""
print "→ Hyperdrive config:"
npx wrangler hyperdrive get "$HYPERDRIVE_ID" -c "$WRANGLER_CONFIG"

print ""
print "✓ Done — .env.cloudflare + Hyperdrive synced. Postgres verify passed."
