from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Any


DEFAULT_SCHEMAS = [
    "public",
    "agentsam",
    "storage",
    "auth",
    "realtime",
    "cron",
    "vault",
    "supabase_functions",
    "supabase_migrations",
    "net",
    "extensions",
]


AUDIT_SQL: dict[str, str] = {
    "00_database_identity": """
        select
          current_database() as database_name,
          current_user as current_user,
          version() as postgres_version,
          now() as inspected_at;
    """,

    "01_schema_inventory": """
        select
          n.nspname as schema_name,
          pg_catalog.pg_get_userbyid(n.nspowner) as owner
        from pg_namespace n
        where n.nspname not like 'pg_toast%'
          and n.nspname not in ('pg_catalog', 'information_schema')
        order by n.nspname;
    """,

    "02_table_inventory": """
        select
          c.table_schema,
          c.table_name,
          c.table_type,
          obj_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, 'pg_class') as comment
        from information_schema.tables c
        where c.table_schema not in ('pg_catalog', 'information_schema')
          and c.table_schema not like 'pg_toast%'
        order by c.table_schema, c.table_name;
    """,

    "03_column_inventory": """
        select
          c.table_schema,
          c.table_name,
          c.ordinal_position,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.datetime_precision,
          col_description((quote_ident(c.table_schema)||'.'||quote_ident(c.table_name))::regclass, c.ordinal_position) as comment
        from information_schema.columns c
        where c.table_schema not in ('pg_catalog', 'information_schema')
          and c.table_schema not like 'pg_toast%'
        order by c.table_schema, c.table_name, c.ordinal_position;
    """,

    "04_primary_keys": """
        select
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        where tc.constraint_type = 'PRIMARY KEY'
          and tc.table_schema not in ('pg_catalog', 'information_schema')
        group by tc.table_schema, tc.table_name, tc.constraint_name
        order by tc.table_schema, tc.table_name;
    """,

    "05_foreign_keys": """
        select
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as fk_columns,
          ccu.table_schema as referenced_schema,
          ccu.table_name as referenced_table,
          string_agg(ccu.column_name, ', ' order by kcu.ordinal_position) as referenced_columns,
          rc.update_rule,
          rc.delete_rule
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
         and ccu.constraint_schema = tc.constraint_schema
        join information_schema.referential_constraints rc
          on rc.constraint_name = tc.constraint_name
         and rc.constraint_schema = tc.constraint_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema not in ('pg_catalog', 'information_schema')
        group by
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          ccu.table_schema,
          ccu.table_name,
          rc.update_rule,
          rc.delete_rule
        order by tc.table_schema, tc.table_name, tc.constraint_name;
    """,

    "06_unique_constraints": """
        select
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        where tc.constraint_type = 'UNIQUE'
          and tc.table_schema not in ('pg_catalog', 'information_schema')
        group by tc.table_schema, tc.table_name, tc.constraint_name
        order by tc.table_schema, tc.table_name, tc.constraint_name;
    """,

    "07_check_constraints": """
        select
          tc.table_schema,
          tc.table_name,
          tc.constraint_name,
          cc.check_clause
        from information_schema.table_constraints tc
        join information_schema.check_constraints cc
          on tc.constraint_name = cc.constraint_name
         and tc.constraint_schema = cc.constraint_schema
        where tc.constraint_type = 'CHECK'
          and tc.table_schema not in ('pg_catalog', 'information_schema')
        order by tc.table_schema, tc.table_name, tc.constraint_name;
    """,

    "08_indexes": """
        select
          schemaname as table_schema,
          tablename as table_name,
          indexname,
          indexdef
        from pg_indexes
        where schemaname not in ('pg_catalog', 'information_schema')
          and schemaname not like 'pg_toast%'
        order by schemaname, tablename, indexname;
    """,

    "09_rls_tables": """
        select
          n.nspname as table_schema,
          c.relname as table_name,
          c.relrowsecurity as rls_enabled,
          c.relforcerowsecurity as rls_forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p')
          and n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg_toast%'
        order by n.nspname, c.relname;
    """,

    "10_rls_policies": """
        select
          schemaname as table_schema,
          tablename as table_name,
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        from pg_policies
        where schemaname not in ('pg_catalog', 'information_schema')
        order by schemaname, tablename, policyname;
    """,

    "11_views": """
        select
          table_schema,
          table_name,
          view_definition
        from information_schema.views
        where table_schema not in ('pg_catalog', 'information_schema')
        order by table_schema, table_name;
    """,

    "12_functions": """
        select
          n.nspname as function_schema,
          p.proname as function_name,
          pg_get_function_identity_arguments(p.oid) as arguments,
          pg_get_function_result(p.oid) as returns,
          l.lanname as language,
          p.provolatile as volatility,
          p.prosecdef as security_definer
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_language l on l.oid = p.prolang
        where n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg_toast%'
        order by n.nspname, p.proname, arguments;
    """,

    "13_triggers": """
        select
          event_object_schema as table_schema,
          event_object_table as table_name,
          trigger_name,
          event_manipulation,
          action_timing,
          action_statement
        from information_schema.triggers
        where trigger_schema not in ('pg_catalog', 'information_schema')
        order by event_object_schema, event_object_table, trigger_name;
    """,

    "14_extensions": """
        select
          e.extname as extension_name,
          n.nspname as schema_name,
          e.extversion as version
        from pg_extension e
        join pg_namespace n on n.oid = e.extnamespace
        order by e.extname;
    """,

    "15_table_sizes": """
        select
          n.nspname as table_schema,
          c.relname as table_name,
          c.reltuples::bigint as estimated_rows,
          pg_total_relation_size(c.oid) as total_bytes,
          pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
          pg_size_pretty(pg_relation_size(c.oid)) as table_size,
          pg_size_pretty(pg_indexes_size(c.oid)) as indexes_size
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p')
          and n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg_toast%'
        order by pg_total_relation_size(c.oid) desc;
    """,

    "16_missing_primary_keys": """
        select
          n.nspname as table_schema,
          c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p')
          and n.nspname not in ('pg_catalog', 'information_schema')
          and n.nspname not like 'pg_toast%'
          and not exists (
            select 1
            from pg_index i
            where i.indrelid = c.oid
              and i.indisprimary
          )
        order by n.nspname, c.relname;
    """,

    "17_fk_columns_missing_indexes": """
        with fk_cols as (
          select
            con.conrelid,
            n.nspname as table_schema,
            c.relname as table_name,
            con.conname as constraint_name,
            con.conkey as fk_attnums
          from pg_constraint con
          join pg_class c on c.oid = con.conrelid
          join pg_namespace n on n.oid = c.relnamespace
          where con.contype = 'f'
            and n.nspname not in ('pg_catalog', 'information_schema')
        ),
        indexed as (
          select
            i.indrelid,
            i.indkey::smallint[] as index_attnums
          from pg_index i
        )
        select
          fk.table_schema,
          fk.table_name,
          fk.constraint_name,
          array_to_string(array(
            select a.attname
            from unnest(fk.fk_attnums) as u(attnum)
            join pg_attribute a
              on a.attrelid = fk.conrelid
             and a.attnum = u.attnum
            order by array_position(fk.fk_attnums, u.attnum)
          ), ', ') as fk_columns
        from fk_cols fk
        where not exists (
          select 1
          from indexed i
          where i.indrelid = fk.conrelid
            and i.index_attnums[1:array_length(fk.fk_attnums, 1)] = fk.fk_attnums
        )
        order by fk.table_schema, fk.table_name, fk.constraint_name;
    """,

    "18_public_tables_without_rls": """
        select
          n.nspname as table_schema,
          c.relname as table_name
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p')
          and n.nspname = 'public'
          and c.relrowsecurity is false
        order by c.relname;
    """,

    "19_json_columns": """
        select
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default
        from information_schema.columns c
        where c.table_schema not in ('pg_catalog', 'information_schema')
          and c.data_type in ('json', 'jsonb')
        order by c.table_schema, c.table_name, c.ordinal_position;
    """,

    "20_timestamp_columns": """
        select
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default
        from information_schema.columns c
        where c.table_schema not in ('pg_catalog', 'information_schema')
          and (
            c.column_name in ('created_at', 'updated_at', 'deleted_at', 'completed_at', 'started_at')
            or c.data_type like 'timestamp%'
          )
        order by c.table_schema, c.table_name, c.ordinal_position;
    """,

    "21_possible_tenant_scope_columns": """
        select
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default
        from information_schema.columns c
        where c.table_schema not in ('pg_catalog', 'information_schema')
          and c.column_name in (
            'tenant_id',
            'workspace_id',
            'user_id',
            'organization_id',
            'project_id',
            'agent_id',
            'session_id'
          )
        order by c.table_schema, c.table_name, c.ordinal_position;
    """,

    "22_migrations": """
        select *
        from supabase_migrations.schema_migrations
        order by version;
    """,
}


