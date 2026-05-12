#!/usr/bin/env python3
"""
Agent Sam Capability Fabric Planner

Scans the repo + D1 to find Monaco / Excalidraw / Browser / Playwright tools,
assets, routes, scripts, workflow nodes, command registry entries, MCP tools,
and agentsam_* tables. Generates a tomorrow-ready implementation plan for
Cursor-quality Agent Sam capabilities.

This script DOES NOT mutate D1.
This script DOES NOT deploy.
This script DOES NOT run terminal/browser/playwright actions.
It only inspects and writes artifacts.

Run from repo root:

  python3 scripts/agentsam-capability-fabric-planner.py

Optional:

  IAM_D1_DB=inneranimalmedia-business \
  IAM_WRANGLER_CONFIG=wrangler.production.toml \
  IAM_D1_REMOTE=1 \
  python3 scripts/agentsam-capability-fabric-planner.py

Artifacts:

  artifacts/agentsam-capability-fabric-report.json
  artifacts/agentsam-capability-fabric-plan.md
  artifacts/agentsam-capability-fabric-cursor-brief.txt
  artifacts/agentsam-capability-fabric-matrix.csv

Primary goal:

  Find what exists for:
    - Monaco code/editor work
    - Excalidraw / drawing / diagram work
    - Browser rendering / browsing / screenshot work
    - Playwright testing/capture work

  Then map those capabilities into:
    - agentsam_workflows / nodes / edges
    - agentsam_workflow_runs
    - agentsam_execution_steps
    - agentsam_plans / plan_tasks
    - agentsam_commands / command_run / approval_queue
    - agentsam_mcp_tools / mcp_workflows
    - agentsam_scripts
    - Supabase workflow mirror tables

Production truths this script assumes:
  - agentsam_workflow_runs.id is parent of agentsam_execution_steps.execution_id
  - agent_chat_plan workflow template exists at wf_agent_chat_plan
  - approval-gated terminal/deploy work must use command_run + approval_queue
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"
REPORT_JSON = ARTIFACTS / "agentsam-capability-fabric-report.json"
PLAN_MD = ARTIFACTS / "agentsam-capability-fabric-plan.md"
CURSOR_BRIEF = ARTIFACTS / "agentsam-capability-fabric-cursor-brief.txt"
MATRIX_CSV = ARTIFACTS / "agentsam-capability-fabric-matrix.csv"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in {"0", "false", "False", "no"}

SCAN_DIRS = [
    "src",
    "dashboard",
    "scripts",
    "migrations",
    "public",
    "workers",
    "agent-sam-analytics-dashboard",
]

SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    ".wrangler",
    ".next",
    "dist",
    "build",
    ".turbo",
    ".cache",
    "coverage",
    "artifacts/backups",
}

CODE_EXTS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".sh", ".sql", ".json", ".md", ".html", ".css",
}

CAPABILITIES = {
    "monaco": {
        "terms": [
            "monaco", "Monaco", "editor", "code editor", "diff editor",
            "open file", "write file", "patch file", "artifact", "workspace file",
            "edit_monaco", "AgentMonaco", "CodeEditor",
        ],
        "agent_table_terms": ["monaco", "editor", "file", "artifact", "patch", "workspace"],
        "ideal_node_types": ["agent", "mcp_tool", "eval", "approval_gate"],
        "risk": "medium",
    },
    "excalidraw": {
        "terms": [
            "excalidraw", "Excalidraw", "diagram", "whiteboard", "canvas",
            "drawing", "figjam", "flowchart", "wireframe", "sketch",
        ],
        "agent_table_terms": ["excalidraw", "diagram", "whiteboard", "canvas", "flowchart", "wireframe"],
        "ideal_node_types": ["agent", "mcp_tool", "eval"],
        "risk": "low",
    },
    "browser": {
        "terms": [
            "browser", "Browser", "screenshot", "render", "puppeteer",
            "page.goto", "Browser Rendering", "BROWSER", "capture", "preview",
            "dom", "html render", "visual regression",
        ],
        "agent_table_terms": ["browser", "screenshot", "render", "capture", "preview", "dom"],
        "ideal_node_types": ["mcp_tool", "webhook", "eval", "agent"],
        "risk": "medium",
    },
    "playwright": {
        "terms": [
            "playwright", "Playwright", "@playwright/test", "npx playwright",
            "page.locator", "expect(", "test.describe", "chromium", "e2e",
            "visual test", "browser test",
        ],
        "agent_table_terms": ["playwright", "e2e", "test", "browser test", "visual regression"],
        "ideal_node_types": ["script", "terminal", "eval", "approval_gate"],
        "risk": "high",
    },
}

AGENTSAM_TABLES = [
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_execution_performance_metrics",
    "agentsam_execution_dependency_graph",
    "agentsam_execution_context",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_commands",
    "agentsam_command_run",
    "agentsam_command_pattern",
    "agentsam_approval_queue",
    "agentsam_mcp_tools",
    "agentsam_mcp_workflows",
    "agentsam_scripts",
    "agentsam_artifacts",
    "agentsam_usage_events",
    "agentsam_analytics",
    "agentsam_memory",
    "agentsam_model_catalog",
    "agentsam_prompt_routes",
    "agentsam_route_requirements",
    "agentsam_routing_arms",
]


def run_cmd(cmd: List[str], timeout: int = 90) -> Dict[str, Any]:
    started = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True, timeout=timeout)
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "duration_ms": round((time.time() - started) * 1000),
            "cmd": cmd,
        }
    except Exception as e:
        return {
            "ok": False,
            "returncode": None,
            "stdout": "",
            "stderr": str(e),
            "duration_ms": round((time.time() - started) * 1000),
            "cmd": cmd,
        }


def d1_available() -> bool:
    return shutil.which("npx") is not None and (ROOT / WRANGLER_CONFIG).exists()


def d1_sql(sql: str, timeout: int = 90) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    return run_cmd(cmd, timeout=timeout)


def parse_rows(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    text = (result.get("stdout") or "").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except Exception:
        first = min([i for i in [text.find("["), text.find("{")] if i >= 0], default=-1)
        if first < 0:
            return []
        try:
            parsed = json.loads(text[first:])
        except Exception:
            return []
    if isinstance(parsed, list) and parsed:
        first = parsed[0]
        if isinstance(first, dict):
            return first.get("results") or first.get("result") or []
    if isinstance(parsed, dict):
        return parsed.get("results") or parsed.get("result") or []
    return []


def sql_quote(v: str) -> str:
    return "'" + str(v).replace("'", "''") + "'"


def iter_repo_files() -> List[Path]:
    files: List[Path] = []
    for base in SCAN_DIRS:
        p = ROOT / base
        if not p.exists():
            continue
        for child in p.rglob("*"):
            if not child.is_file():
                continue
            rel = child.relative_to(ROOT)
            rel_s = str(rel)
            if any(part in SKIP_DIR_NAMES for part in rel.parts):
                continue
            if child.suffix not in CODE_EXTS:
                continue
            try:
                if child.stat().st_size > 800_000:
                    continue
            except Exception:
                continue
            files.append(child)
    return sorted(files)


def scan_repo() -> Dict[str, Any]:
    files = iter_repo_files()
    capability_hits: Dict[str, List[Dict[str, Any]]] = {k: [] for k in CAPABILITIES}
    route_hits: List[Dict[str, Any]] = []
    table_hits: Dict[str, List[Dict[str, Any]]] = {t: [] for t in AGENTSAM_TABLES}

    path_route_re = re.compile(r"""(?:path|url|route|endpoint)\s*[:=]\s*['"`]([^'"`]+)['"`]|['"`](/api/[^'"`]+|/dashboard/[^'"`]+)['"`]""")

    for f in files:
        rel = str(f.relative_to(ROOT))
        try:
            text = f.read_text(errors="replace")
        except Exception:
            continue

        lines = text.splitlines()
        lower = text.lower()

        # Capabilities
        for cap, spec in CAPABILITIES.items():
            hits = []
            for term in spec["terms"]:
                if term.lower() in lower:
                    hits.append(term)
            if hits:
                line_numbers = []
                for i, line in enumerate(lines, 1):
                    lline = line.lower()
                    if any(term.lower() in lline for term in hits):
                        line_numbers.append(i)
                        if len(line_numbers) >= 8:
                            break
                capability_hits[cap].append({
                    "path": rel,
                    "terms": sorted(set(hits)),
                    "line_numbers": line_numbers,
                    "score": len(set(hits)) * 3 + min(len(line_numbers), 8),
                })

        # Routes
        for m in path_route_re.finditer(text):
            val = m.group(1) or m.group(2)
            if val and ("/api/" in val or "/dashboard/" in val):
                route_hits.append({"path": rel, "route": val})

        # Tables
        for table in AGENTSAM_TABLES:
            if table.lower() in lower:
                line_numbers = []
                for i, line in enumerate(lines, 1):
                    if table.lower() in line.lower():
                        line_numbers.append(i)
                        if len(line_numbers) >= 10:
                            break
                table_hits[table].append({
                    "path": rel,
                    "line_numbers": line_numbers,
                    "count_hint": lower.count(table.lower()),
                })

    for cap in capability_hits:
        capability_hits[cap] = sorted(capability_hits[cap], key=lambda x: (-x["score"], x["path"]))[:80]

    route_hits = sorted(route_hits, key=lambda x: (x["route"], x["path"]))[:500]
    return {
        "files_scanned": len(files),
        "capability_hits": capability_hits,
        "route_hits": route_hits,
        "table_hits": table_hits,
    }


def d1_inspect() -> Dict[str, Any]:
    if not d1_available():
        return {"available": False, "reason": "npx or wrangler config missing"}

    schemas: Dict[str, Any] = {}
    counts: Dict[str, Any] = {}
    samples: Dict[str, Any] = {}
    capability_rows: Dict[str, Any] = {}

    for table in AGENTSAM_TABLES:
        schema_rows = parse_rows(d1_sql(f"PRAGMA table_info({table});"))
        schemas[table] = {
            "exists": bool(schema_rows),
            "columns": schema_rows,
            "column_names": [r.get("name") for r in schema_rows],
        }
        if schema_rows:
            count_rows = parse_rows(d1_sql(f"SELECT COUNT(*) AS n FROM {table};"))
            counts[table] = count_rows[0].get("n") if count_rows else None
        else:
            counts[table] = None

    # Capability-focused searches. Use permissive column checks.
    def table_cols(table: str) -> set:
        return set(schemas.get(table, {}).get("column_names", []))

    # agentsam_commands
    if schemas.get("agentsam_commands", {}).get("exists"):
        cols = table_cols("agentsam_commands")
        select_cols = [c for c in ["id", "slug", "display_name", "description", "category", "risk_level", "requires_approval", "tool_key", "workflow_key", "execution_mode", "is_active"] if c in cols]
        where = " OR ".join([
            "lower(coalesce(slug,'')) LIKE " + sql_quote(f"%{term}%")
            for term in ["monaco", "excalidraw", "browser", "playwright", "screenshot", "render", "test", "editor"]
        ])
        more = " OR ".join([
            "lower(coalesce(display_name,'')) LIKE " + sql_quote(f"%{term}%") + " OR lower(coalesce(description,'')) LIKE " + sql_quote(f"%{term}%")
            for term in ["monaco", "excalidraw", "browser", "playwright", "screenshot", "render", "test", "editor"]
        ])
        q = f"SELECT {', '.join(select_cols)} FROM agentsam_commands WHERE {where} OR {more} ORDER BY is_active DESC, category, slug LIMIT 100;"
        capability_rows["agentsam_commands"] = parse_rows(d1_sql(q))

    # agentsam_mcp_tools
    if schemas.get("agentsam_mcp_tools", {}).get("exists"):
        cols = table_cols("agentsam_mcp_tools")
        select_cols = [c for c in ["id", "server_key", "tool_key", "name", "description", "risk_level", "requires_approval", "is_active"] if c in cols]
        text_cols = [c for c in ["server_key", "tool_key", "name", "description"] if c in cols]
        clauses = []
        for c in text_cols:
            for term in ["monaco", "excalidraw", "browser", "playwright", "screenshot", "render", "test", "editor"]:
                clauses.append(f"lower(coalesce({c},'')) LIKE {sql_quote('%'+term+'%')}")
        if clauses and select_cols:
            q = f"SELECT {', '.join(select_cols)} FROM agentsam_mcp_tools WHERE {' OR '.join(clauses)} ORDER BY is_active DESC LIMIT 150;"
            capability_rows["agentsam_mcp_tools"] = parse_rows(d1_sql(q))

    # workflows/nodes/scripts
    for table in ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_scripts", "agentsam_memory"]:
        if not schemas.get(table, {}).get("exists"):
            continue
        cols = table_cols(table)
        select_cols = [c for c in ["id", "workflow_key", "display_name", "node_key", "node_type", "title", "handler_key", "slug", "name", "path", "purpose", "runner", "key", "value", "risk_level", "requires_approval", "is_active"] if c in cols]
        text_cols = [c for c in ["workflow_key", "display_name", "description", "node_key", "title", "handler_key", "slug", "name", "path", "purpose", "key", "value"] if c in cols]
        clauses = []
        for c in text_cols:
            for term in ["monaco", "excalidraw", "browser", "playwright", "screenshot", "render", "test", "editor", "agent_chat_plan"]:
                clauses.append(f"lower(coalesce({c},'')) LIKE {sql_quote('%'+term+'%')}")
        if clauses and select_cols:
            q = f"SELECT {', '.join(select_cols)} FROM {table} WHERE {' OR '.join(clauses)} LIMIT 150;"
            capability_rows[table] = parse_rows(d1_sql(q))

    return {
        "available": True,
        "schemas": schemas,
        "counts": counts,
        "capability_rows": capability_rows,
    }


def score_capability(repo_hits: List[Dict[str, Any]], db_rows: Dict[str, List[Dict[str, Any]]], cap: str) -> Dict[str, Any]:
    repo_score = min(100, sum(h["score"] for h in repo_hits[:20]))
    db_score = 0
    db_match_tables = []
    terms = CAPABILITIES[cap]["agent_table_terms"]
    for table, rows in db_rows.items():
        matched = []
        for r in rows or []:
            blob = json.dumps(r, default=str).lower()
            if any(term.lower() in blob for term in terms):
                matched.append(r)
        if matched:
            db_match_tables.append({"table": table, "rows": len(matched)})
            db_score += min(50, len(matched) * 8)
    maturity = "missing"
    total = repo_score + db_score
    if total >= 120:
        maturity = "wired-ish"
    elif total >= 60:
        maturity = "partial"
    elif total > 0:
        maturity = "discovered"
    return {
        "repo_score": repo_score,
        "db_score": db_score,
        "total_score": total,
        "maturity": maturity,
        "db_match_tables": db_match_tables,
    }


def build_matrix(repo: Dict[str, Any], d1: Dict[str, Any]) -> List[Dict[str, Any]]:
    capability_rows = d1.get("capability_rows", {}) if d1.get("available") else {}
    matrix = []
    for cap in CAPABILITIES:
        hits = repo["capability_hits"].get(cap, [])
        score = score_capability(hits, capability_rows, cap)
        top_paths = [h["path"] for h in hits[:8]]
        db_tables = [x["table"] for x in score["db_match_tables"]]
        matrix.append({
            "capability": cap,
            "maturity": score["maturity"],
            "repo_score": score["repo_score"],
            "db_score": score["db_score"],
            "total_score": score["total_score"],
            "top_paths": top_paths,
            "db_tables": db_tables,
            "risk": CAPABILITIES[cap]["risk"],
        })
    return matrix


def classify_gap(row: Dict[str, Any]) -> List[str]:
    cap = row["capability"]
    gaps = []
    if row["maturity"] in {"missing", "discovered"}:
        gaps.append("needs registry rows in agentsam_commands/agentsam_mcp_tools/agentsam_workflow_nodes")
    if "agentsam_workflow_nodes" not in row["db_tables"]:
        gaps.append("needs workflow node mapping")
    if "agentsam_commands" not in row["db_tables"]:
        gaps.append("needs command palette/allowlist mapping")
    if cap in {"playwright", "browser"} and "agentsam_scripts" not in row["db_tables"]:
        gaps.append("needs script registry entry for safe repeatable execution")
    if cap == "playwright":
        gaps.append("must be approval-backed for terminal/test runner execution")
    if cap == "browser":
        gaps.append("must write screenshots/artifacts with run_id + execution_step_id")
    if cap == "monaco":
        gaps.append("must write file patch artifacts and link changed files to plan_tasks.files_involved")
    if cap == "excalidraw":
        gaps.append("must treat diagrams as artifacts, not terminal work")
    return gaps


def md_table(rows: List[List[str]]) -> str:
    if not rows:
        return ""
    header = rows[0]
    out = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    for r in rows[1:]:
        out.append("| " + " | ".join(str(x).replace("\n", "<br>") for x in r) + " |")
    return "\n".join(out)


def build_plan(report: Dict[str, Any]) -> str:
    matrix = report["matrix"]
    d1 = report["d1"]
    repo = report["repo"]

    lines: List[str] = []
    lines.append("# Agent Sam Capability Fabric Plan")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append("")
    lines.append("## Objective")
    lines.append("")
    lines.append("Tomorrow’s goal is to wire Agent Sam into Cursor-quality work loops for Monaco editing, Excalidraw/diagram artifacts, Browser rendering/capture, and Playwright validation without inventing new schema.")
    lines.append("")
    lines.append("The DB contract already proven by the E2E scripts remains the spine:")
    lines.append("")
    lines.append("```text")
    lines.append("agentsam_workflow_runs.id")
    lines.append("  -> agentsam_execution_steps.execution_id")
    lines.append("agentsam_plans.workflow_run_id")
    lines.append("agentsam_plan_tasks.workflow_run_id")
    lines.append("agentsam_plan_tasks.execution_step_id")
    lines.append("agentsam_approval_queue.command_run_id")
    lines.append("agentsam_approval_queue.execution_step_id")
    lines.append("```")
    lines.append("")
    lines.append("## Capability scan matrix")
    lines.append("")
    rows = [["Capability", "Maturity", "Risk", "Top repo paths", "DB tables found", "Main gaps"]]
    for r in matrix:
        rows.append([
            r["capability"],
            r["maturity"],
            r["risk"],
            "<br>".join(r["top_paths"][:5]) or "none",
            ", ".join(r["db_tables"]) or "none",
            "<br>".join(classify_gap(r)[:4]),
        ])
    lines.append(md_table(rows))
    lines.append("")

    lines.append("## P0 tomorrow sequence")
    lines.append("")
    lines.append("### 1. Freeze the proven execution spine")
    lines.append("")
    lines.append("Do not add schema. Do not create new workflow tables. Do not treat `agentsam_executions` as the parent of `agentsam_execution_steps`. Keep `agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id`.")
    lines.append("")
    lines.append("Required runtime order for all capability work:")
    lines.append("")
    lines.append("```text")
    lines.append("1. create agentsam_workflow_runs")
    lines.append("2. create agentsam_plans")
    lines.append("3. create agentsam_execution_steps with approval_id NULL")
    lines.append("4. create agentsam_command_run before any plan_task references command_run_id")
    lines.append("5. create agentsam_plan_tasks linked to workflow_run_id + execution_step_id")
    lines.append("6. create agentsam_approval_queue for risky terminal/deploy/test work")
    lines.append("7. update execution_steps.approval_id after approval_queue exists")
    lines.append("8. mirror to Supabase after D1 success")
    lines.append("```")
    lines.append("")

    lines.append("### 2. Define four canonical capability workflows")
    lines.append("")
    lines.append("Create/confirm these workflow templates or nodes under the existing `agent_chat_plan` umbrella first. Only create separate workflow rows if the repo already expects standalone workflow keys.")
    lines.append("")
    capability_workflows = [
        ("monaco_edit_loop", "Plan file edits, open/read target files, generate patch/artifact, apply only through approved file-write path, run validation."),
        ("excalidraw_diagram_loop", "Convert a goal into diagram JSON/artifact, preview in dashboard, store artifact metadata, no terminal required."),
        ("browser_capture_loop", "Render target route/page, capture screenshot/DOM/console, write artifact, summarize visual issues."),
        ("playwright_validation_loop", "Generate or select Playwright test, request approval for test command, run after approval, attach results/screenshots/artifacts."),
    ]
    for key, desc in capability_workflows:
        lines.append(f"- `{key}` — {desc}")
    lines.append("")

    lines.append("### 3. Align each capability to existing agentsam tables")
    lines.append("")
    lines.append("#### Monaco")
    lines.append("")
    lines.append("Use `agentsam_plan_tasks.files_involved`, `output_summary`, `agentsam_artifacts`, and `agentsam_execution_steps.output_json` to record patches and edited files. Monaco work should generally be `node_type='mcp_tool'` or `node_type='agent'`; any actual file write should go through an approval-backed command/tool path if it mutates the repo.")
    lines.append("")
    lines.append("#### Excalidraw")
    lines.append("")
    lines.append("Treat diagrams as artifacts. Store diagram JSON or R2/artifact pointers in `agentsam_artifacts`, and link via `execution_steps.output_json`. No terminal approval needed unless it writes files/deploys.")
    lines.append("")
    lines.append("#### Browser")
    lines.append("")
    lines.append("Browser render/capture steps should write screenshot URLs, DOM summaries, console errors, and route metadata into `execution_steps.output_json` and optionally `agentsam_artifacts`. Use `workflow_run_id` and `execution_step_id` in artifact metadata.")
    lines.append("")
    lines.append("#### Playwright")
    lines.append("")
    lines.append("Playwright is terminal-backed and must be approval-gated. Create `agentsam_command_run` first, then `agentsam_plan_tasks.command_run_id`, then `agentsam_approval_queue`. Never run `npx playwright` before server-side approval verification.")
    lines.append("")

    lines.append("## P0 Cursor implementation brief")
    lines.append("")
    lines.append("Give Cursor this exact scope:")
    lines.append("")
    lines.append("```text")
    lines.append("Wire existing Agent Sam planner/task executor so Monaco, Excalidraw, Browser, and Playwright tasks use the proven execution fabric.")
    lines.append("")
    lines.append("Do not add DB columns/tables.")
    lines.append("Do not create new script variants.")
    lines.append("Do not bypass D1 approval.")
    lines.append("")
    lines.append("For every capability task:")
    lines.append("- create workflow_run first")
    lines.append("- create execution_step per task")
    lines.append("- link plan_task.workflow_run_id and execution_step_id")
    lines.append("- for Playwright/terminal/deploy, create command_run before plan_task command_run_id")
    lines.append("- create approval_queue for risky commands")
    lines.append("- update execution_step.approval_id only after approval_queue exists")
    lines.append("- mirror final run/steps/events/snapshot to Supabase using scripts/agentsam-supabase-direct-sync.py mapping")
    lines.append("")
    lines.append("Validation target:")
    lines.append("- one live chat prompt creates a Monaco edit plan")
    lines.append("- one live chat prompt creates a Browser capture plan")
    lines.append("- one live chat prompt creates a Playwright approval card and does not run until Allow")
    lines.append("```")
    lines.append("")

    lines.append("## Validation commands for tomorrow")
    lines.append("")
    lines.append("```bash")
    lines.append("python3 scripts/agentsam-agent-chat-plan-workflow.py --validate-only")
    lines.append("python3 scripts/agentsam-supabase-direct-sync.py --run-id wrun_true_e2e_20260512070948 --verify")
    lines.append("```")
    lines.append("")
    lines.append("After a live chat test:")
    lines.append("")
    lines.append("```bash")
    lines.append("npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml \\")
    lines.append("  --command \"")
    lines.append("SELECT p.id, p.title, p.workflow_run_id, COUNT(t.id) AS tasks,")
    lines.append("SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps,")
    lines.append("SUM(CASE WHEN t.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_wrun")
    lines.append("FROM agentsam_plans p")
    lines.append("LEFT JOIN agentsam_plan_tasks t ON t.plan_id=p.id")
    lines.append("GROUP BY p.id")
    lines.append("ORDER BY p.created_at DESC")
    lines.append("LIMIT 5;\"")
    lines.append("```")
    lines.append("")
    lines.append("Expected newest row: `workflow_run_id` not null, `tasks_with_steps = tasks`, `tasks_with_wrun = tasks`.")
    lines.append("")

    lines.append("## Files/paths discovered")
    lines.append("")
    for cap in CAPABILITIES:
        lines.append(f"### {cap}")
        hits = repo["capability_hits"].get(cap, [])[:20]
        if not hits:
            lines.append("")
            lines.append("No repo hits found.")
        else:
            lines.append("")
            for h in hits:
                lines.append(f"- `{h['path']}` — terms: {', '.join(h['terms'][:8])}; lines: {h['line_numbers']}")
        lines.append("")

    return "\n".join(lines)


def build_cursor_brief(report: Dict[str, Any]) -> str:
    lines = []
    lines.append("AGENT SAM CAPABILITY FABRIC — CURSOR BRIEF")
    lines.append("")
    lines.append("Use this as tomorrow's implementation scope. Do not redesign schema.")
    lines.append("")
    lines.append("PROVEN SPINE:")
    lines.append("  agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id")
    lines.append("  agentsam_plans.workflow_run_id -> agentsam_workflow_runs.id")
    lines.append("  agentsam_plan_tasks.workflow_run_id -> agentsam_workflow_runs.id")
    lines.append("  agentsam_plan_tasks.execution_step_id -> agentsam_execution_steps.id")
    lines.append("")
    lines.append("FK-SAFE ORDER:")
    lines.append("  1 workflow_run")
    lines.append("  2 plan")
    lines.append("  3 execution_steps with approval_id NULL")
    lines.append("  4 command_run before any plan_task.command_run_id")
    lines.append("  5 plan_tasks")
    lines.append("  6 approval_queue")
    lines.append("  7 update execution_steps.approval_id")
    lines.append("")
    lines.append("CAPABILITIES TO WIRE:")
    for row in report["matrix"]:
        lines.append(f"  - {row['capability']}: maturity={row['maturity']} risk={row['risk']} top_paths={', '.join(row['top_paths'][:3])}")
    lines.append("")
    lines.append("P0 IMPLEMENTATION:")
    lines.append("  - map Monaco edits to plan_tasks/files/artifacts/execution_steps")
    lines.append("  - map Excalidraw diagrams to artifacts/execution_steps, no terminal")
    lines.append("  - map Browser capture to artifacts/execution_steps, screenshot/DOM/console output_json")
    lines.append("  - map Playwright to approval-backed command_run + approval_queue, never auto-run before Allow")
    lines.append("  - mirror successful D1 runs to Supabase with scripts/agentsam-supabase-direct-sync.py mapping")
    lines.append("")
    lines.append("DO NOT:")
    lines.append("  - create tables/columns")
    lines.append("  - create agentsam_command_runs plural")
    lines.append("  - use agentsam_executions as execution_steps parent")
    lines.append("  - run terminal/playwright without D1 approval")
    lines.append("  - generate more script variants")
    lines.append("")
    lines.append("VALIDATE LIVE:")
    lines.append("  1. prompt: create a Monaco edit plan")
    lines.append("  2. prompt: capture browser screenshot of dashboard route")
    lines.append("  3. prompt: run Playwright test")
    lines.append("  Expected: run/plan/steps/tasks rows linked; Playwright produces approval_required before command execution.")
    return "\n".join(lines)


def write_csv(matrix: List[Dict[str, Any]]) -> None:
    with MATRIX_CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "capability", "maturity", "risk", "repo_score", "db_score",
            "total_score", "top_paths", "db_tables", "gaps",
        ])
        w.writeheader()
        for r in matrix:
            w.writerow({
                **{k: r[k] for k in ["capability", "maturity", "risk", "repo_score", "db_score", "total_score"]},
                "top_paths": " | ".join(r["top_paths"]),
                "db_tables": " | ".join(r["db_tables"]),
                "gaps": " | ".join(classify_gap(r)),
            })


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-d1", action="store_true", help="Skip D1 inspection.")
    args = parser.parse_args()

    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    print("Agent Sam Capability Fabric Planner")
    print(f"repo: {ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("")

    print("[1/5] Scanning repo for Monaco/Excalidraw/Browser/Playwright code/assets/routes...")
    repo = scan_repo()
    print(f"  files_scanned: {repo['files_scanned']}")
    for cap in CAPABILITIES:
        print(f"  {cap}_hits: {len(repo['capability_hits'].get(cap, []))}")

    print("[2/5] Inspecting D1 agentsam_* tables and capability rows...")
    d1 = {"available": False, "reason": "skipped"}
    if not args.no_d1:
        d1 = d1_inspect()
    print(f"  d1_available: {d1.get('available')}")
    if d1.get("available"):
        for t in ["agentsam_workflows", "agentsam_workflow_nodes", "agentsam_commands", "agentsam_mcp_tools", "agentsam_scripts", "agentsam_plans", "agentsam_plan_tasks"]:
            print(f"  {t}: rows={d1.get('counts', {}).get(t)}")

    print("[3/5] Building capability matrix...")
    matrix = build_matrix(repo, d1)
    for r in matrix:
        print(f"  {r['capability']}: maturity={r['maturity']} score={r['total_score']} risk={r['risk']}")

    print("[4/5] Writing artifacts...")
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
            "scan_dirs": SCAN_DIRS,
        },
        "repo": repo,
        "d1": d1,
        "matrix": matrix,
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    PLAN_MD.write_text(build_plan(report))
    CURSOR_BRIEF.write_text(build_cursor_brief(report))
    write_csv(matrix)

    print(f"  wrote {REPORT_JSON}")
    print(f"  wrote {PLAN_MD}")
    print(f"  wrote {CURSOR_BRIEF}")
    print(f"  wrote {MATRIX_CSV}")

    print("[5/5] Done.")
    print("")
    print("[PASS] Capability fabric plan generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
