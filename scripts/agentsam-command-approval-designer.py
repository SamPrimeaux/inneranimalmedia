#!/usr/bin/env python3
"""
Agent Sam Approval-Backed Command Execution Designer

Purpose:
- Correctly recognizes the production table name: agentsam_command_run, not agentsam_command_runs.
- Inspects agentsam_approval_queue + agentsam_command_run + agentsam_commands + agentsam_command_pattern.
- Designs the safe opt-in execution path:
    plan task -> command_run -> approval_queue -> approved -> executeCommand/approved runner
- Generates:
    artifacts/agentsam-command-approval-design-report.json
    artifacts/agentsam-command-approval-design.md
    artifacts/agentsam-command-approval-cursor-brief.txt

Safe by default:
- No D1 writes.
- No terminal execution.
- No migrations.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List


REPO_ROOT = Path.cwd()
ARTIFACTS_DIR = REPO_ROOT / "artifacts"
REPORT_JSON = ARTIFACTS_DIR / "agentsam-command-approval-design-report.json"
REPORT_MD = ARTIFACTS_DIR / "agentsam-command-approval-design.md"
CURSOR_BRIEF = ARTIFACTS_DIR / "agentsam-command-approval-cursor-brief.txt"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in ("0", "false", "False", "no")

TABLES = [
    "agentsam_approval_queue",
    "agentsam_command_run",
    "agentsam_commands",
    "agentsam_command_pattern",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_workflow_runs",
    "agentsam_execution_steps",
    "agentsam_tool_chain",
]


def run_cmd(cmd: List[str], timeout: int = 60) -> Dict[str, Any]:
    start = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(REPO_ROOT), text=True, capture_output=True, timeout=timeout)
        return {
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }
    except Exception as e:
        return {
            "ok": False,
            "returncode": None,
            "stdout": "",
            "stderr": str(e),
            "duration_ms": round((time.time() - start) * 1000),
            "cmd": cmd,
        }


def d1_sql(sql: str, timeout: int = 60) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    return run_cmd(cmd, timeout=timeout)


def parse_jsonish(stdout: str) -> Any:
    text = stdout.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass
    first = min([i for i in [text.find("["), text.find("{")] if i >= 0], default=-1)
    if first >= 0:
        try:
            return json.loads(text[first:])
        except Exception:
            return None
    return None


def rows(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    parsed = parse_jsonish(result.get("stdout", ""))
    if isinstance(parsed, list) and parsed:
        return parsed[0].get("results") or parsed[0].get("result") or []
    if isinstance(parsed, dict):
        return parsed.get("results") or parsed.get("result") or []
    return []


def schema(table: str) -> Dict[str, Any]:
    res = d1_sql(f"PRAGMA table_info({table});")
    r = rows(res)
    return {
        "table": table,
        "exists": bool(r),
        "columns": r,
        "column_names": [x.get("name") for x in r],
        "notnull": [x.get("name") for x in r if x.get("notnull")],
        "pk": [x.get("name") for x in r if x.get("pk")],
        "stderr": res.get("stderr", "")[-1000:],
    }


def count(table: str) -> Dict[str, Any]:
    res = d1_sql(f"SELECT COUNT(*) AS count FROM {table};")
    r = rows(res)
    return {"ok": res["ok"], "count": r[0].get("count") if r else None, "stderr": res.get("stderr", "")[-500:]}


def sample(table: str, cols: List[str], limit: int = 10) -> Dict[str, Any]:
    if not cols:
        return {"rows": []}
    preferred = [c for c in [
        "id", "tenant_id", "workspace_id", "user_id", "session_id",
        "plan_id", "todo_id", "workflow_run_id", "command_run_id",
        "selected_command_id", "selected_command_slug",
        "tool_name", "tool_key", "action_summary", "risk_level",
        "requires_confirmation", "approval_status", "status", "approved_by",
        "decided_at", "expires_at", "created_at", "output_text", "error_message",
    ] if c in cols]
    selected = preferred or cols[:12]
    order = " ORDER BY created_at DESC" if "created_at" in cols else ""
    res = d1_sql(f"SELECT {', '.join(selected)} FROM {table}{order} LIMIT {limit};")
    return {"columns": selected, "rows": rows(res), "stderr": res.get("stderr", "")[-500:]}


def grep(pattern: str) -> List[Dict[str, Any]]:
    rx = re.compile(pattern)
    hits = []
    roots = [REPO_ROOT / "src", REPO_ROOT / "scripts"]
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if not p.is_file() or p.suffix not in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py"}:
                continue
            if any(part in {".git", "node_modules", "dist", "build", ".wrangler"} for part in p.parts):
                continue
            try:
                text = p.read_text(errors="ignore")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if rx.search(line):
                    hits.append({"path": str(p.relative_to(REPO_ROOT)), "line": i, "text": line.strip()[:500]})
    return hits


def analyze(schemas: Dict[str, Any], counts: Dict[str, Any], samples: Dict[str, Any], code: Dict[str, Any]) -> Dict[str, Any]:
    issues = []
    ok = []

    def has(table: str, col: str) -> bool:
        return col in schemas.get(table, {}).get("column_names", [])

    if schemas["agentsam_command_run"]["exists"]:
        ok.append("agentsam_command_run exists and is the command execution ledger.")
    else:
        issues.append({
            "priority": "P0",
            "issue": "agentsam_command_run missing.",
            "fix": "Cannot build approval-backed terminal execution until command run ledger exists.",
        })

    if schemas["agentsam_approval_queue"]["exists"]:
        ok.append("agentsam_approval_queue exists and links to agentsam_command_run through command_run_id.")
    else:
        issues.append({
            "priority": "P0",
            "issue": "agentsam_approval_queue missing.",
            "fix": "Keep terminal task execution disabled.",
        })

    required_approval_cols = ["status", "command_run_id", "tool_name", "action_summary", "risk_level", "expires_at"]
    missing_approval = [c for c in required_approval_cols if not has("agentsam_approval_queue", c)]
    if missing_approval:
        issues.append({
            "priority": "P1",
            "issue": f"agentsam_approval_queue missing expected columns: {missing_approval}",
            "fix": "Use available columns only; do not assume full approval linkage.",
        })

    required_run_cols = ["id", "approval_status", "requires_confirmation", "selected_command_slug", "risk_level", "success", "exit_code", "output_text"]
    missing_run = [c for c in required_run_cols if not has("agentsam_command_run", c)]
    if missing_run:
        issues.append({
            "priority": "P1",
            "issue": f"agentsam_command_run missing expected columns: {missing_run}",
            "fix": "Use status/approval fields that exist; otherwise treat as not approved.",
        })

    if has("agentsam_approval_queue", "plan_id"):
        ok.append("approval_queue.plan_id exists, but it references agentsam_plans_old; use cautiously.")
        issues.append({
            "priority": "P2",
            "issue": "agentsam_approval_queue.plan_id references agentsam_plans_old, not agentsam_plans.",
            "fix": "Do not depend on plan_id FK for new planner linkage. Prefer command_run_id, workflow_run_id, execution_step_id, or JSON references.",
        })

    if not code["execute_command_refs"]:
        issues.append({
            "priority": "P1",
            "issue": "No executeCommand references found by grep.",
            "fix": "Find the actual approved runner before enabling execution. Do not call PTY directly.",
        })
    else:
        ok.append(f"Found {len(code['execute_command_refs'])} executeCommand references.")

    direct_pty_in_executor = [
        h for h in code["terminal_exec_refs"]
        if h["path"].endswith("agentsam-task-executor.js") and ("/exec" in h["text"] or "TERMINAL_WS_URL" in h["text"])
    ]
    if direct_pty_in_executor:
        issues.append({
            "priority": "P0",
            "issue": "Task executor still appears to reference direct PTY execution.",
            "fix": "Remove direct PTY calls from autonomous task execution.",
            "hits": direct_pty_in_executor,
        })
    else:
        ok.append("No direct PTY execution detected in agentsam-task-executor.js.")

    return {
        "ok": ok,
        "issues": issues,
        "safe_execution_contract": {
            "approval_source": "agentsam_approval_queue.status='approved' joined to agentsam_command_run.id through command_run_id",
            "execution_ledger": "agentsam_command_run",
            "command_registry": "agentsam_commands",
            "pattern_registry": "agentsam_command_pattern",
            "never_execute_if": [
                "approval_queue row missing",
                "approval_queue.status != approved",
                "approval_queue.expires_at < unixepoch()",
                "command_run.approval_status in pending/pending_approval/denied/rejected/not_required for risky commands",
                "agentsam_commands.requires_approval=1 and no approved approval_queue row",
                "agentsam_commands.risk_level in high/critical and no approved approval_queue row",
            ],
            "task_executor_behavior": [
                "terminal task creates/proposes command_run + approval_queue, or links to existing approved command_run",
                "terminal task does not call PTY directly",
                "if approved, delegate to existing executeCommand/approved runner only",
                "if not approved, mark skipped/approval_required and emit nonfatal task_complete",
            ],
        },
    }


def markdown(report: Dict[str, Any]) -> str:
    lines = []
    lines.append("# Agent Sam Approval-Backed Command Execution Design")
    lines.append("")
    lines.append(f"Generated: `{report['generated_at']}`")
    lines.append("")
    lines.append("## Core finding")
    lines.append("")
    lines.append("Production uses `agentsam_command_run` singular, not `agentsam_command_runs` plural.")
    lines.append("")
    lines.append("`agentsam_approval_queue.command_run_id` references `agentsam_command_run(id)`, so this is the correct approval-backed terminal execution ledger.")
    lines.append("")
    lines.append("## Table counts")
    lines.append("")
    lines.append("| Table | Exists | Rows |")
    lines.append("|---|---:|---:|")
    for t in TABLES:
        lines.append(f"| `{t}` | {report['schemas'][t]['exists']} | {report['counts'][t].get('count')} |")
    lines.append("")
    lines.append("## Safe execution contract")
    lines.append("")
    contract = report["analysis"]["safe_execution_contract"]
    lines.append(f"- Approval source: `{contract['approval_source']}`")
    lines.append(f"- Execution ledger: `{contract['execution_ledger']}`")
    lines.append(f"- Command registry: `{contract['command_registry']}`")
    lines.append("")
    lines.append("Never execute when:")
    lines.extend([f"- {x}" for x in contract["never_execute_if"]])
    lines.append("")
    lines.append("Task executor behavior:")
    lines.extend([f"- {x}" for x in contract["task_executor_behavior"]])
    lines.append("")
    lines.append("## Issues")
    lines.append("")
    if not report["analysis"]["issues"]:
        lines.append("No blocking issues detected.")
    else:
        lines.append("| Priority | Issue | Fix |")
        lines.append("|---|---|---|")
        for issue in report["analysis"]["issues"]:
            lines.append(f"| {issue['priority']} | {issue['issue']} | {issue['fix']} |")
    lines.append("")
    lines.append("## Cursor implementation brief")
    lines.append("")
    lines.append("See `artifacts/agentsam-command-approval-cursor-brief.txt`.")
    lines.append("")
    return "\n".join(lines)


def cursor_brief() -> str:
    return """Implement approval-backed terminal execution using the real production schema.

