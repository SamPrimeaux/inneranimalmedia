#!/usr/bin/env bash
# Idempotent ALTERs for migrations/299_iam_identity_plane.sql
# Usage from repo root:
#   ./scripts/with-cloudflare-env.sh bash scripts/migrations/299_iam_identity_plane_alter_safe.sh

set -euo pipefail
cd "$(dirname "$0")/../.."
pwd | grep -q inneranimalmedia || { echo "Run from inneranimalmedia repo root"; exit 1; }

DB="${D1_DATABASE:-inneranimalmedia-business}"
WRANGLER_CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"

run_pragma() {
  local table="$1"
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" --json \
    --command "PRAGMA table_info(${table});" > "/tmp/iam299_${table}_cols.raw"
}

emit_alters() {
  python3 - <<'PY'
import json
from pathlib import Path

def cols_for(table):
    raw = Path(f"/tmp/iam299_{table}_cols.raw").read_text()
    start = raw.find("[")
    if start < 0:
        raise SystemExit(f"unexpected wrangler json for {table}")
    data = json.loads(raw[start:])
    return {r["name"] for r in data[0]["results"]}

wanted = {
    "tenants": {
        "owner_account_id": "TEXT",
        "meta_json": "TEXT NOT NULL DEFAULT '{}'",
    },
    "auth_sessions": {
        "type": "TEXT NOT NULL DEFAULT 'browser'",
        "token_hash": "TEXT",
        "org_id": "TEXT",
    },
    "workspaces": {
        "org_id": "TEXT",
        "pty_path": "TEXT",
    },
}

lines = []
for table, spec in wanted.items():
    have = cols_for(table)
    for name, ddl in spec.items():
        if name not in have:
            lines.append(f"ALTER TABLE {table} ADD COLUMN {name} {ddl};")

out = Path("/tmp/iam299_alters.sql")
out.write_text("\n".join(lines) + ("\n" if lines else ""))
print(out.read_text() or "(no missing columns)\n")
PY
}

for t in tenants auth_sessions workspaces; do
  run_pragma "$t"
done

emit_alters

if [ -s /tmp/iam299_alters.sql ]; then
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" --file /tmp/iam299_alters.sql
else
  echo "No missing columns."
fi