def now_run_id() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def ensure_psql() -> str:
    psql = shutil.which("psql")
    if not psql:
        alt_path = "/opt/homebrew/opt/libpq/bin/psql"
        if os.path.exists(alt_path) and os.access(alt_path, os.X_OK):
            psql = alt_path
    if not psql:
        raise SystemExit(
            "psql was not found. Install PostgreSQL client tools, then rerun. "
            "On macOS: brew install libpq && brew link --force libpq"
        )
    return psql


def run_psql_json(database_url: str, sql: str, env: dict[str, str] | None = None) -> list[dict[str, Any]]:
    psql = ensure_psql()
    wrapped = f"""
    with q as (
      {sql.strip().rstrip(";")}
    )
    select coalesce(json_agg(q), '[]'::json) from q;
    """
    cmd = [
        psql,
        database_url,
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-t",
        "-A",
        "-c",
        wrapped,
    ]
    
    run_env = os.environ.copy()
    if env:
        run_env.update(env)

    proc = subprocess.run(cmd, text=True, capture_output=True, env=run_env)
    if proc.returncode != 0:
        raise RuntimeError(
            "psql query failed\n\n"
            f"STDOUT:\n{proc.stdout}\n\n"
            f"STDERR:\n{proc.stderr}\n\n"
            f"SQL:\n{sql}"
        )
    raw = proc.stdout.strip()
    if not raw:
        return []
    return json.loads(raw)


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, default=str) + "\n", encoding="utf-8")


