#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1").lower() not in {"0", "false", "no"}

TARGET_FILE = "src/core/agentsam-plan-supabase-public-sync.js"
IMPORT_FILES = [
    "src/core/agentsam-planner.js",
    "src/core/agentsam-task-executor.js",
]

OUT_PROMPT = ARTIFACTS / "gemini-agentsam-deploy-fix-brief.txt"
OUT_REPORT = ARTIFACTS / "gemini-agentsam-deploy-fix-report.json"
OUT_CHECKLIST = ARTIFACTS / "gemini-agentsam-deploy-fix-checklist.sh"

AGENTSAM_TABLES = [
    "agentsam_workflows",
    "agentsam_workflow_nodes",
    "agentsam_workflow_edges",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_execution_performance_metrics",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_approval_queue",
    "agentsam_command_run",
    "agentsam_commands",
    "agentsam_scripts",
    "agentsam_skill",
    "agentsam_memory",
    "agentsam_artifacts",
    "agentsam_usage_events",
    "agentsam_analytics",
    "agentsam_model_catalog",
    "agentsam_mcp_tools",
    "agentsam_mcp_workflows",
]

CANONICAL_SPINE = (
    "agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id; "
    "agentsam_plans.workflow_run_id -> agentsam_workflow_runs.id; "
    "agentsam_plan_tasks.workflow_run_id -> agentsam_workflow_runs.id; "
    "agentsam_plan_tasks.execution_step_id -> agentsam_execution_steps.id; "
    "agentsam_approval_queue.command_run_id -> agentsam_command_run.id; "
    "agentsam_approval_queue.execution_step_id -> agentsam_execution_steps.id"
)


def run_cmd(cmd: list[str], timeout: int = 120) -> dict[str, Any]:
    started = time.time()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(ROOT),
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "cmd": cmd,
            "duration_ms": round((time.time() - started) * 1000),
        }
    except Exception as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": "",
            "stderr": str(exc),
            "cmd": cmd,
            "duration_ms": round((time.time() - started) * 1000),
        }


def read_file(rel_path: str) -> str:
    path = ROOT / rel_path
    try:
        return path.read_text(errors="replace")
    except Exception:
        return ""


def parse_wrangler_json(stdout: str) -> list[dict[str, Any]]:
    text = (stdout or "").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except Exception:
        first_json = -1
        for marker in ("[", "{"):
            idx = text.find(marker)
            if idx >= 0 and (first_json < 0 or idx < first_json):
                first_json = idx
        if first_json < 0:
            return []
        try:
            parsed = json.loads(text[first_json:])
        except Exception:
            return []

    if isinstance(parsed, list) and parsed:
        item = parsed[0]
        if isinstance(item, dict):
            rows = item.get("results") or item.get("result") or []
            return rows if isinstance(rows, list) else []
    if isinstance(parsed, dict):
        rows = parsed.get("results") or parsed.get("result") or []
        return rows if isinstance(rows, list) else []
    return []


def d1_query(sql: str) -> dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    result = run_cmd(cmd, timeout=180)
    result["rows"] = parse_wrangler_json(result.get("stdout", ""))
    return result


def inspect_git() -> dict[str, Any]:
    status = run_cmd(["git", "status", "-sb"])
    porcelain = run_cmd(["git", "status", "--porcelain=v1"])
    log = run_cmd(["git", "log", "--oneline", "--decorate", "-5"])

    untracked = []
    modified = []
    for line in (porcelain.get("stdout") or "").splitlines():
        if line.startswith("?? "):
            untracked.append(line[3:])
        else:
            modified.append(line)

    return {
        "status_sb": (status.get("stdout") or "").strip(),
        "recent_log": (log.get("stdout") or "").strip(),
        "untracked": untracked,
        "modified": modified,
        "target_exists": (ROOT / TARGET_FILE).exists(),
        "target_untracked": TARGET_FILE in untracked,
    }


def inspect_imports() -> dict[str, Any]:
    needles = [
        "agentsam-plan-supabase-public-sync",
        "scheduleMirrorAgentChatPlanToSupabase",
        "patchD1WorkflowRunSupabaseMirrorState",
    ]
    files = {}
    for rel in IMPORT_FILES + [TARGET_FILE]:
        text = read_file(rel)
        hits = []
        for line_no, line in enumerate(text.splitlines(), 1):
            if any(n in line for n in needles):
                hits.append({"line": line_no, "text": line.strip()})
        files[rel] = {
            "exists": (ROOT / rel).exists(),
            "size": len(text.encode("utf-8")),
            "hits": hits,
        }
    return files


