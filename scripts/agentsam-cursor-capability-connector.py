#!/usr/bin/env python3
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
from typing import Any, Dict, List

ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in {"0", "false", "False", "no"}

INPUT_BRIEF = ARTIFACTS / "agentsam-capability-fabric-cursor-brief.txt"
INPUT_PLAN = ARTIFACTS / "agentsam-capability-fabric-plan.md"
INPUT_REPORT = ARTIFACTS / "agentsam-capability-fabric-report.json"
INPUT_MATRIX = ARTIFACTS / "agentsam-capability-fabric-matrix.csv"

OUT_PROMPT = ARTIFACTS / "agentsam-cursor-capability-connect-prompt.txt"
OUT_PLAN = ARTIFACTS / "agentsam-cursor-capability-connect-plan.md"
OUT_REPORT = ARTIFACTS / "agentsam-cursor-capability-connect-report.json"
OUT_VALIDATE = ARTIFACTS / "agentsam-cursor-capability-connect-validation.sh"

CORE_TARGETS = [
    "src/api/agent.js",
    "src/core/agentsam-planner.js",
    "src/core/agentsam-task-executor.js",
    "src/api/command-run-telemetry.js",
    "src/core/capability-router.js",
    "src/core/workspace-capability-actions/index.js",
    "src/core/workspace-capability-actions/excalidraw.js",
    "src/integrations/playwright.js",
    "src/queue/playwright-queue-job.js",
    "src/queue/dispatcher.js",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
    "dashboard/features/agent-chat/streamParsing.ts",
    "dashboard/features/agent-chat/types.ts",
    "dashboard/components/BrowserView.tsx",
    "dashboard/components/ExcalidrawView.tsx",
    "dashboard/components/MonacoSurface.tsx",
    "dashboard/components/MonacoEditorView.tsx",
]

SCRIPT_PROOFS = [
    "scripts/agentsam-agent-chat-plan-workflow.py",
    "scripts/agentsam-true-e2e-workflow-runner.py",
    "scripts/agentsam-supabase-direct-sync.py",
    "scripts/agentsam-capability-fabric-planner.py",
]

CAPABILITY_RULES = {
    "monaco": {
        "routing_terms": ["monaco", "editor", "patch", "file", "artifact", "open file", "write file"],
        "target_outputs": [
            "agentsam_plan_tasks.files_involved",
            "agentsam_execution_steps.output_json.patch",
            "agentsam_artifacts row/pointer when artifact table is available",
        ],
        "approval": "approval required only for repo mutation/file-write command path; planning/preview is safe",
    },
    "excalidraw": {
        "routing_terms": ["excalidraw", "diagram", "whiteboard", "canvas", "flowchart", "wireframe"],
        "target_outputs": [
            "agentsam_execution_steps.output_json.diagram_json",
            "agentsam_artifacts row/pointer for diagram artifact",
        ],
        "approval": "no terminal approval unless it writes files/deploys",
    },
    "browser": {
        "routing_terms": ["browser", "screenshot", "render", "capture", "preview", "dom", "console"],
        "target_outputs": [
            "agentsam_execution_steps.output_json.screenshot_url",
            "agentsam_execution_steps.output_json.dom_summary",
            "agentsam_execution_steps.output_json.console_errors",
            "agentsam_artifacts screenshot/capture pointer",
        ],
        "approval": "browser capture can run only through existing safe browser/capture service; no shell",
    },
    "playwright": {
        "routing_terms": ["playwright", "e2e", "test", "npx playwright", "browser test", "chromium"],
        "target_outputs": [
            "agentsam_command_run commands_json",
            "agentsam_approval_queue pending row",
            "agentsam_execution_steps.output_json.approval_id",
            "post-approval stdout/stderr/report artifact",
        ],
        "approval": "must create command_run + approval_queue and never run until Allow + server-side D1 verification",
    },
}

SIGNAL_PATTERNS = {
    "create_plan": r"createPlan|agentsam_plans|plan_created|create plan",
    "execute_plan": r"executePlan|agentsam_plan_tasks|task_start|task_complete",
    "workflow_run": r"agentsam_workflow_runs|workflow_run_id|workflowRunId|workflow_run",
    "execution_steps": r"agentsam_execution_steps|execution_step_id|executionStepId|approval_id",
    "approval": r"approval_queue|approval_required|command_run|approve|deny|plan-task/resume",
    "terminal": r"runTerminalCommand|TERMINAL_WS_URL|/exec|executeCommand|npx playwright",
    "supabase": r"supabase|SUPABASE|supabase_sync|agentsam-supabase-direct-sync",
    "sse": r"consumeAgentChatSseBody|EventSource|ReadableStream|TransformStream|type:",
    "artifact": r"agentsam_artifacts|artifact|r2_key|public_url",
}


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