def md_table(rows: list[dict[str, Any]], max_rows: int | None = None) -> str:
    if not rows:
        return "_No rows._\n"

    clipped = rows if max_rows is None else rows[:max_rows]
    keys: list[str] = []
    for row in clipped:
        for key in row.keys():
            if key not in keys:
                keys.append(key)

    def clean(value: Any) -> str:
        if value is None:
            return ""
        text = str(value)
        text = text.replace("\n", " ").replace("|", "\\|")
        if len(text) > 240:
            text = text[:237] + "..."
        return text

    lines = []
    lines.append("| " + " | ".join(keys) + " |")
    lines.append("| " + " | ".join(["---"] * len(keys)) + " |")
    for row in clipped:
        lines.append("| " + " | ".join(clean(row.get(key)) for key in keys) + " |")

    if max_rows is not None and len(rows) > max_rows:
        lines.append("")
        lines.append(f"_Showing {max_rows} of {len(rows)} rows._")

    return "\n".join(lines) + "\n"


def write_markdown_report(path: Path, title: str, rows: list[dict[str, Any]], max_rows: int = 250) -> None:
    body = [
        f"# {title}",
        "",
        f"Rows: **{len(rows)}**",
        "",
        md_table(rows, max_rows=max_rows),
    ]
    path.write_text("\n".join(body), encoding="utf-8")


