#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone

DB_NAME = "inneranimalmedia-business"

# Scoped for /dashboard/learn, course platform, user/enrollment, and CMS support.
TABLE_PATTERNS = [
    "courses",
    "course_%",
    "lesson_%",
    "lessons",
    "%enroll%",
    "%user%",
    "auth_users",
    "org_users",
    "cms_themes",
    "cms_theme_preferences",
    "cms_assets",
    "cms_collections",
    "cms_collection_assets",
    "cms_component_templates",
    "cms_pages",
    "cms_page_sections",
    "cms_section_components",
    "cms_activity_log",
    "cms_navigation_menus",
    "cms_global_settings",
]

today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
generated_at = datetime.now(timezone.utc).isoformat()

OUT_DIR = Path("docs/db/learn-course-d1-context")
OUT_DIR.mkdir(parents=True, exist_ok=True)

BASE = f"{today}_learn-course-schema"
OUT_MD = OUT_DIR / f"{BASE}.context.md"
OUT_AUTORAG = OUT_DIR / f"{BASE}.autorag.md"
OUT_JSON = OUT_DIR / f"{BASE}.json"
OUT_SQL = OUT_DIR / f"{BASE}-create-tables.sql"


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
            f"COMMAND:\n{' '.join(cmd)}\n\n"
            f"STDOUT:\n{result.stdout}\n\n"
            f"STDERR:\n{result.stderr}"
        )

    return result.stdout


def parse_wrangler_json(raw: str) -> list[dict]:
    data = json.loads(raw)
    if isinstance(data, list) and data:
        return data[0].get("results", []) or []
    if isinstance(data, dict):
        return data.get("results", []) or []
    return []


def like_where_clause(alias: str = "name") -> str:
    return " OR ".join(f"{alias} LIKE '{pattern}'" for pattern in TABLE_PATTERNS)


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
    return parse_wrangler_json(run_wrangler_sql(f'PRAGMA table_info("{table_name}");'))


def get_indexes(table_name: str) -> list[dict]:
    indexes = parse_wrangler_json(run_wrangler_sql(f'PRAGMA index_list("{table_name}");'))
    for idx in indexes:
        idx_name = idx.get("name")
        if not idx_name:
            idx["columns"] = []
            continue
        idx["columns"] = parse_wrangler_json(run_wrangler_sql(f'PRAGMA index_info("{idx_name}");'))
    return indexes


def get_count(table_name: str) -> int | None:
    try:
        rows = parse_wrangler_json(run_wrangler_sql(f'SELECT COUNT(*) AS row_count FROM "{table_name}";'))
        return rows[0].get("row_count") if rows else None
    except Exception:
        return None


def compact_columns(columns: list[dict]) -> str:
    parts = []
    for c in columns:
        name = c.get("name")
        typ = c.get("type") or "ANY"
        pk = " PK" if c.get("pk") else ""
        nn = " NOT NULL" if c.get("notnull") else ""
        default = c.get("dflt_value")
        df = f" DEFAULT {default}" if default is not None else ""
        parts.append(f"{name} {typ}{pk}{nn}{df}".strip())
    return ", ".join(parts)


def table_tags(name: str) -> list[str]:
    tags = ["d1", "schema", "inneranimalmedia"]
    if name.startswith("course_") or name == "courses":
        tags += ["learn", "course-platform", "course-domain"]
    if "lesson" in name:
        tags += ["lessons", "course-content"]
    if "user" in name or "enroll" in name:
        tags += ["users", "enrollment", "auth-context"]
    if name.startswith("cms_"):
        tags += ["cms", "cms-support"]
    if name in {"cms_themes", "cms_theme_preferences"}:
        tags += ["theme", "tokens"]
    if name in {"cms_assets", "cms_collections", "cms_collection_assets"}:
        tags += ["assets", "r2-resources"]
    if name in {"cms_component_templates", "cms_section_components", "cms_page_sections", "cms_pages"}:
        tags += ["templates", "layout", "sections"]
    if name == "cms_activity_log":
        tags += ["activity-log", "analytics"]
    return sorted(set(tags))


