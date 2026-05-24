#!/usr/bin/env bash
# Idempotent apply for migrations/301_agentsam_analytics_tenant_id.sql
set -euo pipefail
cd "$(dirname "$0")/.."
pwd | grep -q inneranimalmedia || { echo "Run from inneranimalmedia repo root"; exit 1; }

DB="${D1_DATABASE:-inneranimalmedia-business}"
WRANGLER_CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"

./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" --json \
  --command "PRAGMA table_info(agentsam_analytics);" > /tmp/iam301_analytics_cols.raw

python3 - <<'PY'
import json
from pathlib import Path

raw = Path("/tmp/iam301_analytics_cols.raw").read_text()
start = raw.find("[")
data = json.loads(raw[start:])
have = {r["name"] for r in data[0]["results"]}
lines = []
if "tenant_id" not in have:
    lines.append("ALTER TABLE agentsam_analytics ADD COLUMN tenant_id TEXT DEFAULT NULL;")
if "workspace_id" not in have:
    lines.append("ALTER TABLE agentsam_analytics ADD COLUMN workspace_id TEXT DEFAULT NULL;")
lines.append(
    "CREATE INDEX IF NOT EXISTS idx_agentsam_analytics_tenant "
    "ON agentsam_analytics(tenant_id, bucket_date);"
)
out = Path("/tmp/iam301_alters.sql")
out.write_text("\n".join(lines) + "\n")
print(out.read_text())
PY

if [ -s /tmp/iam301_alters.sql ]; then
  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" --file /tmp/iam301_alters.sql
else
  echo "No alters needed."
fi

echo "301_agentsam_analytics_tenant_id applied."
