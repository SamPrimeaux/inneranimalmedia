#!/usr/bin/env python3
"""
Audit ai_*, agent_*, mcp_* tables in D1 against the codebase.
Classifies each as: EXTINCT | REFERENCED | INSPECT
"""

import json, os, subprocess, urllib.request, urllib.error
from pathlib import Path
from collections import defaultdict

# --- load env ---
env_path = Path.home() / "inneranimalmedia/.env.agentsam.local"
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

CF_ACCOUNT_ID  = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
REPO_ROOT      = Path.home() / "inneranimalmedia"

D1_ENDPOINT = (
    f"https://api.cloudflare.com/client/v4/accounts"
    f"/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
)

def d1_query(sql):
    body = json.dumps({"sql": sql, "params": []}).encode()
    req = urllib.request.Request(
        D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if not data.get("success"):
        raise RuntimeError(f"D1 error: {data}")
    return data["result"][0]["results"]

def get_legacy_tables():
    rows = d1_query(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND (name LIKE 'ai_%' OR name LIKE 'agent_%' OR name LIKE 'mcp_%') "
        "ORDER BY name"
    )
    return [r["name"] for r in rows]

def get_agentsam_tables():
    rows = d1_query(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name LIKE 'agentsam_%' ORDER BY name"
    )
    return [r["name"] for r in rows]

def get_row_count(table):
    try:
        rows = d1_query(f"SELECT COUNT(*) as n FROM {table}")
        return rows[0]["n"]
    except:
        return "?"

def grep_codebase(table_name):
    """Return list of files referencing this table name."""
    try:
        result = subprocess.run(
            ["grep", "-rl", "--include=*.js", "--include=*.ts",
             "--include=*.tsx", "--include=*.py", "--include=*.toml",
             "--include=*.json", "--include=*.sql",
             table_name, str(REPO_ROOT)],
            capture_output=True, text=True, timeout=10
        )
        files = [f for f in result.stdout.strip().splitlines()
                 if ".git" not in f and "node_modules" not in f]
        return files
    except:
        return []

def main():
    print("Fetching legacy tables from D1...")
    legacy = get_legacy_tables()
    agentsam = get_agentsam_tables()

    print(f"Found {len(legacy)} legacy tables (ai_/agent_/mcp_)")
    print(f"Found {len(agentsam)} agentsam_* replacement tables\n")

    extinct   = []
    referenced = []
    inspect   = []

    for table in legacy:
        row_count = get_row_count(table)
        files = grep_codebase(table)

        entry = {"table": table, "rows": row_count, "files": files}

        if not files and row_count == 0:
            extinct.append(entry)
        elif not files and row_count > 0:
            inspect.append(entry)  # data but no code refs — possible migration target
        else:
            referenced.append(entry)

    # --- report ---
    print("=" * 60)
    print(f"EXTINCT — no code refs, 0 rows — safe to drop ({len(extinct)})")
    print("=" * 60)
    for e in extinct:
        print(f"  {e['table']}")

    print()
    print("=" * 60)
    print(f"INSPECT — has data but no code refs ({len(inspect)})")
    print("=" * 60)
    for e in inspect:
        print(f"  {e['table']}  ({e['rows']} rows)")

    print()
    print("=" * 60)
    print(f"REFERENCED — still in codebase, do not drop ({len(referenced)})")
    print("=" * 60)
    for e in referenced:
        short_files = [f.replace(str(REPO_ROOT) + "/", "") for f in e["files"]]
        print(f"  {e['table']}  ({e['rows']} rows)")
        for f in short_files[:4]:
            print(f"    ↳ {f}")
        if len(short_files) > 4:
            print(f"    ↳ ... and {len(short_files) - 4} more")

    print()
    print(f"Summary: {len(extinct)} droppable, {len(inspect)} need review, {len(referenced)} active")

if __name__ == "__main__":
    main()