def group_rows(rows: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        group = str(row.get(key) or "_unknown")
        out.setdefault(group, []).append(row)
    return out


def build_table_detail_chunks(out_dir: Path, data: dict[str, list[dict[str, Any]]]) -> None:
    tables = data.get("02_table_inventory", [])
    columns = data.get("03_column_inventory", [])
    pks = data.get("04_primary_keys", [])
    fks = data.get("05_foreign_keys", [])
    uniques = data.get("06_unique_constraints", [])
    checks = data.get("07_check_constraints", [])
    indexes = data.get("08_indexes", [])
    rls = data.get("09_rls_tables", [])
    policies = data.get("10_rls_policies", [])
    sizes = data.get("15_table_sizes", [])

    chunk_dir = out_dir / "table_chunks"
    chunk_dir.mkdir(parents=True, exist_ok=True)

    def match(rows: list[dict[str, Any]], schema: str, table: str) -> list[dict[str, Any]]:
        return [
            row
            for row in rows
            if row.get("table_schema") == schema and row.get("table_name") == table
        ]

    index_lines = ["# Table Chunk Index", ""]

    for table_row in tables:
        schema = str(table_row.get("table_schema"))
        table = str(table_row.get("table_name"))
        safe_name = f"{schema}.{table}".replace("/", "_")
        filename = f"{safe_name}.md"
        index_lines.append(f"- [{schema}.{table}](table_chunks/{filename})")

        sections = [
            f"# {schema}.{table}",
            "",
            "## Table",
            "",
            md_table([table_row]),
            "## Size",
            "",
            md_table(match(sizes, schema, table)),
            "## Columns",
            "",
            md_table(match(columns, schema, table), max_rows=None),
            "## Primary keys",
            "",
            md_table(match(pks, schema, table), max_rows=None),
            "## Foreign keys",
            "",
            md_table(match(fks, schema, table), max_rows=None),
            "## Unique constraints",
            "",
            md_table(match(uniques, schema, table), max_rows=None),
            "## Check constraints",
            "",
            md_table(match(checks, schema, table), max_rows=None),
            "## Indexes",
            "",
            md_table(match(indexes, schema, table), max_rows=None),
            "## RLS",
            "",
            md_table(match(rls, schema, table), max_rows=None),
            "## Policies",
            "",
            md_table(match(policies, schema, table), max_rows=None),
        ]

        (chunk_dir / filename).write_text("\n".join(sections), encoding="utf-8")

    (out_dir / "TABLE_CHUNKS_INDEX.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")


def build_findings(data: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    for row in data.get("16_missing_primary_keys", []):
        schema = row.get("table_schema")
        table = row.get("table_name")
        findings.append(
            {
                "severity": "warning",
                "category": "schema_integrity",
                "object": f"{schema}.{table}",
                "finding": "Table has no primary key.",
                "suggested_next_step": "Verify whether this is intentional. For app-owned tables, add a stable primary key unless this is a queue/log/foreign table pattern.",
            }
        )

    for row in data.get("17_fk_columns_missing_indexes", []):
        schema = row.get("table_schema")
        table = row.get("table_name")
        constraint = row.get("constraint_name")
        cols = row.get("fk_columns")
        findings.append(
            {
                "severity": "warning",
                "category": "performance",
                "object": f"{schema}.{table}.{constraint}",
                "finding": f"Foreign key columns may not have a leading index: {cols}",
                "suggested_next_step": "Add an index on FK columns if the table is queried, joined, or deleted through the relationship.",
            }
        )

    for row in data.get("18_public_tables_without_rls", []):
        schema = row.get("table_schema")
        table = row.get("table_name")
        findings.append(
            {
                "severity": "critical",
                "category": "security",
                "object": f"{schema}.{table}",
                "finding": "Public table has RLS disabled.",
                "suggested_next_step": "Enable RLS and add explicit policies, unless this table is intentionally server-only and inaccessible from exposed clients.",
            }
        )

    for row in data.get("21_possible_tenant_scope_columns", []):
        default = row.get("column_default")
        if default and "tenant_" in str(default):
            findings.append(
                {
                    "severity": "warning",
                    "category": "multi_tenant_safety",
                    "object": f"{row.get('table_schema')}.{row.get('table_name')}.{row.get('column_name')}",
                    "finding": f"Scope column has a default that may hardcode tenant/workspace behavior: {default}",
                    "suggested_next_step": "Verify this is not a hardcoded tenant/workspace/project default. Prefer explicit app-level scoping.",
                }
            )

    return findings


def build_summary(out_dir: Path, data: dict[str, list[dict[str, Any]]], findings: list[dict[str, Any]]) -> None:
    table_rows = data.get("02_table_inventory", [])
    columns = data.get("03_column_inventory", [])
    indexes = data.get("08_indexes", [])
    policies = data.get("10_rls_policies", [])
    functions = data.get("12_functions", [])
    sizes = data.get("15_table_sizes", [])

    by_schema = group_rows(table_rows, "table_schema")

    largest = sizes[:20]
    critical = [f for f in findings if f["severity"] == "critical"]
    warnings = [f for f in findings if f["severity"] == "warning"]

    lines = [
        "# Supabase Schema Audit Summary",
        "",
        f"Generated: `{dt.datetime.now(dt.UTC).isoformat()}`",
        "",
        "## Counts",
        "",
        f"- Schemas with objects: **{len(by_schema)}**",
        f"- Tables/views/foreign tables found: **{len(table_rows)}**",
        f"- Columns found: **{len(columns)}**",
        f"- Indexes found: **{len(indexes)}**",
        f"- RLS policies found: **{len(policies)}**",
        f"- Functions found: **{len(functions)}**",
        f"- Critical findings: **{len(critical)}**",
        f"- Warning findings: **{len(warnings)}**",
        "",
        "## Objects by schema",
        "",
    ]

    schema_counts = [
        {"schema": schema, "objects": len(rows)}
        for schema, rows in sorted(by_schema.items())
    ]
    lines.append(md_table(schema_counts, max_rows=None))

    lines.extend(
        [
            "",
            "## Largest relations",
            "",
            md_table(largest, max_rows=20),
            "",
            "## Findings",
            "",
            md_table(findings, max_rows=250),
            "",
            "## Report map",
            "",
            "- `json/` raw machine-readable outputs, one file per query",
            "- `reports/` markdown reports, one file per query",
            "- `table_chunks/` one markdown chunk per table/view",
            "- `TABLE_CHUNKS_INDEX.md` index of table-specific chunks",
            "- `manifest.json` run metadata and file hashes",
            "",
        ]
    )

    (out_dir / "SUMMARY.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Chunked Supabase/Postgres schema audit. Read-only."
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL"),
        help="Supabase/Postgres connection string. Defaults to SUPABASE_DB_URL or DATABASE_URL.",
    )
    parser.add_argument(
        "--out",
        default="artifacts/supabase_schema_audit",
        help="Output directory root.",
    )
    parser.add_argument(
        "--run-id",
        default=now_run_id(),
        help="Run id used for output folder.",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="Only run the preflight check, then exit.",
    )
    parser.add_argument(
        "--no-write-on-error",
        action="store_true",
        help="Do not create the output directory or reports if preflight fails.",
    )
    args = parser.parse_args()

    if not args.database_url:
        print(
            "Missing database URL. Set SUPABASE_DB_URL or pass --database-url.",
            file=sys.stderr,
        )
        return 2

    pg_password = os.getenv("PGPASSWORD") or os.getenv("SUPABASE_DB_PASSWORD")
    
    has_url_password = False
    if "://" in args.database_url and "@" in args.database_url:
        user_pass = args.database_url.split("://", 1)[1].split("@", 1)[0]
        if ":" in user_pass:
            has_url_password = True
    elif "password=" in args.database_url:
        has_url_password = True

    if not has_url_password and not pg_password:
        print("Error: No database password found. Please set SUPABASE_DB_PASSWORD or PGPASSWORD, or include it in the URL.", file=sys.stderr)
        return 1

    db_env = os.environ.copy()
    if pg_password:
        db_env["PGPASSWORD"] = pg_password

    # Preflight Check
    try:
        run_psql_json(args.database_url, "select 1 as preflight;", env=db_env)
    except Exception as exc:
        print(f"Preflight connection check failed:\n\n{exc}", file=sys.stderr)
        if not args.no_write_on_error:
            out_dir = Path(args.out) / args.run_id
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "PREFLIGHT_ERROR.md").write_text(f"# Preflight Error\n\n```text\n{exc}\n```\n", encoding="utf-8")
        return 1

    if args.preflight_only:
        print("Preflight check passed.")
        return 0

    out_dir = Path(args.out) / args.run_id
    json_dir = out_dir / "json"
    reports_dir = out_dir / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    all_data: dict[str, list[dict[str, Any]]] = {}
    errors: list[dict[str, str]] = []

    print(f"Writing Supabase schema audit to: {out_dir}")

    for name, sql in AUDIT_SQL.items():
        print(f"Running {name}...")
        try:
            rows = run_psql_json(args.database_url, sql, env=db_env)
            all_data[name] = rows
            write_json(json_dir / f"{name}.json", rows)
            write_markdown_report(
                reports_dir / f"{name}.md",
                title=name.replace("_", " ").title(),
                rows=rows,
            )
        except Exception as exc:
            errors.append({"query": name, "error": str(exc)})
            write_json(json_dir / f"{name}.error.json", {"error": str(exc)})
            (reports_dir / f"{name}.ERROR.md").write_text(
                f"# {name} ERROR\n\n```text\n{exc}\n```\n",
                encoding="utf-8",
            )

    findings = build_findings(all_data)
    write_json(out_dir / "findings.json", findings)
    write_markdown_report(out_dir / "FINDINGS.md", "Findings", findings, max_rows=500)

    build_table_detail_chunks(out_dir, all_data)
    build_summary(out_dir, all_data, findings)

    file_hashes = []
    for path in sorted(out_dir.rglob("*")):
        if path.is_file():
            rel = path.relative_to(out_dir).as_posix()
            file_hashes.append(
                {
                    "path": rel,
                    "sha256": sha256_text(path.read_text(encoding="utf-8", errors="replace")),
                    "bytes": path.stat().st_size,
                }
            )

    manifest = {
        "run_id": args.run_id,
        "generated_at": dt.datetime.now(dt.UTC).isoformat(),
        "output_dir": str(out_dir),
        "queries_attempted": len(AUDIT_SQL),
        "queries_failed": len(errors),
        "errors": errors,
        "files": file_hashes,
    }
    write_json(out_dir / "manifest.json", manifest)

    print("")
    print("Done.")
    print(f"Summary: {out_dir / 'SUMMARY.md'}")
    print(f"Findings: {out_dir / 'FINDINGS.md'}")
    print(f"Table chunks: {out_dir / 'TABLE_CHUNKS_INDEX.md'}")

    if errors:
        print("")
        print(f"Completed with {len(errors)} query errors. See manifest.json and reports/*.ERROR.md.")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())