def d1_ready() -> bool:
    return shutil.which("npx") is not None and (ROOT / WRANGLER_CONFIG).exists()


def d1_sql(sql: str) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    return run_cmd(cmd)


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


def read_text(path: Path) -> str:
    try:
        return path.read_text(errors="replace")
    except Exception:
        return ""


def load_inputs() -> Dict[str, Any]:
    out = {
        "brief_exists": INPUT_BRIEF.exists(),
        "plan_exists": INPUT_PLAN.exists(),
        "report_exists": INPUT_REPORT.exists(),
        "matrix_exists": INPUT_MATRIX.exists(),
        "brief": read_text(INPUT_BRIEF) if INPUT_BRIEF.exists() else "",
        "plan": read_text(INPUT_PLAN) if INPUT_PLAN.exists() else "",
        "report": {},
        "matrix": [],
    }
    if INPUT_REPORT.exists():
        try:
            out["report"] = json.loads(INPUT_REPORT.read_text())
        except Exception as e:
            out["report_error"] = str(e)
    if INPUT_MATRIX.exists():
        try:
            with INPUT_MATRIX.open() as f:
                out["matrix"] = list(csv.DictReader(f))
        except Exception as e:
            out["matrix_error"] = str(e)
    return out


def scan_target_file(rel: str) -> Dict[str, Any]:
    p = ROOT / rel
    exists = p.exists()
    text = read_text(p) if exists else ""
    lines = text.splitlines()

    signals: Dict[str, Any] = {}
    for name, pattern in SIGNAL_PATTERNS.items():
        rx = re.compile(pattern, re.I)
        examples = []
        for i, line in enumerate(lines, 1):
            if rx.search(line):
                examples.append({"line": i, "text": line.strip()[:220]})
                if len(examples) >= 12:
                    break
        signals[name] = {"count": len(rx.findall(text)), "examples": examples}

    capability_hits = {}
    lower = text.lower()
    for cap, spec in CAPABILITY_RULES.items():
        terms = [t for t in spec["routing_terms"] if t.lower() in lower]
        capability_hits[cap] = {"terms": terms, "score": len(terms)}

    return {
        "path": rel,
        "exists": exists,
        "size": len(text),
        "signals": signals,
        "capability_hits": capability_hits,
    }


def scan_targets() -> Dict[str, Any]:
    targets = CORE_TARGETS + SCRIPT_PROOFS
    return {rel: scan_target_file(rel) for rel in targets}


def inspect_d1() -> Dict[str, Any]:
    if not d1_ready():
        return {"available": False, "reason": "npx/config missing"}

    checks = {}

    spine_sql = (
        "SELECT COUNT(*) AS step_count, "
        "SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps "
        "FROM agentsam_execution_steps s "
        "LEFT JOIN agentsam_workflow_runs wr ON wr.id=s.execution_id;"
    )
    checks["spine"] = parse_rows(d1_sql(spine_sql))

    template_sql = (
        "SELECT id, workflow_key, display_name, is_active "
        "FROM agentsam_workflows "
        "WHERE id='wf_agent_chat_plan' OR workflow_key='agent_chat_plan' "
        "LIMIT 5;"
    )
    checks["agent_chat_plan_template"] = parse_rows(d1_sql(template_sql))

    scripts_sql = (
        "SELECT id, slug, name, path, purpose, runner, safe_to_run, length(body) AS body_chars "
        "FROM agentsam_scripts "
        "WHERE id IN ("
        "'script_agent_chat_plan_workflow_template',"
        "'script_true_e2e_workflow_runner',"
        "'script_supabase_direct_sync',"
        "'script_capability_fabric_planner'"
        ") ORDER BY id;"
    )
    checks["registered_proof_scripts"] = parse_rows(d1_sql(scripts_sql))

    skill_sql = (
        "SELECT id, name, slash_trigger, default_model_key, is_active, "
        "length(content_markdown) AS content_chars "
        "FROM agentsam_skill "
        "WHERE id='skill_agentsam_python_architect';"
    )
    checks["python_architect_skill"] = parse_rows(d1_sql(skill_sql))

    return {
        "available": True,
        "checks": checks,
    }