def main() -> None:
    tables = []
    for t in get_tables():
        name = t["name"]
        columns = get_columns(name)
        indexes = get_indexes(name)
        count = get_count(name)
        tables.append({
            "name": name,
            "row_count": count,
            "tags": table_tags(name),
            "compact_columns": compact_columns(columns),
            "columns": columns,
            "indexes": indexes,
            "create_sql": t.get("sql"),
        })

    payload = {
        "doc_type": "d1_schema_context",
        "scope": "learn-course-platform-cms-support",
        "database": DB_NAME,
        "generated_at": generated_at,
        "date": today,
        "patterns": TABLE_PATTERNS,
        "usage": {
            "primary_consumer": "Cursor",
            "purpose": "Prevent D1 query mistakes for /dashboard/learn, course CRUD, enrollment/progress/submissions/grades, and CMS-aware resource/theme integration.",
            "rule": "Do not invent columns. If a column is not in this file, do not query it."
        },
        "tables": tables,
    }

    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

    OUT_SQL.write_text(
        "\n\n".join(
            f"-- table: {t['name']}\n-- tags: {', '.join(t['tags'])}\n{t.get('create_sql') or '-- no create SQL'};"
            for t in tables
        ) + "\n"
    )

    # Human/Cursor readable context.
    md = []
    md.append("---")
    md.append("doc_type: d1_schema_context")
    md.append("scope: learn-course-platform-cms-support")
    md.append(f"database: {DB_NAME}")
    md.append(f"generated_at: {generated_at}")
    md.append(f"date: {today}")
    md.append("consumer: cursor")
    md.append("autorag_ready: true")
    md.append("tags:")
    md.append("  - d1")
    md.append("  - schema")
    md.append("  - learn")
    md.append("  - course-platform")
    md.append("  - cms-support")
    md.append("---")
    md.append("")
    md.append("# Learn/Course D1 Schema Context")
    md.append("")
    md.append("## Cursor rules")
    md.append("")
    md.append("- Use this file as the source of truth before writing `/api/learn/*` SQL.")
    md.append("- Do not invent columns like `e.tenant_id` unless the table below actually has that column.")
    md.append("- Do not add migrations just to satisfy guessed queries unless explicitly approved.")
    md.append("- Prefer patching API queries to match real schema.")
    md.append("- Keep `course_*` as learning domain data and `cms_*` as theme/assets/templates/activity support.")
    md.append("")
    md.append("## Matched table patterns")
    md.append("")
    for p in TABLE_PATTERNS:
        md.append(f"- `{p}`")
    md.append("")
    md.append("## Table index")
    md.append("")
    for t in tables:
        md.append(f"- `{t['name']}` — rows: `{t['row_count']}` — tags: `{', '.join(t['tags'])}`")
    md.append("")

    for t in tables:
        md.append(f"## Table: `{t['name']}`")
        md.append("")
        md.append(f"Meta: `table={t['name']}` `rows={t['row_count']}` `tags={','.join(t['tags'])}`")
        md.append("")
        md.append("### Compact columns")
        md.append("")
        md.append("```txt")
        md.append(t["compact_columns"])
        md.append("```")
        md.append("")
        md.append("### Columns")
        md.append("")
        md.append("| order | name | type | not_null | default | pk |")
        md.append("|---:|---|---|---:|---|---:|")
        for c in t["columns"]:
            md.append(
                f"| {c.get('cid')} | `{c.get('name')}` | `{c.get('type') or ''}` | "
                f"{c.get('notnull')} | `{c.get('dflt_value')}` | {c.get('pk')} |"
            )
        md.append("")
        if t["indexes"]:
            md.append("### Indexes")
            md.append("")
            md.append("| name | unique | origin | partial | columns |")
            md.append("|---|---:|---|---:|---|")
            for idx in t["indexes"]:
                cols = ", ".join(
                    str(col.get("name"))
                    for col in idx.get("columns", [])
                    if col.get("name") is not None
                )
                md.append(
                    f"| `{idx.get('name')}` | {idx.get('unique')} | `{idx.get('origin')}` | "
                    f"{idx.get('partial')} | `{cols}` |"
                )
            md.append("")
        md.append("### Create SQL")
        md.append("")
        md.append("```sql")
        md.append(t.get("create_sql") or "-- no create SQL")
        md.append("```")
        md.append("")

    OUT_MD.write_text("\n".join(md) + "\n")

    # AutoRAG/chunk-optimized version: repeated metadata per table.
    ar = []
    ar.append("---")
    ar.append("doc_type: autorag_schema_context")
    ar.append("scope: learn-course-platform-cms-support")
    ar.append(f"database: {DB_NAME}")
    ar.append(f"generated_at: {generated_at}")
    ar.append(f"date: {today}")
    ar.append("chunking_strategy: one-table-per-section")
    ar.append("tags: [d1, schema, learn, course-platform, cms-support, cursor-context]")
    ar.append("---")
    ar.append("")
    ar.append("# AutoRAG Schema Context: Learn/Course Platform")
    ar.append("")
    ar.append("This document is optimized for retrieval. Each table section repeats scope, tags, table name, row count, compact columns, and CREATE SQL.")
    ar.append("")
    for t in tables:
        ar.append(f"<!-- chunk:table name={t['name']} scope=learn-course-platform-cms-support tags={','.join(t['tags'])} generated_at={generated_at} -->")
        ar.append("")
        ar.append(f"## schema.table.{t['name']}")
        ar.append("")
        ar.append(f"table_name: `{t['name']}`")
        ar.append(f"database: `{DB_NAME}`")
        ar.append("scope: `learn-course-platform-cms-support`")
        ar.append(f"row_count: `{t['row_count']}`")
        ar.append(f"tags: `{', '.join(t['tags'])}`")
        ar.append("")
        ar.append("retrieval_summary:")
        ar.append(f"- Use table `{t['name']}` only with the columns listed below.")
        ar.append("- Do not guess tenant/workspace/org columns unless they appear here.")
        ar.append("- For `/api/learn/*`, prefer exact course/user/enrollment/progress/submission/grade columns from this context.")
        ar.append("")
        ar.append("compact_columns:")
        ar.append("```txt")
        ar.append(t["compact_columns"])
        ar.append("```")
        ar.append("")
        ar.append("create_sql:")
        ar.append("```sql")
        ar.append(t.get("create_sql") or "-- no create SQL")
        ar.append("```")
        ar.append("")
        ar.append("columns_json:")
        ar.append("```json")
        ar.append(json.dumps(t["columns"], indent=2, ensure_ascii=False))
        ar.append("```")
        ar.append("")
        ar.append("<!-- /chunk:table -->")
        ar.append("")

    OUT_AUTORAG.write_text("\n".join(ar) + "\n")

    print(f"Wrote {OUT_MD}")
    print(f"Wrote {OUT_AUTORAG}")
    print(f"Wrote {OUT_JSON}")
    print(f"Wrote {OUT_SQL}")
    print("")
    print("Matched tables:")
    for t in tables:
        print(f"- {t['name']} ({t['row_count']} rows)")


if __name__ == "__main__":
    main()
