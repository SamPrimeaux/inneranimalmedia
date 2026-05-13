#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
DB_NAME = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
REMOTE = os.getenv("IAM_D1_REMOTE", "1") != "0"
SEARCH_TERM = os.getenv("IAM_SCAN_TERM", "source_kind")
SAMPLE_LIMIT = int(os.getenv("IAM_SAMPLE_LIMIT", "20"))

OUT_DIR = ROOT / "artifacts" / "audit"
OUT_DIR.mkdir(parents=True, exist_ok=True)
OUT_PATH = OUT_DIR / f"d1_scan_{SEARCH_TERM}.json"


def run_cmd(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("+ " + " ".join(shlex.quote(part) for part in cmd), file=sys.stderr)
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def d1_json(sql: str) -> list[dict[str, Any]]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--json",
        "-c",
        WRANGLER_CONFIG,
        "--command",
        sql,
    ]

    if REMOTE:
        cmd.insert(5, "--remote")

    proc = run_cmd(cmd)

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        print("ERROR: wrangler did not return JSON.", file=sys.stderr)
        print("STDOUT:", proc.stdout[-4000:], file=sys.stderr)
        print("STDERR:", proc.stderr[-4000:], file=sys.stderr)
        raise exc

    results: list[dict[str, Any]] = []
    if isinstance(payload, list):
        for block in payload:
            if isinstance(block, dict) and isinstance(block.get("results"), list):
                results.extend(block["results"])
    return results


def ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def main() -> int:
    report: dict[str, Any] = {
        "db_name": DB_NAME,
        "wrangler_config": WRANGLER_CONFIG,
        "remote": REMOTE,
        "search_term": SEARCH_TERM,
        "schema_mentions": [],
        "objects_with_column": [],
        "sampled_values": [],
        "repo_mentions": [],
        "errors": [],
    }

    schema_sql = f"""
SELECT
  type,
  name,
  tbl_name,
  sql
FROM sqlite_master
WHERE sql IS NOT NULL
  AND lower(sql) LIKE lower('%{SEARCH_TERM}%')
ORDER BY type, name;
"""
    schema_mentions = d1_json(schema_sql)
    report["schema_mentions"] = schema_mentions

    print("\n=== SCHEMA DEFINITIONS MENTIONING TERM ===")
    if schema_mentions:
        for row in schema_mentions:
            print(f"- {row.get('type')} {row.get('name')} tbl={row.get('tbl_name')}")
    else:
        print(f"No sqlite_master.sql definitions mention {SEARCH_TERM!r}.")

    objects = d1_json("""
SELECT type, name
FROM sqlite_master
WHERE type IN ('table','view')
  AND name NOT LIKE 'sqlite_%'
ORDER BY type, name;
""")

    objects_with_column: list[dict[str, Any]] = []

    for obj in objects:
        name = str(obj.get("name", ""))
        obj_type = str(obj.get("type", ""))

        try:
            cols = d1_json(f"PRAGMA table_info({ident(name)});")
        except Exception as exc:
            report["errors"].append({
                "stage": "pragma_table_info",
                "object": name,
                "error": str(exc),
            })
            continue

        for col in cols:
            if str(col.get("name", "")).lower() == SEARCH_TERM.lower():
                objects_with_column.append({
                    "object_type": obj_type,
                    "object_name": name,
                    "cid": col.get("cid"),
                    "column_name": col.get("name"),
                    "column_type": col.get("type"),
                    "notnull": col.get("notnull"),
                    "default": col.get("dflt_value"),
                    "pk": col.get("pk"),
                })

    report["objects_with_column"] = objects_with_column

    print("\n=== TABLES/VIEWS WITH COLUMN NAMED TERM ===")
    if objects_with_column:
        for row in objects_with_column:
            print(f"- {row['object_type']} {row['object_name']}.{row['column_name']} {row['column_type']}")
    else:
        print(f"No table/view has a column exactly named {SEARCH_TERM!r}.")

    sampled_values: list[dict[str, Any]] = []

    for row in objects_with_column:
        if row["object_type"] != "table":
            continue

        table_name = str(row["object_name"])

        try:
            counts = d1_json(f"""
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN {ident(SEARCH_TERM)} IS NULL OR trim({ident(SEARCH_TERM)}) = '' THEN 1 ELSE 0 END) AS missing_rows
FROM {ident(table_name)};
""")

            distinct_values = d1_json(f"""
SELECT
  {ident(SEARCH_TERM)} AS value,
  COUNT(*) AS row_count
FROM {ident(table_name)}
GROUP BY {ident(SEARCH_TERM)}
ORDER BY row_count DESC, value
LIMIT {SAMPLE_LIMIT};
""")

            sample_rows = d1_json(f"""
SELECT *
FROM {ident(table_name)}
WHERE {ident(SEARCH_TERM)} IS NOT NULL
LIMIT {min(SAMPLE_LIMIT, 10)};
""")

            sampled_values.append({
                "table": table_name,
                "counts": counts[0] if counts else {},
                "distinct_values": distinct_values,
                "sample_rows": sample_rows,
            })
        except Exception as exc:
            report["errors"].append({
                "stage": "sample_values",
                "table": table_name,
                "error": str(exc),
            })

    report["sampled_values"] = sampled_values

    print("\n=== VALUE USAGE SAMPLES ===")
    if sampled_values:
        for item in sampled_values:
            print(f"\n{item['table']}")
            print("counts:", item["counts"])
            print("values:")
            for value_row in item["distinct_values"]:
                print(f"  - {value_row.get('value')!r}: {value_row.get('row_count')}")
    else:
        print(f"No real table rows sampled for {SEARCH_TERM!r}.")

    rg_cmd = [
        "rg",
        "-n",
        "--hidden",
        "--glob",
        "!node_modules",
        "--glob",
        "!.git",
        "--glob",
        "!dist",
        "--glob",
        "!dashboard/dist",
        SEARCH_TERM,
        ".",
    ]

    proc = run_cmd(rg_cmd, check=False)
    repo_mentions: list[dict[str, Any]] = []

    if proc.returncode in (0, 1):
        for line in proc.stdout.splitlines():
            parts = line.split(":", 2)
            if len(parts) == 3:
                repo_mentions.append({
                    "path": parts[0],
                    "line": parts[1],
                    "text": parts[2][:500],
                })
            else:
                repo_mentions.append({"raw": line[:500]})
    else:
        report["errors"].append({
            "stage": "repo_rg",
            "error": proc.stderr[-4000:],
        })

    report["repo_mentions"] = repo_mentions

    print("\n=== LOCAL REPO MENTIONS ===")
    if repo_mentions:
        for mention in repo_mentions[:120]:
            if "path" in mention:
                print(f"- {mention['path']}:{mention['line']}:{mention['text']}")
            else:
                print(f"- {mention['raw']}")
        if len(repo_mentions) > 120:
            print(f"... plus {len(repo_mentions) - 120} more")
    else:
        print(f"No local repo mentions found for {SEARCH_TERM!r}.")

    OUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")

    print("\n=== SUMMARY ===")
    print(f"schema_mentions: {len(schema_mentions)}")
    print(f"objects_with_column: {len(objects_with_column)}")
    print(f"sampled_tables: {len(sampled_values)}")
    print(f"repo_mentions: {len(repo_mentions)}")
    print(f"errors: {len(report['errors'])}")
    print(f"wrote: {OUT_PATH}")

    return 0 if not report["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
