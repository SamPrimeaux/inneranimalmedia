#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

DB_NAME = "inneranimalmedia-business"
TABLE_PATTERN = "agentsam_%"

today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
generated_at = datetime.now(timezone.utc).isoformat()

OUT_DIR = Path("docs/db/agentsam-d1-context")
OUT_DIR.mkdir(parents=True, exist_ok=True)

BASE = f"{today}_agentsam-schema"
OUT_CONTEXT = OUT_DIR / f"{BASE}.context.md"
OUT_AUTORAG = OUT_DIR / f"{BASE}.autorag.md"
OUT_JSON = OUT_DIR / f"{BASE}.json"
OUT_SQL = OUT_DIR / f"{BASE}-create-tables.sql"
OUT_INDEX = OUT_DIR / f"{today}_agentsam-index.md"
OUT_GAPS = OUT_DIR / f"{today}_agentsam-frontend-gaps.md"

# Keep this intentionally broad and stable. Unknown tables still export.
GROUP_RULES = [
    ("execution", ["run", "execution", "context", "compaction", "escalation", "tool_chain"]),
    ("commands", ["command", "slash"]),
    ("mcp-tools", ["mcp", "tool"]),
    ("models-routing-evals", ["ai", "model", "routing", "eval", "prompt"]),
    ("workspace-projects", ["workspace", "project", "bootstrap", "subagent"]),
    ("memory-skills-rules", ["memory", "skill", "rules", "ignore"]),
    ("observability-analytics", ["analytics", "usage", "health", "error", "cron", "slo", "telemetry", "stats"]),
    ("workflows-plans-tasks", ["workflow", "plan", "task", "todo"]),
    ("security-governance", ["guardrail", "policy", "trusted", "allowlist", "approval", "feature_override"]),
    ("hooks-webhooks", ["hook", "webhook"]),
    ("settings-jobs", ["feature_flag", "code_index", "cad", "subscription", "settings"]),
    ("cicd-scripts", ["script", "deploy", "cicd"]),
]

GROUP_TITLES = {
    "execution": "Agent Execution",
    "commands": "Commands and Intent Routing",
    "mcp-tools": "MCP Tools, Servers, and Tool Logs",
    "models-routing-evals": "AI Models, Routing, Prompts, and Evals",
    "workspace-projects": "Workspaces, Projects, and Subagents",
    "memory-skills-rules": "Memory, Skills, Rules, and Ignore Patterns",
    "observability-analytics": "Observability, Analytics, Health, and Errors",
    "workflows-plans-tasks": "Workflows, Plans, Tasks, and Todos",
    "security-governance": "Security, Guardrails, Policy, and Approvals",
    "hooks-webhooks": "Hooks and Webhooks",
    "settings-jobs": "Settings, Feature Flags, and Jobs",
    "cicd-scripts": "CI/CD Scripts and Automation",
    "other": "Other agentsam_* Tables",
}

# Optional purpose hints. Missing tables still get a useful generated summary.
PURPOSE_HINTS = {
    "agentsam_scripts": "Registry of automation scripts, runners, safety flags, owner-only requirements, and preferred usage.",
    "agentsam_script_runs": "Execution history for registered scripts, including branch/SHA, environment, status, and output summaries.",
    "agentsam_workspace": "Workspace-level configuration for Agent Sam, including project/repo/R2/model/subagent context.",
    "agentsam_ai": "AI model/provider catalog and model capability metadata.",
    "agentsam_routing_arms": "Model routing state used for provider/model selection and performance tuning.",
    "agentsam_agent_run": "High-level agent invocation/run record for status, model, cost, token, and workflow tracking.",
    "agentsam_commands": "Canonical command registry for Agent Sam actions and command routing.",
    "agentsam_mcp_tools": "Registry of MCP tools and tool schema/risk/health metadata.",
    "agentsam_mcp_servers": "Registry of MCP servers and health/routing metadata.",
    "agentsam_memory": "Persistent memory/facts/preferences used for Agent Sam context.",
    "agentsam_analytics": "Analytics snapshot/rollup table for Agent Sam usage, costs, tools, and system health.",
    "agentsam_guardrails": "Guardrail rule definitions for safety, governance, and tool/action blocking.",
    "agentsam_approval_queue": "Human approval queue for risky or gated tool/command actions.",
    "agentsam_hook": "Hook definitions connecting events to workflows, tools, or commands.",
    "agentsam_hook_execution": "Execution records for triggered hooks.",
    "agentsam_webhook_events": "Inbound webhook event log and processing state.",
    "agentsam_eval_cases": "Evaluation cases for model/tool/prompt quality testing.",
    "agentsam_eval_runs": "Evaluation run results and quality/cost/latency scoring.",
    "agentsam_prompt_versions": "Versioned system/role/prompt records for rollback and prompt governance.",
}