def summarize_connectors(scans: Dict[str, Any]) -> Dict[str, Any]:
    summary = {}
    for cap in CAPABILITY_RULES:
        top = []
        for path, info in scans.items():
            ch = info["capability_hits"][cap]
            signal_score = sum(v["count"] for v in info["signals"].values())
            if ch["score"] > 0 or signal_score > 0:
                top.append({
                    "path": path,
                    "exists": info["exists"],
                    "capability_score": ch["score"],
                    "terms": ch["terms"],
                    "signal_score": signal_score,
                    "key_signals": {k: v["count"] for k, v in info["signals"].items() if v["count"]},
                })
        summary[cap] = sorted(top, key=lambda x: (-x["capability_score"], -x["signal_score"], x["path"]))[:8]
    return summary


def build_validation_script() -> str:
    return f'''#!/usr/bin/env bash
set -euo pipefail

cd /Users/samprimeaux/inneranimalmedia

echo "[1/8] Git state"
git status -sb
git log --oneline --decorate -5

echo "[2/8] Validate workflow template"
python3 scripts/agentsam-agent-chat-plan-workflow.py --validate-only

echo "[3/8] Verify proven Supabase mirror"
python3 scripts/agentsam-supabase-direct-sync.py --run-id wrun_true_e2e_20260512070948 --verify

echo "[4/8] Verify execution spine has no orphan workflow steps"
npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CONFIG} \\
  --command "SELECT COUNT(*) AS step_count, SUM(CASE WHEN wr.id IS NULL THEN 1 ELSE 0 END) AS orphan_workflow_steps FROM agentsam_execution_steps s LEFT JOIN agentsam_workflow_runs wr ON wr.id = s.execution_id;"

echo "[5/8] Check newest plan/task linkage"
npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CONFIG} \\
  --command "SELECT p.id, p.title, p.status, p.workflow_run_id, COUNT(t.id) AS tasks, SUM(CASE WHEN t.execution_step_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_steps, SUM(CASE WHEN t.workflow_run_id IS NOT NULL THEN 1 ELSE 0 END) AS tasks_with_wrun FROM agentsam_plans p LEFT JOIN agentsam_plan_tasks t ON t.plan_id = p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 5;"

echo "[6/8] Check latest task -> step linkage"
npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CONFIG} \\
  --command "SELECT t.id, t.plan_id, t.workflow_run_id, t.execution_step_id, t.status AS task_status, t.command_run_id, s.execution_id AS step_wrun_id, s.node_key, s.node_type, s.status AS step_status, s.approval_id FROM agentsam_plan_tasks t LEFT JOIN agentsam_execution_steps s ON s.id = t.execution_step_id ORDER BY t.created_at DESC LIMIT 25;"

echo "[7/8] Check latest approvals"
npx wrangler d1 execute {D1_DB} --remote -c {WRANGLER_CONFIG} \\
  --command "SELECT a.id, a.status, a.command_run_id, a.workflow_run_id, a.execution_step_id, a.risk_level, r.approval_status, r.user_input FROM agentsam_approval_queue a LEFT JOIN agentsam_command_run r ON r.id = a.command_run_id ORDER BY a.created_at DESC LIMIT 15;"

echo "[8/8] Runtime safety grep"
grep -RIn "agentsam_command_runs\\|agentsam_executions.*execution_id\\|approval_status.*not_required.*terminal\\|runTerminalCommandViaHttpExec" \\
  src dashboard 2>/dev/null || true

echo "[DONE] Review outputs. New live runs must match proven spine."
'''


