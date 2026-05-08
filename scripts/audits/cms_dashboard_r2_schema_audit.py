#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone

DB_NAME = "inneranimalmedia-business"
WRANGLER_CONFIG = "wrangler.production.toml"

BASE_TABLES = [
    "cms_pages",
    "cms_page_sections",
    "cms_section_components",
    "cms_component_templates",
    "cms_navigation_menus",
]

OUT_MD = Path("/tmp/cms_dashboard_r2_schema_audit.md")
OUT_JSON = Path("/tmp/cms_dashboard_r2_schema_audit.json")


def run_d1_json(sql: str):
    cmd = [
        "./scripts/with-cloudflare-env.sh",
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--json",
        "--command",
        sql,
    ]

    result = subprocess.run(
        cmd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.returncode != 0:
        return {
            "ok": False,
            "error": result.stderr.strip(),
            "stdout": result.stdout.strip(),
            "results": [],
        }

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "error": "Failed to parse Wrangler JSON output",
            "stdout": result.stdout.strip(),
            "results": [],
        }

    # Wrangler D1 --json usually returns a list like:
    # [{"results":[...],"success":true,"meta":{...}}]
    if isinstance(payload, list) and payload:
        return {
            "ok": True,
            "results": payload[0].get("results", []),
            "meta": payload[0].get("meta", {}),
            "raw": payload,
        }

    return {
        "ok": True,
        "results": [],
        "raw": payload,
    }


def get_dynamic_tables():
    sql = """
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND (
        name LIKE 'r2_%'
        OR name LIKE 'dashboard_%'
      )
    ORDER BY name;
    """
    res = run_d1_json(sql)
    return [row["name"] for row in res.get("results", []) if row.get("name")]


def get_table_info(table: str):
    return run_d1_json(f"PRAGMA table_info({table});").get("results", [])


def get_table_sql(table: str):
    sql = f"""
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = '{table.replace("'", "''")}';
    """
    rows = run_d1_json(sql).get("results", [])
    return rows[0].get("sql") if rows else ""


def get_row_count(table: str):
    rows = run_d1_json(f"SELECT COUNT(*) AS rows FROM {table};").get("results", [])
    return rows[0].get("rows", 0) if rows else 0


def get_indexes(table: str):
    return run_d1_json(f"PRAGMA index_list({table});").get("results", [])


def get_foreign_keys(table: str):
    return run_d1_json(f"PRAGMA foreign_key_list({table});").get("results", [])


def main():
    dynamic_tables = get_dynamic_tables()
    tables = []
    for table in BASE_TABLES + dynamic_tables:
        if table not in tables:
            tables.append(table)

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "database": DB_NAME,
        "base_tables": BASE_TABLES,
        "dynamic_tables": dynamic_tables,
        "tables": [],
    }

    for table in tables:
        print(f"Auditing {table}...")

        table_record = {
            "table": table,
            "row_count": get_row_count(table),
            "schema_sql": get_table_sql(table),
            "columns": get_table_info(table),
            "indexes": get_indexes(table),
            "foreign_keys": get_foreign_keys(table),
        }

        snapshot["tables"].append(table_record)

    OUT_JSON.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")

    md = []
    md.append("# CMS / Dashboard / R2 Schema Audit")
    md.append("")
    md.append(f"Generated: `{snapshot['generated_at']}`")
    md.append(f"Database: `{DB_NAME}`")
    md.append("")
    md.append("## Tables Included")
    md.append("")
    md.append("| Table | Rows | Columns | Indexes | Foreign Keys |")
    md.append("|---|---:|---:|---:|---:|")

    for t in snapshot["tables"]:
        md.append(
            f"| `{t['table']}` | {t['row_count']} | {len(t['columns'])} | {len(t['indexes'])} | {len(t['foreign_keys'])} |"
        )

    for t in snapshot["tables"]:
        md.append("")
        md.append(f"## `{t['table']}`")
        md.append("")
        md.append(f"- Rows: `{t['row_count']}`")
        md.append(f"- Columns: `{len(t['columns'])}`")
        md.append(f"- Indexes: `{len(t['indexes'])}`")
        md.append(f"- Foreign keys: `{len(t['foreign_keys'])}`")
        md.append("")
        md.append("### CREATE TABLE")
        md.append("")
        md.append("```sql")
        md.append(t["schema_sql"] or "-- No CREATE TABLE SQL found")
        md.append("```")
        md.append("")
        md.append("### Columns")
        md.append("")
        md.append("| cid | name | type | notnull | default | pk |")
        md.append("|---:|---|---|---:|---|---:|")
        for c in t["columns"]:
            md.append(
                f"| {c.get('cid')} | `{c.get('name')}` | `{c.get('type')}` | {c.get('notnull')} | `{c.get('dflt_value')}` | {c.get('pk')} |"
            )

        if t["indexes"]:
            md.append("")
            md.append("### Indexes")
            md.append("")
            md.append("```json")
            md.append(json.dumps(t["indexes"], indent=2))
            md.append("```")

        if t["foreign_keys"]:
            md.append("")
            md.append("### Foreign Keys")
            md.append("")
            md.append("```json")
            md.append(json.dumps(t["foreign_keys"], indent=2))
            md.append("```")

    OUT_MD.write_text("\n".join(md), encoding="utf-8")

    print("")
    print(f"JSON: {OUT_JSON}")
    print(f"MD  : {OUT_MD}")
    print("")
    print("Included tables:")
    for table in tables:
        print(f"  - {table}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Cancelled.", file=sys.stderr)
        sys.exit(130)