def run_sql(sql: str) -> list[dict]:
    cmd = [
        "./scripts/with-cloudflare-env.sh",
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
    result = subprocess.run(cmd, text=True, capture_output=True, check=False)

    if result.returncode != 0:
        raise RuntimeError(
            "Wrangler D1 command failed.\n"
            f"SQL:\n{sql}\n\n"
            f"STDOUT:\n{result.stdout}\n\n"
            f"STDERR:\n{result.stderr}\n"
        )

    raw = result.stdout.strip()
    if not raw:
        return []

    data = json.loads(raw)
    if isinstance(data, list) and data:
        return data[0].get("results", []) or []
    if isinstance(data, dict):
        return data.get("results", []) or []
    return []


def get_tables() -> list[dict]:
    return run_sql(f"""
SELECT
  name,
  sql
FROM sqlite_master
WHERE type = 'table'
  AND name LIKE '{TABLE_PATTERN}'
ORDER BY name;
""")


def get_columns(table: str) -> list[dict]:
    return run_sql(f'PRAGMA table_info("{table}");')


def get_indexes(table: str) -> list[dict]:
    indexes = run_sql(f'PRAGMA index_list("{table}");')
    for idx in indexes:
        idx_name = idx.get("name")
        if not idx_name:
            idx["columns"] = []
            continue
        idx["columns"] = run_sql(f'PRAGMA index_info("{idx_name}");')
    return indexes


def get_count(table: str) -> int | None:
    try:
        rows = run_sql(f'SELECT COUNT(*) AS row_count FROM "{table}";')
        if rows:
            return rows[0].get("row_count")
    except Exception:
        return None
    return None


def classify_table(name: str) -> str:
    low = name.lower()
    for group, needles in GROUP_RULES:
        if any(n in low for n in needles):
            return group
    return "other"


def tags_for_table(name: str, group: str) -> list[str]:
    tags = ["d1", "schema", "agentsam", group]
    low = name.lower()
    for token in [
        "workspace", "model", "routing", "eval", "mcp", "tool", "command",
        "script", "hook", "webhook", "memory", "skill", "prompt", "guardrail",
        "approval", "analytics", "health", "usage", "workflow", "plan", "todo",
        "policy", "feature", "cron", "error"
    ]:
        if token in low:
            tags.append(token)
    return sorted(set(tags))


def compact_columns(cols: list[dict]) -> str:
    parts = []
    for c in cols:
        name = c.get("name")
        typ = c.get("type") or "ANY"
        pk = " PK" if c.get("pk") else ""
        nn = " NOT NULL" if c.get("notnull") else ""
        default = c.get("dflt_value")
        df = f" DEFAULT {default}" if default is not None else ""
        parts.append(f"{name} {typ}{pk}{nn}{df}".strip())
    return ", ".join(parts)


def purpose_for_table(name: str, group: str, cols: list[dict]) -> str:
    if name in PURPOSE_HINTS:
        return PURPOSE_HINTS[name]
    col_names = ", ".join(c.get("name", "") for c in cols[:8])
    return (
        f"agentsam table in the {GROUP_TITLES.get(group, group)} domain. "
        f"Use the actual columns listed here before writing API SQL. "
        f"Leading columns: {col_names}."
    )


def relationship_hints(name: str, all_names: set[str], cols: list[dict]) -> list[str]:
    hints = []
    col_names = {c.get("name") for c in cols}

    candidates = {
        "workspace_id": "agentsam_workspace",
        "command_id": "agentsam_commands",
        "tool_id": "agentsam_mcp_tools",
        "model_id": "agentsam_ai",
        "run_id": "agentsam_agent_run",
        "agent_run_id": "agentsam_agent_run",
        "workflow_id": "agentsam_mcp_workflows",
        "plan_id": "agentsam_plans",
        "task_id": "agentsam_plan_tasks",
        "script_id": "agentsam_scripts",
        "hook_id": "agentsam_hook",
        "suite_id": "agentsam_eval_suites",
        "case_id": "agentsam_eval_cases",
        "skill_id": "agentsam_skill",
        "approval_id": "agentsam_approval_queue",
    }

    for col, table in candidates.items():
        if col in col_names and table in all_names and table != name:
            hints.append(table)

    # Also hint similar prefix tables.
    stem = name.replace("agentsam_", "").split("_")[0]
    for t in sorted(all_names):
        if t != name and stem and stem in t.replace("agentsam_", ""):
            hints.append(t)

    return sorted(set(hints))[:12]


def build_schema_payload() -> dict:
    table_rows = get_tables()
    all_names = {r["name"] for r in table_rows}
    tables = []

    for i, row in enumerate(table_rows, start=1):
        name = row["name"]
        print(f"[{i:03}/{len(table_rows)}] {name}")
        cols = get_columns(name)
        indexes = get_indexes(name)
        count = get_count(name)
        group = classify_table(name)
        tables.append({
            "name": name,
            "group": group,
            "group_title": GROUP_TITLES.get(group, group),
            "row_count": count,
            "tags": tags_for_table(name, group),
            "purpose": purpose_for_table(name, group, cols),
            "relationships": relationship_hints(name, all_names, cols),
            "compact_columns": compact_columns(cols),
            "columns": cols,
            "indexes": indexes,
            "create_sql": row.get("sql"),
        })

    return {
        "doc_type": "d1_schema_context",
        "scope": "agentsam-platform",
        "database": DB_NAME,
        "table_pattern": TABLE_PATTERN,
        "generated_at": generated_at,
        "date": today,
        "usage": {
            "primary_consumer": "Cursor, AutoRAG, Agent Sam",
            "purpose": "Prevent agentsam_* SQL mistakes, support dashboard/settings/mcp/agent/workflow API design, and reduce repeated D1 schema lookups.",
            "rule": "Do not invent columns. If a column is not present in this context, do not query it."
        },
        "tables": tables,
    }


def write_json(payload: dict) -> None:
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def write_sql(payload: dict) -> None:
    chunks = []
    for t in payload["tables"]:
        chunks.append(
            f"-- table: {t['name']}\n"
            f"-- group: {t['group']}\n"
            f"-- tags: {', '.join(t['tags'])}\n"
            f"{t.get('create_sql') or '-- no create SQL'};"
        )
    OUT_SQL.write_text("\n\n".join(chunks) + "\n")


def write_index(payload: dict) -> None:
    grouped = defaultdict(list)
    for t in payload["tables"]:
        grouped[t["group"]].append(t)

    lines = [
        "---",
        "doc_type: agentsam_schema_index",
        "scope: agentsam-platform",
        f"database: {DB_NAME}",
        f"generated_at: {generated_at}",
        f"date: {today}",
        "autorag_ready: true",
        "tags: [d1, schema, agentsam, index, cursor-context]",
        "---",
        "",
        "# agentsam_* Schema Index",
        "",
        "This is the master index for the Agent Sam D1 namespace.",
        "",
        f"- Database: `{DB_NAME}`",
        f"- Pattern: `{TABLE_PATTERN}`",
        f"- Tables: `{len(payload['tables'])}`",
        "",
        "## Cursor rule",
        "",
        "Use the context file before writing agentsam SQL. Do not guess columns.",
        "",
    ]

    for group in sorted(grouped):
        title = GROUP_TITLES.get(group, group)
        lines += [f"## {title}", "", "| table | rows | purpose |", "|---|---:|---|"]
        for t in sorted(grouped[group], key=lambda x: x["name"]):
            purpose = t["purpose"].replace("\n", " ")[:140]
            lines.append(f"| `{t['name']}` | {t['row_count']} | {purpose} |")
        lines.append("")

    OUT_INDEX.write_text("\n".join(lines) + "\n")


def write_context(payload: dict) -> None:
    grouped = defaultdict(list)
    for t in payload["tables"]:
        grouped[t["group"]].append(t)

    lines = [
        "---",
        "doc_type: d1_schema_context",
        "scope: agentsam-platform",
        f"database: {DB_NAME}",
        f"generated_at: {generated_at}",
        f"date: {today}",
        "consumer: cursor",
        "autorag_ready: true",
        "tags:",
        "  - d1",
        "  - schema",
        "  - agentsam",
        "  - agent-sam",
        "  - platform",
        "---",
        "",
        "# Agent Sam D1 Schema Context",
        "",
        "## Purpose",
        "",
        "This file is the source of truth for `agentsam_*` D1 tables. Use it before writing SQL for `/api/agent`, `/api/mcp`, `/api/settings`, `/api/dashboard`, hooks, evals, workflows, tools, scripts, model routing, analytics, and Agent Sam runtime features.",
        "",
        "## Cursor rules",
        "",
        "- Do not invent columns.",
        "- Do not add migrations to satisfy guessed queries unless explicitly approved.",
        "- Patch API queries to match the real schema.",
        "- Keep `agentsam_*` as the active namespace unless a specific legacy table is intentionally required.",
        "- Use this file to reduce repeated D1 schema lookups and token cost.",
        "",
        "## Table index",
        "",
    ]

    for t in payload["tables"]:
        lines.append(f"- `{t['name']}` — group: `{t['group']}` — rows: `{t['row_count']}` — tags: `{', '.join(t['tags'])}`")
    lines.append("")

    for group in sorted(grouped):
        lines += [f"# {GROUP_TITLES.get(group, group)}", ""]
        for t in sorted(grouped[group], key=lambda x: x["name"]):
            lines += [
                f"## Table: `{t['name']}`",
                "",
                f"Meta: `table={t['name']}` `group={t['group']}` `rows={t['row_count']}` `tags={','.join(t['tags'])}`",
                "",
                "### Purpose",
                "",
                t["purpose"],
                "",
            ]
            if t["relationships"]:
                lines += ["### Relationship hints", ""]
                for rel in t["relationships"]:
                    lines.append(f"- `{rel}`")
                lines.append("")

            lines += [
                "### Compact columns",
                "",
                "```txt",
                t["compact_columns"],
                "```",
                "",
                "### Columns",
                "",
                "| order | name | type | not_null | default | pk |",
                "|---:|---|---|---:|---|---:|",
            ]

            for c in t["columns"]:
                lines.append(
                    f"| {c.get('cid')} | `{c.get('name')}` | `{c.get('type') or ''}` | "
                    f"{c.get('notnull')} | `{c.get('dflt_value')}` | {c.get('pk')} |"
                )

            if t["indexes"]:
                lines += ["", "### Indexes", "", "| name | unique | origin | partial | columns |", "|---|---:|---|---:|---|"]
                for idx in t["indexes"]:
                    cols = ", ".join(
                        str(col.get("name"))
                        for col in idx.get("columns", [])
                        if col.get("name") is not None
                    )
                    lines.append(
                        f"| `{idx.get('name')}` | {idx.get('unique')} | `{idx.get('origin')}` | "
                        f"{idx.get('partial')} | `{cols}` |"
                    )

            lines += [
                "",
                "### Create SQL",
                "",
                "```sql",
                t.get("create_sql") or "-- no create SQL",
                "```",
                "",
            ]

    OUT_CONTEXT.write_text("\n".join(lines) + "\n")


def write_autorag(payload: dict) -> None:
    lines = [
        "---",
        "doc_type: autorag_schema_context",
        "scope: agentsam-platform",
        f"database: {DB_NAME}",
        f"generated_at: {generated_at}",
        f"date: {today}",
        "chunking_strategy: one-table-per-section",
        "tags: [d1, schema, agentsam, agent-sam, cursor-context, autorag]",
        "---",
        "",
        "# AutoRAG Schema Context: agentsam_*",
        "",
        "This document is optimized for retrieval. Each section is self-contained and repeats table metadata, purpose, relationships, compact columns, CREATE SQL, and columns JSON.",
        "",
    ]

    for t in sorted(payload["tables"], key=lambda x: x["name"]):
        lines += [
            f"<!-- chunk:table name={t['name']} scope=agentsam-platform group={t['group']} tags={','.join(t['tags'])} generated_at={generated_at} -->",
            "",
            f"## schema.table.{t['name']}",
            "",
            f"table_name: `{t['name']}`",
            f"database: `{DB_NAME}`",
            "scope: `agentsam-platform`",
            f"group: `{t['group']}`",
            f"group_title: `{t['group_title']}`",
            f"row_count: `{t['row_count']}`",
            f"tags: `{', '.join(t['tags'])}`",
            "",
            "retrieval_summary:",
            f"- Purpose: {t['purpose']}",
            f"- Use table `{t['name']}` only with the columns listed below.",
            "- Do not guess tenant/workspace/user/model/tool columns unless they appear here.",
            "- If an API query fails with a missing column, patch the query against this context rather than inventing migrations.",
            "",
        ]

        if t["relationships"]:
            lines.append("relationship_hints:")
            for rel in t["relationships"]:
                lines.append(f"- `{rel}`")
            lines.append("")

        lines += [
            "compact_columns:",
            "```txt",
            t["compact_columns"],
            "```",
            "",
            "create_sql:",
            "```sql",
            t.get("create_sql") or "-- no create SQL",
            "```",
            "",
            "columns_json:",
            "```json",
            json.dumps(t["columns"], indent=2, ensure_ascii=False),
            "```",
            "",
            "<!-- /chunk:table -->",
            "",
        ]

    OUT_AUTORAG.write_text("\n".join(lines) + "\n")


def write_gaps(payload: dict) -> None:
    # Not a fragile route map. This is a practical coverage checklist by domain.
    grouped = defaultdict(list)
    for t in payload["tables"]:
        grouped[t["group"]].append(t)

    lines = [
        "---",
        "doc_type: agentsam_frontend_backend_gap_checklist",
        "scope: agentsam-platform",
        f"database: {DB_NAME}",
        f"generated_at: {generated_at}",
        f"date: {today}",
        "tags: [d1, schema, agentsam, frontend-gaps, dashboard]",
        "---",
        "",
        "# Agent Sam Frontend ↔ Backend Gap Checklist",
        "",
        "This file is a lightweight checklist. It does not assume routes exist. Use it to decide which dashboard pages need UI/API coverage for each agentsam table group.",
        "",
    ]

    route_hints = {
        "execution": ["/dashboard/agent", "/dashboard/overview", "/dashboard/health"],
        "commands": ["/dashboard/agent", "/dashboard/settings/tools", "/dashboard/settings/rules"],
        "mcp-tools": ["/dashboard/mcp", "/dashboard/settings/tools"],
        "models-routing-evals": ["/dashboard/settings/ai-models", "/dashboard/agent"],
        "workspace-projects": ["/dashboard/settings/workspace", "/dashboard/agent"],
        "memory-skills-rules": ["/dashboard/settings/rules", "/dashboard/agent"],
        "observability-analytics": ["/dashboard/overview", "/dashboard/health", "/dashboard/analytics"],
        "workflows-plans-tasks": ["/dashboard/agent", "/dashboard/overview"],
        "security-governance": ["/dashboard/settings/security", "/dashboard/settings/rules"],
        "hooks-webhooks": ["/dashboard/settings/hooks", "/dashboard/settings/integrations"],
        "settings-jobs": ["/dashboard/settings/general", "/dashboard/settings/tools"],
        "cicd-scripts": ["/dashboard/settings/cicd", "/dashboard/agent"],
        "other": ["/dashboard/settings/docs"],
    }

    for group in sorted(grouped):
        lines += [
            f"## {GROUP_TITLES.get(group, group)}",
            "",
            "Suggested dashboard surfaces:",
        ]
        for route in route_hints.get(group, []):
            lines.append(f"- `{route}`")
        lines += ["", "Tables:", ""]
        for t in sorted(grouped[group], key=lambda x: x["name"]):
            lines.append(f"- `{t['name']}` — rows: `{t['row_count']}`")
        lines.append("")

    OUT_GAPS.write_text("\n".join(lines) + "\n")


def main() -> None:
    print(f"Exporting {TABLE_PATTERN} schema from {DB_NAME}")
    payload = build_schema_payload()

    write_json(payload)
    write_sql(payload)
    write_index(payload)
    write_context(payload)
    write_autorag(payload)
    write_gaps(payload)

    print("")
    print("Wrote:")
    for p in [OUT_INDEX, OUT_CONTEXT, OUT_AUTORAG, OUT_JSON, OUT_SQL, OUT_GAPS]:
        print(f"- {p} ({p.stat().st_size / 1024:.1f} KB)")

    print("")
    print("Matched tables:")
    for t in payload["tables"]:
        print(f"- {t['name']} ({t['row_count']} rows)")


if __name__ == "__main__":
    main()