def build_prompt(report: Dict[str, Any]) -> str:
    connector_summary = report["connector_summary"]
    d1 = report["d1"]
    proof_lines = []
    if d1.get("available"):
        spine = (d1.get("checks", {}).get("spine") or [{}])[0]
        proof_lines.append(f"- existing execution steps: {spine.get('step_count')}")
        proof_lines.append(f"- orphan workflow steps: {spine.get('orphan_workflow_steps')}")
        proof_lines.append(f"- registered proof scripts: {len(d1.get('checks', {}).get('registered_proof_scripts', []))}")
        proof_lines.append(f"- python architect skill rows: {len(d1.get('checks', {}).get('python_architect_skill', []))}")

    def cap_block(cap: str) -> str:
        spec = CAPABILITY_RULES[cap]
        rows = connector_summary.get(cap, [])
        lines = [f"### {cap.upper()}"]
        lines.append(f"Approval rule: {spec['approval']}")
        lines.append("Target outputs:")
        for o in spec["target_outputs"]:
            lines.append(f"- {o}")
        lines.append("High-signal files:")
        for r in rows[:6]:
            terms = ", ".join(r["terms"]) or "signals only"
            sigs = ", ".join(f"{k}={v}" for k, v in r["key_signals"].items())
            lines.append(f"- {r['path']} — terms: {terms}; signals: {sigs}")
        return "\n".join(lines)

    target_lines = "\n".join(f"- {p}" for p in CORE_TARGETS)
    proof = "\n".join(proof_lines) if proof_lines else "- D1 not inspected by this connector script"

    return f"""AGENT SAM — CONNECT EXISTING CAPABILITY FABRIC INTO LIVE RUNTIME

Read this entire prompt before editing.

You are not designing new schema.
You are not generating new script variants.
You are not inventing a new execution spine.
You are wiring existing repo/DB capability surfaces into the proven Agent Sam execution fabric.

SOURCE ARTIFACTS:
- artifacts/agentsam-capability-fabric-cursor-brief.txt
- artifacts/agentsam-capability-fabric-plan.md
- artifacts/agentsam-capability-fabric-report.json
- artifacts/agentsam-capability-fabric-matrix.csv
- artifacts/agentsam-cursor-capability-connect-report.json
- artifacts/agentsam-cursor-capability-connect-plan.md

PROVEN DB FACTS:
{proof}

CANONICAL SPINE:
agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id
agentsam_plans.workflow_run_id -> agentsam_workflow_runs.id
agentsam_plan_tasks.workflow_run_id -> agentsam_workflow_runs.id
agentsam_plan_tasks.execution_step_id -> agentsam_execution_steps.id
agentsam_approval_queue.command_run_id -> agentsam_command_run.id
agentsam_approval_queue.execution_step_id -> agentsam_execution_steps.id

FK-SAFE RUNTIME ORDER:
1. create agentsam_workflow_runs
2. create agentsam_plans
3. create agentsam_execution_steps with approval_id NULL
4. create agentsam_command_run before any plan_task.command_run_id
5. create agentsam_plan_tasks
6. create agentsam_approval_queue
7. update agentsam_execution_steps.approval_id after approval_queue exists
8. mirror successful D1 runs to Supabase using scripts/agentsam-supabase-direct-sync.py mapping

DO NOT:
- add DB columns/tables
- create agentsam_command_runs plural
- use agentsam_executions as execution_steps parent
- bypass D1 approval
- run terminal/playwright before approval
- change model catalog
- change wrangler.production.toml
- create more Python scripts
- call direct OpenAI outside existing adapter layer

TARGET FILES TO CONNECT:
{target_lines}

CAPABILITY-SPECIFIC CONNECTIONS:

{cap_block("monaco")}

{cap_block("excalidraw")}

{cap_block("browser")}

{cap_block("playwright")}

IMPLEMENTATION TASKS:

P0 — Runtime spine helper
Create or reuse a small internal helper in src/core/agentsam-task-executor.js or src/core/agentsam-planner.js that creates the proven chain:
- workflow_run
- plan
- execution_steps with approval_id NULL
- command_run before plan_tasks if command-backed task exists
- plan_tasks
- approval_queue
- update execution_steps.approval_id after approval row exists

P0 — Planner task typing
Update planner/task mapping so user goals can classify into:
- monaco_edit
- excalidraw_diagram
- browser_capture
- playwright_validation

These can remain handler_type-compatible with existing CHECK constraints:
- Monaco: agent or mcp_tool
- Excalidraw: agent or mcp_tool
- Browser: mcp_tool or agent
- Playwright: terminal or script, but approval-gated

P0 — Capability execution behavior
For each task:
- mark execution_step running when task starts
- write structured output_json
- update plan_task output_summary
- update workflow_run step totals
- emit existing SSE event shape

P0 — Approval gate
For Playwright/terminal:
- create agentsam_command_run before plan_task references command_run_id
- create agentsam_approval_queue linked to command_run_id + execution_step_id
- emit approval_required
- do not run command
- Allow must server-verify approval_queue status, expiration, command_run_id, execution_step_id
- Deny must not run anything

P1 — Supabase mirror
After successful D1 chain creation/update, mirror using the same mapping as scripts/agentsam-supabase-direct-sync.py.
If sync fails, log/surface supabase_sync_status/supabase_sync_error where columns exist, but do not destroy the D1 run.

P1 — Dashboard task board
Ensure existing SSE consumer shows:
- plan_created
- task_start
- task_complete
- approval_required
- plan_task_resume_complete
- workflow_complete
- done

Task board should show:
- plan_id
- workflow_run_id
- task status
- approval state
- output artifact pointers

VALIDATION PROMPTS:
1. "create a Monaco edit plan for the Agent Sam chat task board without applying files"
2. "create an Excalidraw diagram plan for the Agent Sam execution spine"
3. "capture a browser screenshot of /dashboard/agent and summarize console errors"
4. "run a Playwright smoke test for /dashboard/agent"

VALIDATION COMMAND:
Run:
  bash artifacts/agentsam-cursor-capability-connect-validation.sh

DEPLOY:
If only Worker files changed:
  ./scripts/dev-deploy.sh --worker

If dashboard files changed:
  ./scripts/dev-deploy.sh --full

FINAL RESPONSE REQUIRED:
- files changed
- exact runtime chain implemented
- D1 validation output
- Supabase sync result
- approval behavior proof
- dashboard behavior proof
- git commit hash
- push status
- deploy status
- remaining risks

Do not say "should work."
Prove it with D1 rows.
"""


