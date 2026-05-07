#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone

DB_NAME = "inneranimalmedia-business"
OUT_DIR = Path("docs/db")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Add/remove patterns here depending on what Cursor is touching.
TABLE_PATTERNS = [
    "course_%",
    "courses",
    "lesson_%",
    "lessons",
    "%enroll%",
    "%user%",
    "cms_%",
]

OUT_MD = OUT_DIR / "d1_schema_context_for_cursor.md"
OUT_JSON = OUT_DIR / "d1_schema_context_for_cursor.json"
OUT_SQL = OUT_DIR / "d1_schema_create_tables_for_cursor.sql"


def run_wrangler_sql(sql: str) -> str:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "--json",
        "--command",
        sql,
    ]

    result = subprocess.run(
        cmd,
        text=True,
        capture_output=True,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "Wrangler command failed.\n\n"
            f"STDOUT:\n{result.stdout}\n\n"
            f"STDERR:\n{result.stderr}"
        )

    return result.stdout


def parse_wrangler_json(raw: str) -> list[dict]:
    """
    Wrangler --json usually returns:
    [
      {
        "results": [...],
        "success": true,
        ...
      }
    ]
    """
    data = json.loads(raw)
    if isinstance(data, list) and data:
        return data[0].get("results", []) or []
    if isinstance(data, dict):
        return data.get("results", []) or []
    return []


def like_where_clause(alias: str = "name") -> str:
    parts = []
    for pattern in TABLE_PATTERNS:
        parts.append(f"{alias} LIKE '{pattern}'")
    return " OR ".join(parts)


def get_tables() -> list[dict]:
    where = like_where_clause("name")
    sql = f"""
SELECT
  name,
  sql
FROM sqlite_master
WHERE type = 'table'
  AND ({where})
ORDER BY name;
"""
    return parse_wrangler_json(run_wrangler_sql(sql))


def get_columns(table_name: str) -> list[dict]:
    # table name is from sqlite_master, not user input
    sql = f'PRAGMA table_info("{table_name}");'
    return parse_wrangler_json(run_wrangler_sql(sql))


def get_indexes(table_name: str) -> list[dict]:
    sql = f'PRAGMA index_list("{table_name}");'
    indexes = parse_wrangler_json(run_wrangler_sql(sql))

    for idx in indexes:
        idx_name = idx.get("name")
        if not idx_name:
            idx["columns"] = []
            continue
        idx["columns"] = parse_wrangler_json(
            run_wrangler_sql(f'PRAGMA index_info("{idx_name}");')
        )

    return indexes


def get_counts(table_name: str) -> int | None:
    try:
        rows = parse_wrangler_json(run_wrangler_sql(f'SELECT COUNT(*) AS count FROM "{table_name}";'))
        if rows:
            return rows[0].get("count")
    except Exception:
        return None
    return None


def compact_column_line(columns: list[dict]) -> str:
    parts = []
    for col in columns:
        name = col.get("name")
        typ = col.get("type") or "ANY"
        pk = " PK" if col.get("pk") else ""
        nn = " NOT NULL" if col.get("notnull") else ""
        default = col.get("dflt_value")
        df = f" DEFAULT {default}" if default is not None else ""
        parts.append(f"{name} {typ}{pk}{nn}{df}".strip())
    return ", ".join(parts)


def main() -> None:
    tables = get_tables()

    schema = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "database": DB_NAME,
        "patterns": TABLE_PATTERNS,
        "tables": [],
    }

    for table in tables:
        name = table["name"]
        columns = get_columns(name)
        indexes = get_indexes(name)
        count = get_counts(name)

        schema["tables"].append(
            {
                "name": name,
                "row_count": count,
                "create_sql": table.get("sql"),
                "columns": columns,
                "indexes": indexes,
                "compact_columns": compact_column_line(columns),
            }
        )

    # JSON output for tools/agents
    OUT_JSON.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")

    # Raw CREATE TABLE SQL output
    OUT_SQL.write_text(
        "\n\n".join(
            f"-- {t['name']}\n{t.get('create_sql') or '-- no create SQL'};"
            for t in schema["tables"]
        )
        + "\n"
    )

    # Markdown output for Cursor
    lines = []
    lines.append("# D1 Schema Context for Cursor")
    lines.append("")
    lines.append(f"Generated: `{schema['generated_at']}`")
    lines.append(f"Database: `{DB_NAME}`")
    lines.append("")
    lines.append("## Why this exists")
    lines.append("")
    lines.append(
        "Use this file before writing Learn/course SQL. Do not guess columns. "
        "The recent `/api/learn/dashboard` failure was caused by querying a non-existent column: `e.tenant_id`."
    )
    lines.append("")
    lines.append("## Matched patterns")
    lines.append("")
    for pattern in TABLE_PATTERNS:
        lines.append(f"- `{pattern}`")
    lines.append("")
    lines.append("## Tables")
    lines.append("")

    for t in schema["tables"]:
        lines.append(f"### `{t['name']}`")
        lines.append("")
        lines.append(f"- Row count: `{t['row_count']}`")
        lines.append("")
        lines.append("Compact columns:")
        lines.append("")
        lines.append("```txt")
        lines.append(t["compact_columns"])
        lines.append("```")
        lines.append("")
        lines.append("Columns:")
        lines.append("")
        lines.append("| order | name | type | not null | default | pk |")
        lines.append("|---:|---|---|---:|---|---:|")
        for c in t["columns"]:
            lines.append(
                "| {cid} | `{name}` | `{type}` | {notnull} | `{default}` | {pk} |".format(
                    cid=c.get("cid"),
                    name=c.get("name"),
                    type=c.get("type") or "",
                    notnull=c.get("notnull"),
                    default=c.get("dflt_value"),
                    pk=c.get("pk"),
                )
            )

        if t["indexes"]:
            lines.append("")
            lines.append("Indexes:")
            lines.append("")
            lines.append("| name | unique | origin | partial | columns |")
            lines.append("|---|---:|---|---:|---|")
            for idx in t["indexes"]:
                idx_cols = ", ".join(
                    str(col.get("name"))
                    for col in idx.get("columns", [])
                    if col.get("name") is not None
                )
                lines.append(
                    "| `{name}` | {unique} | `{origin}` | {partial} | `{cols}` |".format(
                        name=idx.get("name"),
                        unique=idx.get("unique"),
                        origin=idx.get("origin"),
                        partial=idx.get("partial"),
                        cols=idx_cols,
                    )
                )

        lines.append("")
        lines.append("Create SQL:")
        lines.append("")
        lines.append("```sql")
        lines.append(t.get("create_sql") or "-- no create SQL")
        lines.append("```")
        lines.append("")

    OUT_MD.write_text("\n".join(lines))

    print(f"Wrote {OUT_MD}")
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_SQL}")
    print("")
    print("Matched tables:")
    for t in schema["tables"]:
        print(f"- {t['name']} ({t['row_count']} rows)")


if __name__ == "__main__":
    main()
