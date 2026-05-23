#!/usr/bin/env python3
"""
PY1 — Read-only Agent Sam D1 schema inspector.

Inspects relevant Agent Sam webhook/workflow/analytics tables and writes:
- artifacts/db_audits/agentsam_schema_audit_<timestamp>.json
- artifacts/db_audits/agentsam_schema_audit_<timestamp>.md

Safe:
- No DROP
- No ALTER
- No INSERT
- No UPDATE
- No DELETE
"""

import json
import subprocess
import datetime
from pathlib import Path

DB_NAME = "inneranimalmedia-business"
WRANGLER_CONFIG = "wrangler.production.toml"

TABLES = [
    "agentsam_webhooks",
    "agentsam_webhook_events",
    "agentsam_webhook_weekly",
    "agentsam_cron_runs",
    "agentsam_analytics",
    "agentsam_usage_events",
    "agentsam_usage_rollups_daily",
    "agentsam_workflows",
    "agentsam_workflow_runs",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_handlers",
    "agentsam_executions",
    "agentsam_execution_performance_metrics",
    "agentsam_eval_suites",
    "agentsam_eval_runs",
    "agentsam_eval_cases",
    "agentsam_error_log",
    "agentsam_deployment_health",
    "agentsam_agent_run",
    "agentsam_compaction_events",
]

OUT_DIR = Path("artifacts/db_audits")
OUT_DIR.mkdir(parents=True, exist_ok=True)

STAMP = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
JSON_OUT = OUT_DIR / f"agentsam_schema_audit_{STAMP}.json"
MD_OUT = OUT_DIR / f"agentsam_schema_audit_{STAMP}.md"


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def qident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def run_d1(command: str):
    cmd = [
        "npx", "wrangler", "d1", "execute", DB_NAME,
        "--remote",
        "-c", WRANGLER_CONFIG,
        "--json",
        "--command", command,
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True)

    if proc.returncode != 0:
        return {
            "ok": False,
            "command": command,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "data": [],
        }

    try:
        payload = json.loads(proc.stdout)
        rows = []
        for item in payload:
            rows.extend(item.get("results", []))
        return {
            "ok": True,
            "command": command,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "data": rows,
        }
    except Exception as exc:
        return {
            "ok": False,
            "command": command,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "error": str(exc),
            "data": [],
        }


def table_exists(table: str) -> bool:
    res = run_d1(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name = {sql_quote(table)} LIMIT 1;"
    )
    return bool(res["ok"] and res["data"])


def analyze_columns(table: str, cols, idxs, fks):
    flags = []
    names = {c["name"] for c in cols}
    col_by_name = {c["name"]: c for c in cols}

    if "tenant_id" in names:
        c = col_by_name["tenant_id"]
        default = str(c.get("dflt_value")).lower()
        if "tenant_sam_primeaux" in default:
            flags.append("tenant_id_has_user_specific_default")
        if c.get("notnull") == 0 and table not in {"agentsam_workflows"}:
            flags.append("tenant_id_nullable")

    if "workspace_id" in names:
        c = col_by_name["workspace_id"]
        default = str(c.get("dflt_value")).lower()
        if "ws_inneranimalmedia" in default:
            flags.append("workspace_id_has_workspace_specific_default")
        if c.get("notnull") == 0 and table in {
            "agentsam_webhook_events",
            "agentsam_webhook_weekly",
            "agentsam_cron_runs",
        }:
            flags.append("workspace_id_nullable_on_operational_table")

    text_time_cols = [
        n for n in names
        if n.endswith("_at") and col_by_name[n].get("type", "").upper() == "TEXT"
    ]
    unix_time_cols = [
        n for n in names
        if n.endswith("_unix")
        or n.endswith("_epoch")
        or str(col_by_name[n].get("dflt_value")).lower() in {
            "unixepoch()",
            "strftime('%s','now')",
        }
    ]

    if text_time_cols and unix_time_cols:
        flags.append("mixed_text_and_unix_timestamps")

    if table == "agentsam_webhooks":
        forbidden = {
            "last_received_at",
            "total_received",
            "total_processed",
            "total_failed",
            "last_error_at",
            "last_error_message",
            "processed_at",
            "received_at",
        }
        overlap = sorted(forbidden.intersection(names))
        if overlap:
            flags.append(f"registry_table_contains_event_tracking_columns:{','.join(overlap)}")

    if table == "agentsam_webhook_events":
        expected = {
            "tenant_id",
            "workspace_id",
            "endpoint_id",
            "provider",
            "event_type",
            "status",
            "received_at_unix",
        }
        missing = sorted(expected - names)
        if missing:
            flags.append(f"webhook_events_missing_expected_columns:{','.join(missing)}")

    if table == "agentsam_webhook_weekly":
        expected = {
            "tenant_id",
            "workspace_id",
            "endpoint_id",
            "provider",
            "event_type",
            "week_start_unix",
        }
        missing = sorted(expected - names)
        if missing:
            flags.append(f"weekly_rollup_missing_expected_columns:{','.join(missing)}")

        has_unique_rollup_index = any(idx.get("unique") == 1 for idx in idxs)
        if not has_unique_rollup_index:
            flags.append("weekly_rollup_lacks_unique_index_for_upsert")

    if not idxs and table in {
        "agentsam_webhook_events",
        "agentsam_webhook_weekly",
        "agentsam_workflow_runs",
        "agentsam_executions",
        "agentsam_usage_events",
        "agentsam_error_log",
    }:
        flags.append("high_value_table_has_no_visible_indexes")

    if not fks and table in {
        "agentsam_webhook_events",
        "agentsam_webhook_weekly",
        "agentsam_workflow_runs",
        "agentsam_workflow_nodes",
        "agentsam_workflow_edges",
    }:
        flags.append("relationship_table_has_no_foreign_keys")

    return flags