Critical correction:
- The command run table is singular: agentsam_command_run.
- Do not use agentsam_command_runs.

Relevant production schemas:
- agentsam_approval_queue.command_run_id REFERENCES agentsam_command_run(id)
- agentsam_command_run has approval_status, requires_confirmation, selected_command_id, selected_command_slug, risk_level, success, exit_code, output_text, error_message, tenant_id, user_id.
- agentsam_commands has requires_approval, risk_level, mapped_command, command_args, workflow_key, route_key, tool_key, execution_mode.

Goal:
Terminal plan tasks may execute only if tied to an approved agentsam_command_run through agentsam_approval_queue.

Hard rules:
- Do not call PTY /exec directly from src/core/agentsam-task-executor.js.
- Do not create agentsam_command_runs plural.
- Do not add DB columns.
- Do not rely on agentsam_approval_queue.plan_id for new planner linkage because it references agentsam_plans_old.
- Prefer command_run_id linkage.
- If no approved approval_queue row exists, terminal task remains skipped/approval_required.

Create helper:
  src/core/agentsam-command-approval.js

Exports:
  findApprovedCommandRunForTask(env, { task, planId, userId, tenantId, workspaceId })
  createCommandRunApprovalProposal(env, { task, planId, userId, tenantId, workspaceId, sessionId })
  executeApprovedCommandRun(env, { commandRun, task, userId, tenantId, workspaceId })