def inspect_d1(skip: bool) -> dict[str, Any]:
    if skip:
        return {"skipped": True}

    tables: dict[str, Any] = {}
    for table in AGENTSAM_TABLES:
        pragma = d1_query("PRAGMA table_info(%s);" % table)
        rows = pragma.get("rows") or []
        count = None
        if rows:
            count_rows = d1_query("SELECT COUNT(*) AS n FROM %s;" % table).get("rows") or []
            if count_rows:
                count = count_rows[0].get("n")
        tables[table] = {
            "exists": bool(rows),
            "count": count,
            "columns": [r.get("name") for r in rows],
        }

    spine_sql = """
SELECT
  COUNT(*) AS step_count,
  SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps
FROM agentsam_execution_steps s
LEFT JOIN agentsam_workflow_runs wr ON wr.id = s.execution_id;
"""
    spine_rows = d1_query(spine_sql).get("rows") or []

    plans_sql = """
SELECT
  p.id,
  p.title,
  p.status,
  p.workflow_run_id,
  COUNT(t.id) AS tasks,
  SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps,
  SUM(CASE WHEN t.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_wrun
FROM agentsam_plans p
LEFT JOIN agentsam_plan_tasks t ON t.plan_id = p.id
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT 5;
"""
    plan_rows = d1_query(plans_sql).get("rows") or []

    return {
        "skipped": False,
        "tables": tables,
        "spine_check": spine_rows[0] if spine_rows else {},
        "recent_plan_linkage": plan_rows,
    }


def table_breakdown(d1: dict[str, Any]) -> str:
    if d1.get("skipped"):
        return "D1 inspection skipped."

    lines = []
    tables = d1.get("tables") or {}
    for table in AGENTSAM_TABLES:
        info = tables.get(table) or {}
        status = "OK" if info.get("exists") else "MISS"
        count = info.get("count")
        columns = info.get("columns") or []
        col_preview = ", ".join(columns[:16])
        if len(columns) > 16:
            col_preview += ", ..."
        lines.append(f"- {table}: {status}; rows={count}; columns=[{col_preview}]")
    return "\n".join(lines)


def build_prompt(report: dict[str, Any]) -> str:
    git = report["git"]
    imports = report["imports"]
    d1 = report["d1"]

    import_lines = []
    for path, info in imports.items():
        import_lines.append(f"- {path}: exists={info['exists']}; size={info['size']}")
        for hit in info["hits"]:
            import_lines.append(f"  L{hit['line']}: {hit['text']}")

    lines = []
    lines.append("GEMINI TASK — FIX AGENT SAM DEPLOY FAILURE")
    lines.append("")
    lines.append("Read this entire brief before editing.")
    lines.append("")
    lines.append("Problem:")
    lines.append("- Deployment failed because CI/CD could not find src/core/agentsam-plan-supabase-public-sync.js.")
    lines.append("- The file exists locally but appears to be untracked.")
    lines.append("- src/core/agentsam-planner.js and src/core/agentsam-task-executor.js import/call the missing helper.")
    lines.append("- The imports were pushed, but the file was not.")
    lines.append("")
    lines.append("Goal:")
    lines.append("- Commit and push ONLY the missing helper file unless Sam explicitly says otherwise.")
    lines.append("- Do not include unrelated untracked scripts, artifacts, backups, or dashboard directories.")
    lines.append("- Do not deploy unless Sam explicitly asks.")
    lines.append("")
    lines.append("Git state:")
    lines.append(git.get("status_sb", ""))
    lines.append("")
    lines.append("Untracked files:")
    lines.append(json.dumps(git.get("untracked", []), indent=2))
    lines.append("")
    lines.append("Modified tracked files:")
    lines.append(json.dumps(git.get("modified", []), indent=2))
    lines.append("")
    lines.append("Target file state:")
    lines.append(json.dumps({
        "target_file": TARGET_FILE,
        "exists": git.get("target_exists"),
        "untracked": git.get("target_untracked"),
    }, indent=2))
    lines.append("")
    lines.append("Import/export evidence:")
    lines.append("\n".join(import_lines) if import_lines else "No import evidence found.")
    lines.append("")
    lines.append("Agent Sam D1 context:")
    lines.append("Canonical spine:")
    lines.append(CANONICAL_SPINE)
    lines.append("")
    lines.append("D1 table breakdown:")
    lines.append(table_breakdown(d1))
    lines.append("")
    lines.append("Spine check:")
    lines.append(json.dumps(d1.get("spine_check", {}), indent=2))
    lines.append("")
    lines.append("Recent plan linkage:")
    lines.append(json.dumps(d1.get("recent_plan_linkage", []), indent=2))
    lines.append("")
    lines.append("Implementation constraints:")
    lines.append("- No DB schema changes.")
    lines.append("- No wrangler.production.toml edits.")
    lines.append("- No model catalog changes.")
    lines.append("- No secrets in source.")
    lines.append("- No service role key in source.")
    lines.append("- Supabase plan mirror must be best-effort and must not break D1 execution.")
    lines.append("- Preserve D1 as source of truth.")
    lines.append("")
    lines.append("Exact safe action plan:")
    lines.append("1. git status -sb")
    lines.append("2. sed -n '1,260p' src/core/agentsam-plan-supabase-public-sync.js")
    lines.append("3. grep -RIn 'agentsam-plan-supabase-public-sync\\|scheduleMirrorAgentChatPlanToSupabase\\|patchD1WorkflowRunSupabaseMirrorState' src/core/agentsam-planner.js src/core/agentsam-task-executor.js src/core/agentsam-plan-supabase-public-sync.js")
    lines.append("4. grep -RIn 'SUPABASE_SERVICE_ROLE\\|service_role\\|Bearer .*eyJ\\|sk-' src/core/agentsam-plan-supabase-public-sync.js || true")
    lines.append("5. git add src/core/agentsam-plan-supabase-public-sync.js")
    lines.append("6. git diff --cached --name-only")
    lines.append("7. Confirm the only staged file is src/core/agentsam-plan-supabase-public-sync.js")
    lines.append("8. git commit -m 'fix(agent): add missing Supabase plan sync helper'")
    lines.append("9. git push origin main")
    lines.append("")
    lines.append("Final response required:")
    lines.append("- Confirm no secrets found.")
    lines.append("- Confirm imports/exports match.")
    lines.append("- Show staged file list.")
    lines.append("- Show commit hash.")
    lines.append("- Show push status.")
    lines.append("- Say deploy can be retried after push.")
    return "\n".join(lines)