def inspect_table(table: str):
    exists = table_exists(table)

    if not exists:
        return {
            "table": table,
            "exists": False,
            "schema": [],
            "indexes": [],
            "foreign_keys": [],
            "row_count": None,
            "flags": ["missing_table"],
        }

    schema = run_d1(f"PRAGMA table_info({qident(table)});")
    indexes = run_d1(f"PRAGMA index_list({qident(table)});")
    foreign_keys = run_d1(f"PRAGMA foreign_key_list({qident(table)});")
    count = run_d1(f"SELECT COUNT(*) AS row_count FROM {qident(table)};")

    cols = schema["data"] if schema["ok"] else []
    idxs = indexes["data"] if indexes["ok"] else []
    fks = foreign_keys["data"] if foreign_keys["ok"] else []
    row_count = count["data"][0]["row_count"] if count["ok"] and count["data"] else None

    flags = analyze_columns(table, cols, idxs, fks)

    return {
        "table": table,
        "exists": True,
        "schema": cols,
        "indexes": idxs,
        "foreign_keys": fks,
        "row_count": row_count,
        "flags": flags,
    }


def render_md(report):
    lines = []
    lines.append("# Agent Sam D1 Schema Audit")
    lines.append("")
    lines.append(f"Generated UTC: `{report['generated_at_utc']}`")
    lines.append(f"Database: `{DB_NAME}`")
    lines.append(f"Wrangler config: `{WRANGLER_CONFIG}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")

    for table in report["tables"]:
        status = "present" if table["exists"] else "missing"
        flags = ", ".join(table["flags"]) if table["flags"] else "none"
        lines.append(
            f"- `{table['table']}` — {status}; rows: `{table['row_count']}`; flags: `{flags}`"
        )

    lines.append("")
    lines.append("## Details")
    lines.append("")

    for table in report["tables"]:
        lines.append(f"### `{table['table']}`")
        lines.append("")

        if not table["exists"]:
            lines.append("Missing table.")
            lines.append("")
            continue

        lines.append(f"Rows: `{table['row_count']}`")
        lines.append("")

        if table["flags"]:
            lines.append("Flags:")
            for flag in table["flags"]:
                lines.append(f"- `{flag}`")
            lines.append("")

        lines.append("Columns:")
        lines.append("")
        lines.append("| cid | name | type | notnull | default | pk |")
        lines.append("|---:|---|---|---:|---|---:|")
        for c in table["schema"]:
            lines.append(
                f"| {c.get('cid')} | `{c.get('name')}` | `{c.get('type')}` | {c.get('notnull')} | `{c.get('dflt_value')}` | {c.get('pk')} |"
            )
        lines.append("")

        lines.append("Indexes:")
        lines.append("")
        if table["indexes"]:
            lines.append("| name | unique | origin | partial |")
            lines.append("|---|---:|---|---:|")
            for idx in table["indexes"]:
                lines.append(
                    f"| `{idx.get('name')}` | {idx.get('unique')} | `{idx.get('origin')}` | {idx.get('partial')} |"
                )
        else:
            lines.append("_No indexes reported by PRAGMA index_list._")
        lines.append("")

        lines.append("Foreign keys:")
        lines.append("")
        if table["foreign_keys"]:
            lines.append("| id | table | from | to | on_update | on_delete |")
            lines.append("|---:|---|---|---|---|---|")
            for fk in table["foreign_keys"]:
                lines.append(
                    f"| {fk.get('id')} | `{fk.get('table')}` | `{fk.get('from')}` | `{fk.get('to')}` | `{fk.get('on_update')}` | `{fk.get('on_delete')}` |"
                )
        else:
            lines.append("_No foreign keys reported by PRAGMA foreign_key_list._")
        lines.append("")

    lines.append("## Next-step interpretation")
    lines.append("")
    lines.append(
        "Use this report to decide which tables need a Py2 migration plan. Py2 should only rebuild approved tables, create timestamped backups, backfill with explicit column maps, validate counts/checksums, and stop before destructive cleanup."
    )

    return "\n".join(lines)


def main():
    report = {
        "generated_at_utc": datetime.datetime.utcnow().isoformat() + "Z",
        "database": DB_NAME,
        "wrangler_config": WRANGLER_CONFIG,
        "tables": [],
    }

    for table in TABLES:
        print(f"Inspecting {table}...")
        report["tables"].append(inspect_table(table))

    JSON_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    MD_OUT.write_text(render_md(report), encoding="utf-8")

    print("")
    print("Done.")
    print(f"JSON report: {JSON_OUT}")
    print(f"Markdown report: {MD_OUT}")


if __name__ == "__main__":
    main()
