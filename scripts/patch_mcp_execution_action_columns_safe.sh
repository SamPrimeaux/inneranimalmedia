#!/usr/bin/env bash
# Add missing agentsam_mcp_tool_execution action-aware columns on remote D1 (idempotent).
# Usage from repo root:
#   ./scripts/with-cloudflare-env.sh bash scripts/patch_mcp_execution_action_columns_safe.sh

set -euo pipefail
cd "$(dirname "$0")/.."
pwd | grep -q inneranimalmedia || { echo "Run from inneranimalmedia repo root"; exit 1; }

DB="${D1_DATABASE:-inneranimalmedia-business}"
TABLE="agentsam_mcp_tool_execution"
WRANGLER_CFG="${WRANGLER_CONFIG:-wrangler.production.toml}"

npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" --json \
  --command "PRAGMA table_info($TABLE);" > /tmp/mcp_exec_cols.raw

python3 - <<'PY'
import json
from pathlib import Path

raw = Path("/tmp/mcp_exec_cols.raw").read_text()
start = raw.find("[")
if start < 0:
    raise SystemExit("unexpected wrangler json output")
data = json.loads(raw[start:])
cols = {r["name"] for r in data[0]["results"]}

wanted = {
  "tool_key": "TEXT",
  "action_type": "TEXT",
  "resource_type": "TEXT",
  "resource_id": "TEXT",
  "actor_type": "TEXT DEFAULT 'user'",
  "actor_source": "TEXT",
  "policy_decision_json": "TEXT DEFAULT '{}'",
  "denial_code": "TEXT",
  "error_code": "TEXT",
  "error_family": "TEXT",
  "error_detail_json": "TEXT DEFAULT '{}'",
  "error_log_id": "TEXT",
}

sql = []
for name, ddl in wanted.items():
    if name not in cols:
        sql.append(f"ALTER TABLE agentsam_mcp_tool_execution ADD COLUMN {name} {ddl};")

Path("/tmp/alter_mcp_action_context.sql").write_text("\n".join(sql) + ("\n" if sql else ""))
print(Path("/tmp/alter_mcp_action_context.sql").read_text() or "(no missing columns)\n")
PY

if [ -s /tmp/alter_mcp_action_context.sql ]; then
  npx wrangler d1 execute "$DB" --remote -c "$WRANGLER_CFG" --file /tmp/alter_mcp_action_context.sql
else
  echo "No missing columns."
fi
