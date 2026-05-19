#!/usr/bin/env python3
"""
build_cursor_minimal_handoff.py

Purpose:
Create a tiny Cursor handoff packet from existing audits + local code search.
No D1 calls. No Supabase calls. No broad repo explanation.

Outputs:
- docs/platform_assessment/CURSOR_MINIMAL_AGENT_SAM_HANDOFF.md

Goal:
Minimize Cursor redundancy by giving it:
1. canonical doctrine
2. exact tables not to reinvent
3. exact files/code patterns to inspect
4. exact P0/P1 tasks
5. exact commands already run
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(".")
TABLE_WALK_JSON = Path("artifacts/agentsam_db_table_walk/LATEST_AGENTSAM_DB_TABLE_WALK.json")
CLOSURE_MD = Path("artifacts/agentsam_db_table_walk/AGENTSAM_DB_CURSOR_CLOSURE_FINDINGS.md")
JOIN_MD = Path("artifacts/agentsam_db_table_walk/AGENTSAM_RUN_SPINE_JOIN_PATHS.md")
ASSESSMENT = Path("docs/platform_assessment/inneranimalmedia_platform_assessment.md")
OUT = Path("docs/platform_assessment/CURSOR_MINIMAL_AGENT_SAM_HANDOFF.md")

TARGET_TABLES = [
    "agentsam_agent_run",
    "agentsam_command_run",
    "agentsam_patch_sessions",
    "agentsam_artifacts",
    "agentsam_execution_steps",
    "agentsam_mcp_tool_execution",
    "agentsam_tool_call_log",
    "agentsam_execution_context",
    "agentsam_error_log",
    "agentsam_usage_events",
    "agentsam_script_runs",
]

SEARCH_PATTERNS = [
    "INSERT INTO agentsam_agent_run",
    "INSERT INTO agentsam_command_run",
    "INSERT INTO agentsam_patch_sessions",
    "INSERT INTO agentsam_artifacts",
    "INSERT INTO agentsam_execution_steps",
    "INSERT INTO agentsam_mcp_tool_execution",
    "INSERT INTO agentsam_tool_call_log",
    "INSERT INTO agentsam_execution_context",
    "INSERT INTO agentsam_error_log",
    "INSERT INTO agentsam_usage_events",
    "INSERT INTO agentsam_script_runs",
    "agentsam_command_run",
    "agentsam_patch_sessions",
    "execute-approved-tool",
    "/api/fs/list",
    "/api/fs/read",
    "/api/fs/write",
]

SEARCH_DIRS = ["src", "dashboard", "scripts", "migrations", "docs"]


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode not in (0, 1):
        return f"[command failed: {' '.join(cmd)}]\nSTDERR:\n{p.stderr[:2000]}"
    return p.stdout.strip()


def rg(pattern: str) -> str:
    existing_dirs = [d for d in SEARCH_DIRS if Path(d).exists()]
    return run(["rg", "-n", pattern, *existing_dirs])


def load_table_data():
    if not TABLE_WALK_JSON.exists():
        return {}, []
    data = json.loads(TABLE_WALK_JSON.read_text())
    objects = data.get("objects", [])
    by_name = {o.get("name"): o for o in objects}
    return data, objects


def colnames(obj):
    if not obj:
        return []
    names = obj.get("column_names")
    if names:
        return names
    return [c.get("name") for c in obj.get("columns", []) if c.get("name")]


def table_summary(by_name):
    rows = []
    for name in TARGET_TABLES:
        o = by_name.get(name)
        if not o:
            rows.append([name, "MISSING", "", "", ""])
            continue
        cols = colnames(o)
        link_cols = [
            c for c in cols
            if c in {
                "id", "source_run_id", "source_id", "ref_id", "ref_table",
                "conversation_id", "session_id", "workflow_id", "workflow_run_id",
                "execution_id", "command_run_id", "chain_root_id", "work_session_id",
                "source_session_id", "source_workflow_id", "source_message_id",
                "tool_chain_id", "trace_id", "span_id", "routing_arm_id",
            }
        ]
        rows.append([
            name,
            o.get("row_count", 0),
            ", ".join(link_cols),
            ", ".join(o.get("quality_flags", [])[:5]),
            ", ".join(cols[:18]),
        ])
    return rows


def md_table(rows, headers):
    out = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        out.append("| " + " | ".join(str(x).replace("|", "\\|").replace("\n", " ") for x in row) + " |")
    return "\n".join(out)


def truncate_block(s: str, limit: int = 12000) -> str:
    if not s:
        return "_No matches._"
    if len(s) <= limit:
        return s
    return s[:limit] + f"\n\n...[truncated {len(s) - limit} chars]"


def main():
    data, objects = load_table_data()
    by_name = {o.get("name"): o for o in objects}

    searches = {}
    for pat in SEARCH_PATTERNS:
        searches[pat] = rg(pat)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    lines = []
    lines.append("# Cursor Minimal Agent Sam Handoff")
    lines.append("")
    lines.append(f"Generated: `{now}`")
    lines.append("")
    lines.append("## Read this first")
    lines.append("")
    lines.append("Cursor budget is low. Do not rediscover architecture. Do not run broad DB audits. Do not create new agentsam_* tables unless this file proves a concept is missing.")
    lines.append("")
    lines.append("## Canonical doctrine")
    lines.append("")
    lines.append("```text")
    lines.append("Canonical run table: agentsam_agent_run")
    lines.append("Canonical run spine: agentsam_agent_run.id")
    lines.append("Runtime/SSE/client label agent_run_id means the same value as agentsam_agent_run.id.")
    lines.append("Do NOT treat agent_run_id as a separate table.")
    lines.append("Do NOT blindly add agent_run_id columns everywhere.")
    lines.append("Make runtime/evidence rows traceable to agentsam_agent_run.id using existing columns where possible.")
    lines.append("```")
    lines.append("")
    lines.append("## Existing audit facts")
    lines.append("")
    if data:
        lines.append(f"- agentsam_* tables: **{data.get('table_count')}**")
        lines.append(f"- agentsam_* rows: **{data.get('total_rows'):,}**")
        lines.append(f"- table walk generated_at: `{data.get('generated_at')}`")
    lines.append(f"- table walk JSON: `{TABLE_WALK_JSON}`")
    lines.append(f"- closure findings: `{CLOSURE_MD}`")
    lines.append(f"- join paths: `{JOIN_MD}`")
    lines.append(f"- platform assessment: `{ASSESSMENT}`")
    lines.append("")
    lines.append("## Target table summary")
    lines.append("")
    lines.append(md_table(
        table_summary(by_name),
        ["Table", "Rows", "Existing link-ish cols", "Flags", "First columns"]
    ))
    lines.append("")
    lines.append("## P0 tasks only")
    lines.append("")
    lines.append("1. Stop general chat from being inserted into `agentsam_command_run`. This table should be command/tool/terminal intent only.")
    lines.append("2. Locate writer(s) for `agentsam_patch_sessions`. If it is only smoke/legacy, do not use it for Cursor diff/apply.")
    lines.append("3. Standardize `agentsam_artifacts.source_run_id = agentsam_agent_run.id` for generated reports/screenshots/outputs.")
    lines.append("4. Pick `agentsam_tool_call_log` as generic tool-call ledger; use `agentsam_mcp_tool_execution` for MCP-specific details.")
    lines.append("5. Fix MCP execution logging so `tool_key` and either `agentsam_mcp_tools_id` or `agentsam_tools_id` are populated. `tool_id` may remain legacy if documented.")
    lines.append("6. For errors, standardize `agentsam_error_log.source='agentsam_agent_run'` and `source_id=agentsam_agent_run.id` when run-related.")
    lines.append("7. For usage, standardize `agentsam_usage_events.ref_table='agentsam_agent_run'` and `ref_id=agentsam_agent_run.id` when run-related.")
    lines.append("")
    lines.append("## Do not spend budget on")
    lines.append("")
    lines.append("- New dashboard page.")
    lines.append("- New broad database audit.")
    lines.append("- New agentsam_* runtime tables.")
    lines.append("- Renaming agentsam_agent_run.")
    lines.append("- Adding agent_run_id columns blindly.")
    lines.append("- Refactoring all telemetry tables.")
    lines.append("- Touching catalog/config tables just because they have no run link.")
    lines.append("")
    lines.append("## Local code search results")
    lines.append("")
    for pat, result in searches.items():
        lines.append(f"### `{pat}`")
        lines.append("")
        lines.append("```text")
        lines.append(truncate_block(result))
        lines.append("```")
        lines.append("")
    lines.append("## Acceptance criteria")
    lines.append("")
    lines.append("- A normal chat message does not create an `agentsam_command_run` row.")
    lines.append("- A real command/tool approval does create the correct runtime/evidence row.")
    lines.append("- A generated artifact can be traced by `agentsam_artifacts.source_run_id` to `agentsam_agent_run.id`.")
    lines.append("- A tool call can be traced through `agentsam_tool_call_log` by tool_key/handler_key/route_key and session/workflow/run evidence.")
    lines.append("- MCP tool executions populate registry identity via `tool_key` and/or `agentsam_mcp_tools_id` / `agentsam_tools_id`.")
    lines.append("- Errors and usage events point back through existing `source/source_id` or `ref_table/ref_id` conventions.")
    lines.append("")
    lines.append("## Final instruction")
    lines.append("")
    lines.append("Make the smallest patch that fixes P0. Report exact files changed and smoke commands. Do not broaden scope.")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
