#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
OUT_DIR = ROOT / "artifacts" / "audit"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DB_NAME = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
REMOTE = os.getenv("IAM_D1_REMOTE", "1") != "0"

REPORT_JSON = OUT_DIR / "python-architect-skill-table-refs-report.json"
REPORT_MD = OUT_DIR / "python-architect-skill-table-refs-report.md"

TABLE_REFS = [
    "agentsam_command_run",
    "agentsam_command_runs",
    "agentsam_executions",
    "agentsam_execution_steps",
    "agentsam_workflow_runs",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_approval_queue",
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_artifacts",
]

SHORTHANDS = {
    "plan_tasks": "agentsam_plan_tasks",
    "execution_steps": "agentsam_execution_steps",
    "approval_queue": "agentsam_approval_queue",
}

EXPECTED_COLUMNS = {
    "agentsam_command_run": [
        "id",
        "tenant_id",
        "workspace_id",
        "user_id",
        "approval_id",
        "approval_status",
        "command_id",
        "status",
        "created_at",
    ],
    "agentsam_approval_queue": [
        "id",
        "tenant_id",
        "workspace_id",
        "user_id",
        "command_run_id",
        "execution_step_id",
        "status",
        "expires_at",
        "created_at",
    ],
    "agentsam_execution_steps": [
        "id",
        "execution_id",
        "approval_id",
        "workflow_run_id",
        "command_run_id",
        "output_json",
        "status",
    ],
    "agentsam_workflow_runs": [
        "id",
        "workflow_id",
        "workflow_key",
        "status",
        "created_at",
    ],
    "agentsam_plans": [
        "id",
        "workflow_run_id",
        "created_at",
    ],
    "agentsam_plan_tasks": [
        "id",
        "plan_id",
        "workflow_run_id",
        "execution_step_id",
        "command_run_id",
        "files_involved",
        "created_at",
    ],
    "agentsam_workflows": [
        "id",
        "workflow_key",
    ],
    "agentsam_artifacts": [
        "id",
        "tenant_id",
        "workspace_id",
        "name",
        "artifact_type",
        "r2_key",
        "public_url",
        "created_at",
    ],
}