def build_plan_md(report: Dict[str, Any]) -> str:
    lines = []
    lines.append("# Agent Sam Cursor Capability Connection Plan")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append("")
    lines.append("## What this script did")
    lines.append("")
    lines.append("This script converted the capability scan into a Cursor-ready implementation package. It did not mutate D1 or deploy.")
    lines.append("")
    lines.append("## Generated files")
    lines.append("")
    lines.append(f"- `{OUT_PROMPT}` — paste this into Cursor")
    lines.append(f"- `{OUT_VALIDATE}` — run after Cursor changes/deploy")
    lines.append(f"- `{OUT_REPORT}` — full machine-readable scan")
    lines.append("")
    lines.append("## High-signal connector map")
    lines.append("")
    for cap, rows in report["connector_summary"].items():
        lines.append(f"### {cap}")
        lines.append("")
        for r in rows[:8]:
            lines.append(f"- `{r['path']}`")
            lines.append(f"  - terms: {', '.join(r['terms']) or 'none'}")
            lines.append(f"  - key signals: {r['key_signals']}")
        lines.append("")
    lines.append("## Cursor prompt")
    lines.append("")
    lines.append("Use:")
    lines.append("")
    lines.append("```bash")
    lines.append(f"cat {OUT_PROMPT}")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-d1", action="store_true", help="Skip D1 inspection")
    args = parser.parse_args()

    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    print("Agent Sam Cursor Capability Connector")
    print(f"repo: {ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("")

    print("[1/5] Loading capability artifacts...")
    inputs = load_inputs()
    for key in ["brief_exists", "plan_exists", "report_exists", "matrix_exists"]:
        print(f"  {key}: {inputs[key]}")

    print("[2/5] Scanning exact connector target files...")
    scans = scan_targets()
    for rel in CORE_TARGETS:
        info = scans.get(rel, {})
        print(f"  {'OK' if info.get('exists') else 'MISS'} {rel}")

    print("[3/5] Inspecting D1 proof/schema state...")
    d1 = {"available": False, "reason": "skipped"}
    if not args.no_d1:
        d1 = inspect_d1()
    print(f"  d1_available: {d1.get('available')}")
    if d1.get("available"):
        checks = d1.get("checks", {})
        spine_rows = checks.get("spine") or []
        spine = spine_rows[0] if isinstance(spine_rows, list) and spine_rows else {}
        print(f"  orphan_workflow_steps: {spine.get('orphan_workflow_steps')}")
        print(f"  proof_scripts: {len(checks.get('registered_proof_scripts') or [])}")
        print(f"  python_architect_skill: {len(checks.get('python_architect_skill') or [])}")

    print("[4/5] Building connector summary + Cursor prompt...")
    connector_summary = summarize_connectors(scans)
    for cap, rows in connector_summary.items():
        print(f"  {cap}: {len(rows)} high-signal files")

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
        },
        "inputs": {
            "brief_exists": inputs["brief_exists"],
            "plan_exists": inputs["plan_exists"],
            "report_exists": inputs["report_exists"],
            "matrix_exists": inputs["matrix_exists"],
            "matrix": inputs.get("matrix", []),
        },
        "target_scans": scans,
        "connector_summary": connector_summary,
        "d1": d1,
    }

    print("[5/5] Writing artifacts...")
    OUT_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True))
    OUT_PROMPT.write_text(build_prompt(report))
    OUT_PLAN.write_text(build_plan_md(report))
    OUT_VALIDATE.write_text(build_validation_script())
    OUT_VALIDATE.chmod(0o755)

    print(f"  wrote {OUT_PROMPT}")
    print(f"  wrote {OUT_PLAN}")
    print(f"  wrote {OUT_REPORT}")
    print(f"  wrote {OUT_VALIDATE}")
    print("")
    print("[PASS] Cursor capability connector package generated.")
    print("")
    print("Next:")
    print(f"  cat {OUT_PROMPT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
