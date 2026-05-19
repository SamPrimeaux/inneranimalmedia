#!/usr/bin/env python3
"""
agentsam_* table audit for inneranimalmedia-business D1.

Reports per table: row count, column count, last activity timestamp (if a
recognized timestamp column exists), and a dormancy classification. No row
dumps, no full schema printouts.

Usage:
    ./scripts/with-cloudflare-env.sh python3 scripts/audit_agentsam_tables.py
    ./scripts/with-cloudflare-env.sh python3 scripts/audit_agentsam_tables.py --probe-cols
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "ede6590ac0d2fb7daf155b35653457b2")
DATABASE_ID = os.environ.get("D1_DATABASE_ID", "cf87b717-d4e2-4cf8-bab0-a81268e32d49")
API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")

API_URL = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query"

# Column names probed (in order) to derive "last activity"
TS_CANDIDATES = [
    "updated_at",
    "created_at",
    "modified_at",
    "occurred_at",
    "event_time",
    "recorded_at",
    "inserted_at",
    "logged_at",
    "timestamp",
    "ts",
    "last_seen",
    "last_used_at",
    "completed_at",
    "started_at",
    "at",
]


def d1(sql):
    if not API_TOKEN:
        sys.exit("CLOUDFLARE_API_TOKEN env var is required (use ./scripts/with-cloudflare-env.sh)")
    req = urllib.request.Request(
        API_URL,
        data=json.dumps({"sql": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"D1 HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")
    except urllib.error.URLError as e:
        sys.exit(f"D1 network error: {e}")

    if not payload.get("success"):
        sys.exit(f"D1 error: {json.dumps(payload.get('errors', []), indent=2)}")
    results = payload.get("result", [])
    return results[0].get("results", []) if results else []


def list_tables():
    rows = d1(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND name LIKE 'agentsam\\_%' ESCAPE '\\' "
        "ORDER BY name"
    )
    return [r["name"] for r in rows]


def columns(table):
    return [r["name"] for r in d1(f"PRAGMA table_info({table})")]


def row_count(table):
    rows = d1(f"SELECT COUNT(*) AS n FROM {table}")
    return rows[0]["n"] if rows else 0


def last_activity(table, cols):
    for c in TS_CANDIDATES:
        if c in cols:
            rows = d1(f"SELECT MAX({c}) AS m FROM {table}")
            v = rows[0]["m"] if rows else None
            if v is not None:
                return c, v
    return None, None


def parse_ts(ts_val):
    """Return timezone-aware UTC datetime or raise."""
    if isinstance(ts_val, (int, float)) or (isinstance(ts_val, str) and str(ts_val).isdigit()):
        n = int(ts_val)
        return datetime.fromtimestamp(n / 1000 if n > 10_000_000_000 else n, tz=timezone.utc)
    dt = datetime.fromisoformat(str(ts_val).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def classify(rows, ts_val):
    if rows == 0:
        return "EMPTY"
    if ts_val is None:
        return "NO_TS"
    try:
        dt = parse_ts(ts_val)
        days = (datetime.now(timezone.utc) - dt).days
        if days <= 7:
            return "ACTIVE"
        if days <= 30:
            return "WARM"
        if days <= 90:
            return "COOL"
        return "DORMANT"
    except Exception:
        return "UNPARSED"


def audit_tables():
    tables = list_tables()
    if not tables:
        print("No agentsam_* tables found.")
        return []

    out = []
    for t in tables:
        try:
            cols = columns(t)
            n = row_count(t)
            ts_c, ts = last_activity(t, cols)
            out.append(
                {
                    "table": t,
                    "rows": n,
                    "cols": len(cols),
                    "col_names": cols,
                    "ts_col": ts_c or "-",
                    "last": str(ts)[:24] if ts is not None else "-",
                    "status": classify(n, ts),
                }
            )
        except SystemExit:
            raise
        except Exception as e:
            out.append(
                {
                    "table": t,
                    "rows": -1,
                    "cols": -1,
                    "col_names": [],
                    "ts_col": "-",
                    "last": "-",
                    "status": f"ERR:{e}",
                }
            )
    return out


def print_audit_report(out):
    order = {"ERR": 0, "EMPTY": 1, "NO_TS": 2, "DORMANT": 3, "COOL": 4, "WARM": 5, "ACTIVE": 6, "UNPARSED": 7}
    out.sort(key=lambda r: (order.get(r["status"].split(":")[0], 99), -r["rows"]))

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"agentsam_* audit  -  {len(out)} tables  -  {stamp}")
    print("=" * 112)
    print(f"{'TABLE':<48} {'ROWS':>10} {'COLS':>5}  {'TS_COL':<14} {'LAST':<26} STATUS")
    print("-" * 112)
    for r in out:
        rows_str = f"{r['rows']:>10,}" if r["rows"] >= 0 else f"{'?':>10}"
        print(f"{r['table']:<48} {rows_str} {r['cols']:>5}  {r['ts_col']:<14} {r['last']:<26} {r['status']}")
    print("-" * 112)

    buckets = {}
    for r in out:
        k = r["status"].split(":")[0]
        buckets[k] = buckets.get(k, 0) + 1
    print("summary: " + " | ".join(f"{k}:{v}" for k, v in sorted(buckets.items(), key=lambda x: order.get(x[0], 99))))
    return out


def write_probe_cols(out, probe_path: Path):
    no_ts = [r for r in out if r["status"] == "NO_TS"]
    lines = [
        f"agentsam NO_TS column probe - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"tables: {len(no_ts)}",
        "",
    ]
    for r in no_ts:
        lines.append(f"## {r['table']} ({r['rows']} rows)")
        lines.append(", ".join(r.get("col_names") or []))
        lines.append("")
    probe_path.parent.mkdir(parents=True, exist_ok=True)
    probe_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nprobe-cols written: {probe_path}")


def main():
    parser = argparse.ArgumentParser(description="Audit agentsam_* D1 tables")
    parser.add_argument(
        "--probe-cols",
        action="store_true",
        help="After audit, dump all column names for NO_TS tables to scripts/agentsam_column_probe_<date>.txt",
    )
    args = parser.parse_args()

    out = audit_tables()
    if not out:
        return

    print_audit_report(out)

    if args.probe_cols:
        date_tag = datetime.now().strftime("%Y%m%d")
        repo_root = Path(__file__).resolve().parent.parent
        probe_path = repo_root / "scripts" / f"agentsam_column_probe_{date_tag}.txt"
        write_probe_cols(out, probe_path)


if __name__ == "__main__":
    main()