findApprovedCommandRunForTask:
- Look for agentsam_approval_queue rows where:
  status='approved'
  expires_at > unixepoch() when expires_at exists
  tenant_id matches
  workspace_id matches if present/non-null
  user_id matches if present
  command_run_id is not null
- Join agentsam_command_run on command_run_id.
- Match the current task by best available evidence:
  1. command_run.result_json / commands_json / user_input / normalized_intent contains task.id
  2. selected_command_slug equals task.handler_key
  3. user_input or commands_json contains task.handler_key or task.description
  4. approval_queue.action_summary/input_json contains task.id or task.title
- Reject rows with approval_status in ('denied','rejected','pending','pending_approval') when present.
- Reject rows where success=1 and output_text exists if already completed unless you are only returning prior output.

createCommandRunApprovalProposal:
- Insert into agentsam_command_run:
  workspace_id, session_id if available, user_input, normalized_intent, intent_category,
  commands_json, selected_command_slug, risk_level, requires_confirmation=1,
  approval_status='pending_approval', tenant_id, user_id.
- Insert into agentsam_approval_queue:
  tenant_id, workspace_id, user_id, session_id,
  command_run_id, tool_name='terminal', tool_key=task.handler_key,
  action_summary, input_json, risk_level, approval_type='command',
  status='pending', expires_at=unixepoch()+300.
