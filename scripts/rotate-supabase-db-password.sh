#!/usr/bin/env zsh
# Generate new Supabase DB password → you paste in Supabase → Y → sync .env + Hyperdrive.
#
# Usage:
#   cd /Users/samprimeaux/inneranimalmedia && ./scripts/rotate-supabase-db-password.sh
#
# Paste once. Copy the generated password into Supabase Dashboard → Settings → Database
# → Reset database password. Type Y when done.

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

NEW_PASS="$(openssl rand -hex 32)"

print ""
print "══════════════════════════════════════════════════════════════"
print " 1) Copy this password → Supabase → Project Settings → Database"
print "    → Reset database password → paste → Save"
print "══════════════════════════════════════════════════════════════"
print ""
print "${NEW_PASS}"
print ""
print "══════════════════════════════════════════════════════════════"
print ""

print -n "Saved in Supabase? Type Y then Enter: "
read -r CONFIRM
if [[ "${CONFIRM:l}" != "y" ]]; then
  print -u2 "Aborted (nothing changed locally or in Hyperdrive)."
  unset NEW_PASS
  exit 1
fi

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
" "${PG_USER}" "${NEW_PASS}" "${PG_HOST}" "${PG_PORT}" "${PG_DATABASE}")"

unset NEW_PASS

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

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  print -u2 "CLOUDFLARE_API_TOKEN not set in ${ENV_FILE} — cannot update Hyperdrive."
  exit 1
fi

print "→ Testing Postgres (retries if Supabase pooler is still propagating)…"
TRIES=6
OK=0
for i in {1..$TRIES}; do
  if node scripts/verify-supabase-pg.mjs; then
    OK=1
    break
  fi
  if (( i < TRIES )); then
    print "  …not ready yet (${i}/${TRIES}), retry in 5s (Supabase password propagation)"
    sleep 5
  fi
done

unset DB_URL

if (( ! OK )); then
  print -u2 ""
  print -u2 "Postgres FAILED after ${TRIES} tries."
  print -u2 "Run: ./scripts/sync-supabase-db-password.sh  (paste password manually)"
  exit 1
fi

print ""
print "→ Updating Hyperdrive ${HYPERDRIVE_ID}…"
npx wrangler hyperdrive update "$HYPERDRIVE_ID" \
  --connection-string "$SUPABASE_DB_URL" \
  --sslmode require \
  -c "$WRANGLER_CONFIG"

print ""
print "✓ Done — Supabase + .env.cloudflare + Hyperdrive all on the new password."