def run(cmd: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    print("+ " + " ".join(shlex.quote(part) for part in cmd), file=sys.stderr)
    return subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def extract_json_payload(stdout: str) -> Any:
    text = stdout.strip()
    if not text:
        raise ValueError("empty stdout")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Defensive fallback if Wrangler adds wrapper text.
    match = re.search(r"(\[\s*\{.*\}\s*\])", text, flags=re.DOTALL)
    if match:
        return json.loads(match.group(1))

    raise ValueError("could not parse JSON from Wrangler stdout")


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

    proc = run(cmd)
    payload = extract_json_payload(proc.stdout)

    rows: list[dict[str, Any]] = []
    if isinstance(payload, list):
        for block in payload:
            if isinstance(block, dict) and isinstance(block.get("results"), list):
                rows.extend(block["results"])
    return rows


def quote_sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def main() -> int:
    print("[1/6] Checking D1 table existence...")

    table_list_sql = f"""
SELECT
  name,
  type,
  sql
FROM sqlite_master
WHERE type IN ('table','view')
  AND name IN ({", ".join(quote_sql(t) for t in TABLE_REFS)})
ORDER BY name;
"""
    found_objects = d1_json(table_list_sql)
    found_by_name = {str(row["name"]): row for row in found_objects}

    print("[2/6] Inspecting schemas with PRAGMA table_info...")
    table_reports: dict[str, Any] = {}

    for table in TABLE_REFS:
        exists = table in found_by_name
        table_report: dict[str, Any] = {
            "table": table,
            "exists": exists,
            "type": found_by_name.get(table, {}).get("type"),
            "columns": [],
            "missing_expected_columns": [],
            "row_count": None,
            "notes": [],
        }

        if exists:
            cols = d1_json(f"PRAGMA table_info({ident(table)});")
            col_names = [str(col.get("name")) for col in cols]
            table_report["columns"] = cols

            expected = EXPECTED_COLUMNS.get(table, [])
            missing_expected = [col for col in expected if col not in col_names]
            table_report["missing_expected_columns"] = missing_expected

            try:
                count_rows = d1_json(f"SELECT COUNT(*) AS row_count FROM {ident(table)};")
                table_report["row_count"] = count_rows[0].get("row_count") if count_rows else None
            except Exception as exc:
                table_report["notes"].append(f"Could not count rows: {exc}")

        table_reports[table] = table_report

    print("[3/6] Checking foreign-key relationships where relevant...")
    fk_reports: dict[str, Any] = {}
    for table in [
        "agentsam_execution_steps",
        "agentsam_plan_tasks",
        "agentsam_approval_queue",
        "agentsam_workflow_runs",
        "agentsam_plans",
    ]:
        if table in found_by_name:
            try:
                fk_reports[table] = d1_json(f"PRAGMA foreign_key_list({ident(table)});")
            except Exception as exc:
                fk_reports[table] = [{"error": str(exc)}]

    print("[4/6] Checking specific instruction claims...")
    claims: list[dict[str, Any]] = []

    def add_claim(claim: str, status: str, evidence: Any) -> None:
        claims.append({"claim": claim, "status": status, "evidence": evidence})

    add_claim(
        "Production table is agentsam_command_run, not agentsam_command_runs.",
        "PASS" if table_reports["agentsam_command_run"]["exists"] and not table_reports["agentsam_command_runs"]["exists"] else "CHECK",
        {
            "agentsam_command_run_exists": table_reports["agentsam_command_run"]["exists"],
            "agentsam_command_runs_exists": table_reports["agentsam_command_runs"]["exists"],
        },
    )

    exec_cols = [c.get("name") for c in table_reports.get("agentsam_execution_steps", {}).get("columns", [])]
    add_claim(
        "agentsam_execution_steps has execution_id for workflow-run linkage.",
        "PASS" if "execution_id" in exec_cols else "FAIL",
        {"agentsam_execution_steps_columns": exec_cols},
    )

    approval_cols = [c.get("name") for c in table_reports.get("agentsam_approval_queue", {}).get("columns", [])]
    add_claim(
        "agentsam_approval_queue can link command_run_id and execution_step_id.",
        "PASS" if "command_run_id" in approval_cols and "execution_step_id" in approval_cols else "FAIL",
        {"agentsam_approval_queue_columns": approval_cols},
    )

    plan_task_cols = [c.get("name") for c in table_reports.get("agentsam_plan_tasks", {}).get("columns", [])]
    add_claim(
        "agentsam_plan_tasks can link workflow_run_id and execution_step_id.",
        "PASS" if "workflow_run_id" in plan_task_cols and "execution_step_id" in plan_task_cols else "FAIL",
        {"agentsam_plan_tasks_columns": plan_task_cols},
    )

    artifact_cols = [c.get("name") for c in table_reports.get("agentsam_artifacts", {}).get("columns", [])]
    add_claim(
        "agentsam_artifacts exists for artifact mapping.",
        "PASS" if table_reports["agentsam_artifacts"]["exists"] else "FAIL",
        {"agentsam_artifacts_columns": artifact_cols},
    )

    print("[5/6] Building report...")
    report = {
        "db_name": DB_NAME,
        "wrangler_config": WRANGLER_CONFIG,
        "remote": REMOTE,
        "table_refs_from_skill": TABLE_REFS,
        "shorthands_from_skill": SHORTHANDS,
        "table_reports": table_reports,
        "foreign_keys": fk_reports,
        "claims": claims,
    }

    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")

    lines: list[str] = []
    lines.append("# Python Architect Skill Table Reference Audit")
    lines.append("")
    lines.append(f"- DB: `{DB_NAME}`")
    lines.append(f"- Config: `{WRANGLER_CONFIG}`")
    lines.append(f"- Remote: `{REMOTE}`")
    lines.append("")
    lines.append("## Table existence")
    lines.append("")
    lines.append("| Table | Exists | Rows | Missing expected columns |")
    lines.append("|---|---:|---:|---|")
    for table in TABLE_REFS:
        tr = table_reports[table]
        missing = ", ".join(tr["missing_expected_columns"]) if tr["missing_expected_columns"] else ""
        lines.append(f"| `{table}` | {tr['exists']} | {tr['row_count']} | {missing} |")

    lines.append("")
    lines.append("## Claims")
    lines.append("")
    lines.append("| Status | Claim |")
    lines.append("|---|---|")
    for claim in claims:
        lines.append(f"| {claim['status']} | {claim['claim']} |")

    lines.append("")
    lines.append("## Shorthand references")
    lines.append("")
    for short, canonical in SHORTHANDS.items():
        lines.append(f"- `{short}` should be treated as `{canonical}`.")

    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("[6/6] Summary")
    failures = [claim for claim in claims if claim["status"] == "FAIL"]
    checks = [claim for claim in claims if claim["status"] == "CHECK"]

    for table in TABLE_REFS:
        tr = table_reports[table]
        exists = "yes" if tr["exists"] else "NO"
        print(f"- {table}: exists={exists}, rows={tr['row_count']}, missing_expected={tr['missing_expected_columns']}")

    print("")
    print(f"report_json: {REPORT_JSON}")
    print(f"report_md:   {REPORT_MD}")

    if failures:
        print(f"FAIL: {len(failures)} claim(s) failed")
        return 1

    if checks:
        print(f"CHECK: {len(checks)} claim(s) need review")
        return 2

    print("PASS: table references look structurally consistent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