def build_checklist() -> str:
    return """#!/usr/bin/env bash
set -euo pipefail

cd /Users/samprimeaux/inneranimalmedia

echo "[1/8] Git state"
git status -sb

echo "[2/8] Target file"
test -f src/core/agentsam-plan-supabase-public-sync.js
ls -lah src/core/agentsam-plan-supabase-public-sync.js

echo "[3/8] Import/export references"
grep -RIn 'agentsam-plan-supabase-public-sync\\|scheduleMirrorAgentChatPlanToSupabase\\|patchD1WorkflowRunSupabaseMirrorState' \
  src/core/agentsam-planner.js \
  src/core/agentsam-task-executor.js \
  src/core/agentsam-plan-supabase-public-sync.js

echo "[4/8] Secret scan"
if grep -RIn 'SUPABASE_SERVICE_ROLE\\|service_role\\|Bearer .*eyJ\\|sk-' src/core/agentsam-plan-supabase-public-sync.js; then
  echo "[FAIL] possible secret-like string found"
  exit 1
else
  echo "[OK] no obvious secret-like strings found"
fi

echo "[5/8] Stage only missing helper"
git add src/core/agentsam-plan-supabase-public-sync.js

echo "[6/8] Verify staged set"
git diff --cached --name-only
COUNT="$(git diff --cached --name-only | wc -l | tr -d ' ')"
ONLY="$(git diff --cached --name-only)"
if [ "$COUNT" != "1" ] || [ "$ONLY" != "src/core/agentsam-plan-supabase-public-sync.js" ]; then
  echo "[FAIL] staged set is not exactly src/core/agentsam-plan-supabase-public-sync.js"
  exit 1
fi

echo "[7/8] Commit"
git commit -m "fix(agent): add missing Supabase plan sync helper"

echo "[8/8] Push"
git push origin main

echo "[PASS] missing helper committed and pushed"
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-d1", action="store_true", help="Skip D1 inspection")
    args = parser.parse_args()

    print("Agent Sam Gemini Deploy Fix Brief Generator")
    print(f"repo: {ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("")

    print("[1/4] Inspecting git...")
    git = inspect_git()
    print(f"  target exists: {git['target_exists']}")
    print(f"  target untracked: {git['target_untracked']}")

    print("[2/4] Inspecting imports...")
    imports = inspect_imports()
    for path, info in imports.items():
        print(f"  {path}: exists={info['exists']} hits={len(info['hits'])}")

    print("[3/4] Inspecting D1...")
    d1 = inspect_d1(args.no_d1)
    if d1.get("skipped"):
        print("  skipped")
    else:
        print(f"  spine: {d1.get('spine_check')}")

    print("[4/4] Writing artifacts...")
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "root": str(ROOT),
        "target_file": TARGET_FILE,
        "canonical_spine": CANONICAL_SPINE,
        "git": git,
        "imports": imports,
        "d1": d1,
    }

    OUT_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True))
    OUT_PROMPT.write_text(build_prompt(report))
    OUT_CHECKLIST.write_text(build_checklist())
    OUT_CHECKLIST.chmod(0o755)

    print(f"  wrote {OUT_PROMPT}")
    print(f"  wrote {OUT_REPORT}")
    print(f"  wrote {OUT_CHECKLIST}")
    print("")
    print("[PASS] Gemini deploy-fix package generated")
    print("")
    print("Next:")
    print(f"  cat {OUT_PROMPT}")
    print(f"  bash {OUT_CHECKLIST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
