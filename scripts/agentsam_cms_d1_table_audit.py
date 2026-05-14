#!/usr/bin/env python3
"""
Read-only D1 audit: list agentsam_* and cms_* tables via wrangler, write JSON + MD under artifacts/d1_audits/.

Run from anywhere; repo root is derived from this file's location (parent of scripts/).
Use ./scripts/with-cloudflare-env.sh when calling wrangler if your environment requires it.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = ROOT / "artifacts" / "d1_audits"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
REMOTE_FLAG = os.getenv("IAM_D1_REMOTE", "1") != "0"

RUN_ID = time.strftime("agentsam_cms_tables_%Y%m%dT%H%M%SZ", time.gmtime())

TABLE_LIST_SQL = """
SELECT
  name,
  type,
  sql
FROM sqlite_master
WHERE type = 'table'
  AND (
    name LIKE 'agentsam_%'
    OR name LIKE 'cms_%'
  )
ORDER BY
  CASE
    WHEN name LIKE 'agentsam_%' THEN 1
    WHEN name LIKE 'cms_%' THEN 2
    ELSE 9
  END,
  name;
""".strip()


def run_wrangler_sql(sql: str) -> list[dict[str, Any]]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        D1_DB,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--json",
        "--command",
        sql,
    ]

    print("")
    print("D1 TABLE AUDIT")
    print("=" * 72)
    print(f"Database: {D1_DB}")
    print(f"Config:   {WRANGLER_CONFIG}")
    print(f"Remote:   {REMOTE_FLAG}")
    print("=" * 72)
    print("")

    if not REMOTE_FLAG:
        cmd.remove("--remote")

    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if proc.returncode != 0:
        print("FAILED: Wrangler D1 command returned a non-zero exit code.", file=sys.stderr)
        print("", file=sys.stderr)
        print(proc.stderr, file=sys.stderr)
        raise SystemExit(proc.returncode)

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        print("FAILED: Could not parse Wrangler JSON output.", file=sys.stderr)
        print("", file=sys.stderr)
        print("STDOUT preview:", file=sys.stderr)
        print(proc.stdout[:4000], file=sys.stderr)
        print("", file=sys.stderr)
        print("STDERR preview:", file=sys.stderr)
        print(proc.stderr[:4000], file=sys.stderr)
        raise SystemExit(1)

    if not isinstance(payload, list) or not payload:
        return []

    results = payload[0].get("results", [])
    if not isinstance(results, list):
        return []

    return results


def extract_columns_from_create_sql(create_sql: str | None) -> list[str]:
    if not create_sql:
        return []

    match = re.search(r"\((.*)\)", create_sql, flags=re.S)
    if not match:
        return []

    body = match.group(1)
    columns: list[str] = []

    for raw_line in body.splitlines():
        line = raw_line.strip().rstrip(",")
        if not line:
            continue

        upper = line.upper()
        if upper.startswith(
            (
                "PRIMARY KEY",
                "FOREIGN KEY",
                "UNIQUE",
                "CHECK",
                "CONSTRAINT",
            )
        ):
            continue

        col_match = re.match(r'^"?([A-Za-z_][A-Za-z0-9_]*)"?\s+', line)
        if col_match:
            columns.append(col_match.group(1))

    return columns


def classify_table(name: str) -> str:
    if name.startswith("agentsam_"):
        return "agentsam"
    if name.startswith("cms_"):
        return "cms"
    return "other"


def main() -> None:
    rows = run_wrangler_sql(TABLE_LIST_SQL)

    tables: list[dict[str, Any]] = []
    for row in rows:
        name = row.get("name", "")
        sql = row.get("sql", "")
        columns = extract_columns_from_create_sql(sql)

        tables.append(
            {
                "name": name,
                "group": classify_table(name),
                "type": row.get("type", "table"),
                "column_count": len(columns),
                "columns": columns,
                "sql": sql,
            }
        )

    agentsam_tables = [t for t in tables if t["group"] == "agentsam"]
    cms_tables = [t for t in tables if t["group"] == "cms"]

    json_path = ARTIFACT_DIR / f"{RUN_ID}.json"
    md_path = ARTIFACT_DIR / f"{RUN_ID}.md"

    artifact = {
        "run_id": RUN_ID,
        "database": D1_DB,
        "wrangler_config": WRANGLER_CONFIG,
        "remote": REMOTE_FLAG,
        "counts": {
            "total": len(tables),
            "agentsam": len(agentsam_tables),
            "cms": len(cms_tables),
        },
        "tables": tables,
    }

    json_path.write_text(json.dumps(artifact, indent=2, sort_keys=False), encoding="utf-8")

    lines: list[str] = []
    lines.append(f"# D1 Table Audit — {RUN_ID}")
    lines.append("")
    lines.append(f"- Database: `{D1_DB}`")
    lines.append(f"- Wrangler config: `{WRANGLER_CONFIG}`")
    lines.append(f"- Remote: `{REMOTE_FLAG}`")
    lines.append(f"- Total matching tables: `{len(tables)}`")
    lines.append(f"- agentsam_* tables: `{len(agentsam_tables)}`")
    lines.append(f"- cms_* tables: `{len(cms_tables)}`")
    lines.append("")

    lines.append("## agentsam_* tables")
    lines.append("")
    if agentsam_tables:
        lines.append("| # | Table | Columns |")
        lines.append("|---:|---|---:|")
        for idx, table in enumerate(agentsam_tables, start=1):
            lines.append(f"| {idx} | `{table['name']}` | {table['column_count']} |")
    else:
        lines.append("_No agentsam_* tables found._")
    lines.append("")

    lines.append("## cms_* tables")
    lines.append("")
    if cms_tables:
        lines.append("| # | Table | Columns |")
        lines.append("|---:|---|---:|")
        for idx, table in enumerate(cms_tables, start=1):
            lines.append(f"| {idx} | `{table['name']}` | {table['column_count']} |")
    else:
        lines.append("_No cms_* tables found._")
    lines.append("")

    lines.append("## Compact schema notes")
    lines.append("")
    for table in tables:
        preview_cols = ", ".join(table["columns"][:14])
        if len(table["columns"]) > 14:
            preview_cols += ", ..."
        lines.append(f"### `{table['name']}`")
        lines.append("")
        lines.append(f"- Columns: `{table['column_count']}`")
        lines.append(f"- Preview: `{preview_cols}`")
        lines.append("")

    md_path.write_text("\n".join(lines), encoding="utf-8")

    print("SUMMARY")
    print("-" * 72)
    print(f"Total matching tables: {len(tables)}")
    print(f"agentsam_* tables:    {len(agentsam_tables)}")
    print(f"cms_* tables:         {len(cms_tables)}")
    print("")

    print("AGENTSAM TABLES")
    print("-" * 72)
    for table in agentsam_tables:
        print(f"{table['name']:<52} {table['column_count']:>4} cols")
    if not agentsam_tables:
        print("None found.")
    print("")

    print("CMS TABLES")
    print("-" * 72)
    for table in cms_tables:
        print(f"{table['name']:<52} {table['column_count']:>4} cols")
    if not cms_tables:
        print("None found.")
    print("")

    print("ARTIFACTS")
    print("-" * 72)
    print(f"JSON: {json_path}")
    print(f"MD:   {md_path}")
    print("")
    print("PASS: Read-only D1 audit completed.")


if __name__ == "__main__":
    main()
