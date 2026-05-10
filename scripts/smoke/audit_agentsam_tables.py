#!/usr/bin/env python3
"""
audit_agentsam_tables.py
─────────────────────────
Pulls first 20 agentsam_* tables → row count + NULL column analysis.

Run:
  source ~/inneranimalmedia/scripts/load-agentsam-env.sh && \
    python3 ~/inneranimalmedia/scripts/smoke/audit_agentsam_tables.py
"""

import os, sys, requests, json

CF_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_DB_ID   = os.environ["CLOUDFLARE_D1_DATABASE_ID"]

D1_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}"
    f"/d1/database/{CF_DB_ID}/query"
)
HEADERS = {"Authorization": f"Bearer {CF_TOKEN}", "Content-Type": "application/json"}

def d1(sql, params=None):
    r = requests.post(D1_URL, headers=HEADERS,
                      json={"sql": sql, "params": params or []}, timeout=20)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(data.get("errors"))
    return data["result"][0].get("results", [])

# ── 1. Get first 20 agentsam_* tables ────────────────────────────────────────
tables_rows = d1("""
    SELECT name FROM sqlite_master
    WHERE type='table' AND name LIKE 'agentsam_%'
    ORDER BY name
    LIMIT 20
""")
tables = [r["name"] for r in tables_rows]

print()
print("=" * 72)
print(f"  agentsam_* Table Audit  —  first {len(tables)} tables")
print("=" * 72)
print(f"  {'TABLE':<42} {'ROWS':>6}  NULL COLUMNS")
print("  " + "-" * 68)

total_nulls = 0
report = []

for tbl in tables:
    # row count
    try:
        cnt_rows = d1(f'SELECT COUNT(*) as n FROM "{tbl}"')
        row_count = cnt_rows[0]["n"] if cnt_rows else 0
    except Exception as e:
        row_count = f"ERR({e})"

    # column info
    try:
        cols = d1(f'PRAGMA table_info("{tbl}")')
    except Exception:
        cols = []

    null_cols = []
    if isinstance(row_count, int) and row_count > 0:
        for col in cols:
            col_name = col["name"]
            notnull  = col["notnull"]
            if notnull:
                continue   # NOT NULL constraint — skip, can't be null
            try:
                null_cnt = d1(
                    f'SELECT COUNT(*) as n FROM "{tbl}" WHERE "{col_name}" IS NULL'
                )
                n = null_cnt[0]["n"] if null_cnt else 0
                if n > 0:
                    null_cols.append(f"{col_name}({n})")
                    total_nulls += n
            except Exception:
                pass

    null_str = ", ".join(null_cols) if null_cols else "—"
    # truncate if long
    if len(null_str) > 40:
        null_str = null_str[:37] + "..."

    print(f"  {tbl:<42} {str(row_count):>6}  {null_str}")
    report.append({
        "table": tbl,
        "rows": row_count,
        "null_columns": null_cols,
    })

print("  " + "-" * 68)
print(f"  Total NULL entries found across {len(tables)} tables: {total_nulls}")
print("=" * 72)

# ── 2. Flag empty tables ──────────────────────────────────────────────────────
empty = [r["table"] for r in report if r["rows"] == 0]
if empty:
    print()
    print(f"  EMPTY TABLES ({len(empty)}):")
    for t in empty:
        print(f"    • {t}")

# ── 3. Flag tables with high NULL rates ───────────────────────────────────────
high_null = [r for r in report if len(r["null_columns"]) >= 3]
if high_null:
    print()
    print(f"  HIGH NULL DENSITY (≥3 nullable columns with NULLs):")
    for r in high_null:
        print(f"    • {r['table']}  — {', '.join(r['null_columns'])}")

print()
