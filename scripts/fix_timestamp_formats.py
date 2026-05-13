#!/usr/bin/env python3
"""
Fix timestamp format inconsistencies across agentsam_* tables.
Strategy: for each TEXT timestamp column, add a _unix INTEGER shadow column,
backfill it, then we can migrate reads to use the correct column.
Does NOT drop original columns — safe to run, fully reversible.
"""

import json, os, urllib.request
from pathlib import Path
from datetime import datetime, timezone

for line in (Path.home() / "inneranimalmedia/.env.agentsam.local").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

CF_ACCOUNT_ID  = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
D1_ENDPOINT    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req  = urllib.request.Request(D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        if not data.get("success"):
            print(f"  ERR: {data.get('errors','?')}")
            return None
        return data["result"][0]["results"]
    except Exception as e:
        print(f"  REQ ERR: {e}")
        return None

# Load canonical map from timestamp audit
map_path = Path.home() / "inneranimalmedia/docs/db-audit/timestamp_canonical_map.json"
canonical = json.loads(map_path.read_text()) if map_path.exists() else {}

# Tables with TEXT timestamps that need fixing
# Format: (table, col, sqlite_strftime_expr)
TEXT_TS_FIXES = [
    # Critical tables first
    ("agentsam_usage_events",         "created_at",    "strftime('%s', created_at)"),
    ("agentsam_workflow_runs",         "created_at",    "strftime('%s', created_at)"),
    ("agentsam_execution_steps",       "created_at",    "strftime('%s', created_at)"),
    ("agentsam_agent_run",             "created_at",    "strftime('%s', created_at)"),
    ("agentsam_mcp_tool_execution",    "created_at",    "strftime('%s', created_at)"),
    ("agentsam_deployment_health",     "checked_at",    "strftime('%s', checked_at)"),
    ("agentsam_hook_execution",        "created_at",    "strftime('%s', created_at)"),
    ("agentsam_mcp_tools",             "created_at",    "strftime('%s', created_at)"),
    ("agentsam_webhook_events",        "processed_at",  "strftime('%s', processed_at)"),
    ("agentsam_tool_call_log",         "created_at",    "strftime('%s', created_at)"),
    # Secondary tables
    ("agentsam_commands",              "created_at",    "strftime('%s', created_at)"),
    ("agentsam_command_allowlist",     "created_at",    "strftime('%s', created_at)"),
    ("agentsam_escalation",            "created_at",    "strftime('%s', created_at)"),
    ("agentsam_eval_cases",            "created_at",    "strftime('%s', created_at)"),
    ("agentsam_eval_runs",             "run_at",        "strftime('%s', run_at)"),
    ("agentsam_eval_suites",           "created_at",    "strftime('%s', created_at)"),
    ("agentsam_guardrails",            "created_at",    "strftime('%s', created_at)"),
    ("agentsam_health_daily",          "rolled_up_at",  "strftime('%s', rolled_up_at)"),
    ("agentsam_model_tier",            "created_at",    "strftime('%s', created_at)"),
    ("agentsam_mcp_workflows",         "created_at",    "strftime('%s', created_at)"),
    ("agentsam_todo",                  "created_at",    "strftime('%s', created_at)"),
    ("agentsam_workflow_edges",        "created_at",    "strftime('%s', created_at)"),
    ("agentsam_workflow_nodes",        "created_at",    "strftime('%s', created_at)"),
    ("agentsam_workflows",             "created_at",    "strftime('%s', created_at)"),
    ("cms_assets",                     "created_at",    "strftime('%s', created_at)"),
    ("cms_themes",                     "created_at",    "strftime('%s', created_at)"),
    ("cms_page_sections",              "created_at",    "strftime('%s', created_at)"),
    ("cms_section_components",         "created_at",    "strftime('%s', created_at)"),
]

print(f"Fixing timestamps on {len(TEXT_TS_FIXES)} tables...\n")

fixed = 0
errors = 0

for table, col, expr in TEXT_TS_FIXES:
    shadow_col = f"{col}_unix"
    print(f"  {table}.{col}", end=" → ", flush=True)

    # Check if shadow col already exists
    schema = d1(f"PRAGMA table_info({table})")
    if schema is None:
        print("SKIP (schema err)")
        errors += 1
        continue

    existing_cols = [r["name"] for r in schema]
    if shadow_col in existing_cols:
        # Already has shadow col — just backfill any NULLs
        r = d1(f"UPDATE {table} SET {shadow_col} = CAST({expr} AS INTEGER) WHERE {shadow_col} IS NULL AND {col} IS NOT NULL")
        print(f"backfill only (shadow exists)")
        fixed += 1
        continue

    # Add shadow column
    r = d1(f"ALTER TABLE {table} ADD COLUMN {shadow_col} INTEGER")
    if r is None:
        print("ERR (alter failed)")
        errors += 1
        continue

    # Backfill shadow column from text column
    cnt = d1(f"SELECT COUNT(*) as n FROM {table} WHERE {col} IS NOT NULL")
    row_count = cnt[0]["n"] if cnt else 0

    r2 = d1(f"UPDATE {table} SET {shadow_col} = CAST({expr} AS INTEGER) WHERE {col} IS NOT NULL")
    print(f"✓ added {shadow_col}, backfilled {row_count} rows")
    fixed += 1

print(f"\n{fixed} tables fixed, {errors} errors.")
print("\nNext step: update INSERT statements to write INTEGER unixepoch() directly.")
print("Shadow columns (_unix) are now available for correct time-range queries.")
print("Example: WHERE created_at_unix > (unixepoch() - 86400)  -- last 24h")