- Use only columns that exist if implementing schema-aware code.

executeApprovedCommandRun:
- Prefer existing executeCommand/approved runner if present.
- If executeCommand returns pending_approval, do not execute.
- Never call env.TERMINAL_WS_URL directly from this helper unless that is already the existing approved runner path with allowlist/telemetry.
- Update agentsam_command_run result/success/output/error only if the runner does not already do it.

Modify src/core/agentsam-task-executor.js:
- For handler_type='terminal':
  1. call findApprovedCommandRunForTask.
  2. if none, call createCommandRunApprovalProposal if no proposal exists, mark task skipped/approval_required, emit task_complete with status skipped/approval_required and command_run_id/approval_id if created.
  3. if approved, call executeApprovedCommandRun.
  4. on success, mark task done and include command_run_id.
  5. on failure, mark blocked/failed.

Validation:
- Grep must show no direct /exec or TERMINAL_WS_URL execution in agentsam-task-executor.js.
- Terminal task with no approval creates proposal and does not execute.
- Pending approval does not execute.
- Approved queue row linked to command_run_id can execute only through approved runner.
"""


def main() -> int:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    if not shutil.which("npx") or not (REPO_ROOT / WRANGLER_CONFIG).exists():
        print("[FAIL] Run from repo root with npx and wrangler.production.toml available.")
        return 2

    print("Agent Sam Approval-Backed Command Execution Designer")
    print(f"repo: {REPO_ROOT}")
    print(f"d1: {D1_DB} remote={D1_REMOTE} config={WRANGLER_CONFIG}")
    print("")

    schemas = {}
    counts = {}
    samples = {}
    print("[1/4] Inspecting tables...")
    for t in TABLES:
        schemas[t] = schema(t)
        counts[t] = count(t) if schemas[t]["exists"] else {"count": None}
        samples[t] = sample(t, schemas[t]["column_names"]) if schemas[t]["exists"] else {"rows": []}
        print(f"  {'OK' if schemas[t]['exists'] else 'MISS'} {t} rows={counts[t].get('count')}")

    print("[2/4] Grepping code...")
    code = {
        "execute_command_refs": grep(r"function executeCommand|export async function executeCommand|executeCommand\("),
        "approval_refs": grep(r"agentsam_approval_queue|approval_status|pending_approval|approved_by|decided_at"),
        "command_run_refs": grep(r"agentsam_command_run\b|command_run_id|selected_command_slug"),
        "terminal_exec_refs": grep(r"TERMINAL_WS_URL|TERMINAL_SECRET|/exec|PTY|pty"),
    }
    for k, v in code.items():
        print(f"  {k}: {len(v)} hits")

    print("[3/4] Analyzing safe contract...")
    analysis = analyze(schemas, counts, samples, code)
    p0 = [x for x in analysis["issues"] if x.get("priority") == "P0"]
    print(f"  issues={len(analysis['issues'])} P0={len(p0)}")

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {
            "d1_db": D1_DB,
            "wrangler_config": WRANGLER_CONFIG,
            "d1_remote": D1_REMOTE,
        },
        "schemas": schemas,
        "counts": counts,
        "samples": samples,
        "code": code,
        "analysis": analysis,
    }

    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    REPORT_MD.write_text(markdown(report))
    CURSOR_BRIEF.write_text(cursor_brief())

    print("[4/4] Wrote artifacts:")
    print(f"  {REPORT_JSON}")
    print(f"  {REPORT_MD}")
    print(f"  {CURSOR_BRIEF}")

    if p0:
        print("")
        print("[FAIL] P0 issues found. Keep terminal execution disabled.")
        return 2

    print("")
    print("[PASS] Approval design artifacts generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
