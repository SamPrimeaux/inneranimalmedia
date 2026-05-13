#!/usr/bin/env python3
"""
Full timestamp audit across all agentsam_* and cms_* tables.
Detects: column name, storage format, type consistency, comparison safety.
Outputs a canonical column map + migration SQL to standardize.
"""

import json, os, re, urllib.request
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
REPO           = Path.home() / "inneranimalmedia"
NOW            = datetime.now(timezone.utc)

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req  = urllib.request.Request(D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        if not data.get("success"):
            return None
        return data["result"][0]["results"]
    except:
        return None

# ── known timestamp column name patterns ──────────────────────────────────────
TS_PATTERNS = [
    "created_at", "updated_at", "started_at", "completed_at",
    "checked_at", "detected_at", "computed_at", "compacted_at",
    "last_seen_at", "first_seen_at", "last_computed_at", "last_recalled_at",
    "last_run_at", "last_sync_at", "last_used_at", "last_error_at",
    "last_health_check", "last_decay_at", "last_read_at", "first_written_at",
    "acknowledged_at", "approved_at", "expires_at", "ended_at",
    "scheduled_at", "triggered_at", "resolved_at", "ingested_at",
    "data_from", "data_to", "period_date", "metric_date", "snapshot_date",
]

def detect_format(val):
    """Detect the storage format of a timestamp value."""
    if val is None:
        return "NULL"
    v = str(val).strip()
    if re.match(r"^\d{10}$", v):
        return "INTEGER_UNIX_10"       # unix seconds
    if re.match(r"^\d{13}$", v):
        return "INTEGER_UNIX_13"       # unix milliseconds
    if re.match(r"^\d+\.\d+$", v):
        return "FLOAT_UNIX"            # float unix
    if re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", v):
        return "TEXT_ISO8601"          # 2026-05-13T21:00:00Z
    if re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", v):
        return "TEXT_SQLITE"           # 2026-05-13 21:00:00
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return "TEXT_DATE_ONLY"        # 2026-05-13
    return f"UNKNOWN({v[:30]})"

def parse_to_utc(val, fmt):
    """Try to parse timestamp to UTC datetime."""
    if val is None or fmt == "NULL":
        return None
    v = str(val).strip()
    try:
        if fmt == "INTEGER_UNIX_10":
            return datetime.fromtimestamp(int(v), tz=timezone.utc)
        if fmt == "INTEGER_UNIX_13":
            return datetime.fromtimestamp(int(v)/1000, tz=timezone.utc)
        if fmt == "FLOAT_UNIX":
            return datetime.fromtimestamp(float(v), tz=timezone.utc)
        if fmt == "TEXT_ISO8601":
            return datetime.fromisoformat(v.replace("Z","+00:00"))
        if fmt == "TEXT_SQLITE":
            return datetime.strptime(v[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        if fmt == "TEXT_DATE_ONLY":
            return datetime.strptime(v, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except:
        return None

def sqlite_expr(col, fmt):
    """Return the correct SQLite expression to get epoch seconds from this col."""
    if fmt in ("INTEGER_UNIX_10",):
        return col
    if fmt == "INTEGER_UNIX_13":
        return f"({col} / 1000)"
    if fmt == "FLOAT_UNIX":
        return f"CAST({col} AS INTEGER)"
    if fmt in ("TEXT_ISO8601", "TEXT_SQLITE"):
        return f"strftime('%s', {col})"
    if fmt == "TEXT_DATE_ONLY":
        return f"strftime('%s', {col})"
    return col

# ── discover all tables ───────────────────────────────────────────────────────
print("Discovering tables...")
raw = d1("""SELECT name FROM sqlite_master WHERE type='table'
            AND (name LIKE 'agentsam_%' OR name LIKE 'cms_%')
            ORDER BY name""")
ALL_TABLES = [r["name"] for r in raw] if raw else []
print(f"Found {len(ALL_TABLES)} tables\n")

# ── per-table timestamp audit ─────────────────────────────────────────────────
table_map   = {}   # table → {col, fmt, age_h, safe_expr}
format_dist = {}   # fmt → count
issues      = []   # list of problems found

for i, table in enumerate(ALL_TABLES, 1):
    print(f"[{i:3}/{len(ALL_TABLES)}] {table}", end=" ", flush=True)

    # get schema
    schema = d1(f"PRAGMA table_info({table})")
    if not schema:
        print("SCHEMA ERR")
        continue
    col_names = [r["name"] for r in schema]

    # find timestamp columns
    ts_cols_found = [c for c in col_names if c in TS_PATTERNS or c.endswith("_at")]

    # get row count
    cnt = d1(f"SELECT COUNT(*) as n FROM {table}")
    count = cnt[0]["n"] if cnt else 0

    if count == 0 or not ts_cols_found:
        table_map[table] = {
            "ts_cols": ts_cols_found,
            "count": count,
            "primary_ts": None,
            "fmt": None,
            "age_h": None,
            "safe_expr": None,
            "issues": ["NO_TS_COLS" if not ts_cols_found else "EMPTY"],
        }
        print(f"{'NO_TS' if not ts_cols_found else 'EMPTY'}")
        continue

    # sample each ts col
    col_details = {}
    for col in ts_cols_found[:6]:  # cap at 6 per table
        sample = d1(f"SELECT {col}, typeof({col}) as t FROM {table} WHERE {col} IS NOT NULL LIMIT 1")
        if sample and sample[0][col] is not None:
            val = sample[0][col]
            typ = sample[0]["t"]
            fmt = detect_format(val)
            dt  = parse_to_utc(val, fmt)
            age_h = round((NOW - dt).total_seconds() / 3600, 1) if dt else None
            col_details[col] = {"val": str(val)[:30], "sqlite_type": typ,
                                "fmt": fmt, "age_h": age_h, "dt": dt}
        else:
            col_details[col] = {"val": None, "fmt": "NULL", "age_h": None}

    # pick primary ts col (prefer created_at > updated_at > last_seen_at > first found)
    priority_order = ["created_at","updated_at","started_at","last_seen_at",
                      "computed_at","checked_at","detected_at","compacted_at"]
    primary = next((c for c in priority_order if c in col_details and
                    col_details[c]["fmt"] not in ("NULL","UNKNOWN")), None)
    if not primary:
        primary = next((c for c, d in col_details.items()
                        if d["fmt"] not in ("NULL","UNKNOWN")), None)

    # detect mixed formats (problem!)
    fmts_used = set(d["fmt"] for d in col_details.values()
                    if d["fmt"] not in ("NULL","UNKNOWN"))
    table_issues = []
    if len(fmts_used) > 1:
        table_issues.append(f"MIXED_FORMATS: {fmts_used}")
        issues.append({"table": table, "issue": "MIXED_FORMATS", "detail": str(fmts_used)})

    # check if SQLite declared type matches actual storage
    for col, d in col_details.items():
        if d["fmt"] == "INTEGER_UNIX_10" and d["sqlite_type"] == "text":
            table_issues.append(f"TYPE_MISMATCH: {col} stored as TEXT but is unix int")
            issues.append({"table": table, "issue": "TYPE_MISMATCH",
                           "detail": f"{col}: declared text, value is unix int"})
        if d["fmt"] in ("TEXT_ISO8601","TEXT_SQLITE") and d["sqlite_type"] == "integer":
            table_issues.append(f"TYPE_MISMATCH: {col} stored as INTEGER but is ISO string")

    primary_fmt  = col_details.get(primary, {}).get("fmt") if primary else None
    primary_age  = col_details.get(primary, {}).get("age_h") if primary else None
    safe_expr    = sqlite_expr(primary, primary_fmt) if primary and primary_fmt else None

    if primary_fmt:
        format_dist[primary_fmt] = format_dist.get(primary_fmt, 0) + 1

    table_map[table] = {
        "ts_cols": ts_cols_found,
        "col_details": col_details,
        "count": count,
        "primary_ts": primary,
        "fmt": primary_fmt,
        "age_h": primary_age,
        "safe_expr": safe_expr,
        "issues": table_issues,
    }

    age_str = f"{primary_age}h" if primary_age is not None else "?"
    issue_str = f" ⚠️ {', '.join(table_issues)}" if table_issues else ""
    print(f"{primary_fmt or 'NO_FMT'} | {primary or '?'} | {age_str}{issue_str}")

# ── generate canonical column map ─────────────────────────────────────────────
print("\nBuilding canonical map...")

# This is the corrected TIMESTAMP_COLS and ts_col overrides for audit scripts
canonical_map = {}
for table, info in table_map.items():
    if info.get("primary_ts"):
        canonical_map[table] = {
            "col": info["primary_ts"],
            "fmt": info["fmt"],
            "safe_expr": info["safe_expr"],
        }

# ── generate standardization migration SQL ────────────────────────────────────
# Find tables that should add created_at / updated_at as INTEGER
needs_created_at = [t for t, info in table_map.items()
                    if "created_at" not in info.get("ts_cols", [])
                    and info.get("count", 0) > 0]

needs_updated_at = [t for t, info in table_map.items()
                    if "updated_at" not in info.get("ts_cols", [])
                    and "created_at" in info.get("ts_cols", [])
                    and info.get("count", 0) > 0]

# Find tables using TEXT instead of INTEGER for timestamps
wrong_type = [(t, col, d)
              for t, info in table_map.items()
              for col, d in info.get("col_details", {}).items()
              if d.get("fmt") in ("TEXT_ISO8601","TEXT_SQLITE")
              and t not in ("agentsam_prompt_cache_keys",)]  # some are intentionally text

# ── write report ──────────────────────────────────────────────────────────────
out_dir = REPO / "docs" / "db-audit"
out_dir.mkdir(parents=True, exist_ok=True)
ts_str  = NOW.strftime("%Y%m%dT%H%M%S")

lines = []
lines.append("# Timestamp Audit — agentsam_* + cms_*")
lines.append(f"Generated: {NOW.strftime('%Y-%m-%dT%H:%M:%S UTC')} | {len(ALL_TABLES)} tables\n")

lines.append("## Storage Format Distribution\n")
lines.append("| Format | Tables | Correct for D1? |")
lines.append("|--------|--------|----------------|")
format_info = {
    "INTEGER_UNIX_10": "✅ Yes — fastest, correct for range queries",
    "TEXT_SQLITE":     "⚠️ Slower — use strftime('%s',col) for range queries",
    "TEXT_ISO8601":    "⚠️ Slower — use strftime('%s',col) for range queries",
    "TEXT_DATE_ONLY":  "⚠️ Date only — no time precision",
    "FLOAT_UNIX":      "⚠️ Float — cast to INTEGER",
    "INTEGER_UNIX_13": "⚠️ Milliseconds — divide by 1000 for seconds",
}
for fmt, cnt in sorted(format_dist.items(), key=lambda x: -x[1]):
    note = format_info.get(fmt, "❓ Unknown")
    lines.append(f"| `{fmt}` | {cnt} | {note} |")

lines.append(f"\n**Recommended standard:** `INTEGER` storing `unixepoch()` — fastest D1 comparisons, no parsing, correct `WHERE ts > X` syntax.\n")

lines.append("---\n")
lines.append("## Issues Found\n")

mixed = [x for x in issues if x["issue"] == "MIXED_FORMATS"]
mismatched = [x for x in issues if x["issue"] == "TYPE_MISMATCH"]

if mixed:
    lines.append(f"### ⚠️ Mixed Formats ({len(mixed)} tables)")
    lines.append("These tables have different timestamp formats across columns — range queries comparing them will silently produce wrong results.\n")
    for x in mixed:
        lines.append(f"- `{x['table']}`: {x['detail']}")
    lines.append("")

if mismatched:
    lines.append(f"### 🔴 Type Mismatches ({len(mismatched)} tables)")
    lines.append("SQLite declared type doesn't match actual stored value.\n")
    for x in mismatched:
        lines.append(f"- `{x['table']}`: {x['detail']}")
    lines.append("")

if needs_created_at:
    lines.append(f"### ⚪ Missing created_at ({len(needs_created_at)} tables)")
    lines.append("These tables have data but no `created_at` column — impossible to do time-range analytics.\n")
    for t in sorted(needs_created_at)[:20]:
        lines.append(f"- `{t}`")
    if len(needs_created_at) > 20:
        lines.append(f"- ... and {len(needs_created_at)-20} more")
    lines.append("")

lines.append("---\n")
lines.append("## Canonical Timestamp Column Map\n")
lines.append("Use this in audit scripts and API handlers for correct time queries.\n")
lines.append("| Table | Primary TS Col | Format | Safe SQLite Expr |")
lines.append("|-------|---------------|--------|-----------------|")
for table in sorted(canonical_map.keys()):
    m = canonical_map[table]
    lines.append(f"| `{table}` | `{m['col']}` | `{m['fmt']}` | `{m['safe_expr']}` |")

lines.append("\n---\n")
lines.append("## Standardization Migration SQL\n")
lines.append("Add `created_at INTEGER DEFAULT (unixepoch())` to tables missing it.\n")
lines.append("**Review each before running** — SQLite ALTER TABLE cannot modify existing columns.\n")
lines.append("```sql")
for t in sorted(needs_created_at[:15]):
    lines.append(f"ALTER TABLE {t} ADD COLUMN created_at INTEGER DEFAULT (unixepoch());")
lines.append("```\n")

lines.append("### Text → Integer timestamp notes")
lines.append("These tables store timestamps as TEXT. Backfilling to INTEGER requires a new column + data migration:\n")
lines.append("```sql")
for t, col, d in wrong_type[:10]:
    lines.append(f"-- {t}.{col} is TEXT '{d.get('fmt')}' — to standardize:")
    lines.append(f"ALTER TABLE {t} ADD COLUMN {col}_unix INTEGER;")
    lines.append(f"UPDATE {t} SET {col}_unix = strftime('%s', {col}) WHERE {col} IS NOT NULL;")
    lines.append(f"-- After verifying: drop {col}, rename {col}_unix to {col}")
    lines.append("")
lines.append("```")

lines.append("\n---\n")
lines.append("## Python Audit Script Patch\n")
lines.append("Replace the `TIMESTAMP_COLS` set and add `TS_OVERRIDE` in `analytics_ui_audit.py`:\n")
lines.append("```python")
lines.append("# Canonical timestamp column overrides (from timestamp_audit.py)")
lines.append("TS_OVERRIDE = {")
for table, m in sorted(canonical_map.items()):
    if m["col"] not in ("created_at","updated_at"):
        lines.append(f'    "{table}": "{m["col"]}",')
lines.append("}")
lines.append("")
lines.append("# In d1_count_and_fresh(), use:")
lines.append("# ts_col = TS_OVERRIDE.get(table, ts_col)  # before the MAX() query")
lines.append("```")

lines.append("\n---")
lines.append(f"*Run `scripts/timestamp_audit.py` to refresh.*")

report = out_dir / f"timestamp_audit_{ts_str}.md"
report.write_text("\n".join(lines))

# also write the canonical map as JSON for easy import
json_map = {t: {"col": m["col"], "fmt": m["fmt"], "safe_expr": m["safe_expr"]}
            for t, m in canonical_map.items()}
(out_dir / "timestamp_canonical_map.json").write_text(json.dumps(json_map, indent=2))

print(f"\nReport:   docs/db-audit/timestamp_audit_{ts_str}.md")
print(f"JSON map: docs/db-audit/timestamp_canonical_map.json")
print(f"\nFormat distribution: {format_dist}")
print(f"Issues found: {len(issues)} ({len(mixed)} mixed format, {len(mismatched)} type mismatch)")
print(f"Missing created_at: {len(needs_created_at)} tables")
print(f"Done.")
