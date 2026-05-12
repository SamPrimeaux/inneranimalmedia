#!/usr/bin/env python3
"""
Agent Sam Supabase Direct Sync

Purpose:
  Take a D1-proven Agent Sam workflow run and actually write it to Supabase
  using SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

This is the missing "actually land Supabase" step.

It mirrors:
  D1 agentsam_workflows + workflow_nodes + workflow_edges
    -> Supabase public.agentsam_workflows.definition_json

  D1 agentsam_workflow_runs
    -> Supabase public.agentsam_workflow_runs

  D1 agentsam_execution_steps
    -> Supabase public.agentsam_workflow_steps

  D1 execution step events
    -> Supabase public.agentsam_workflow_events

  One proof snapshot
    -> Supabase public.agentsam_debug_snapshots

It does NOT execute terminal commands.
It does NOT approve anything.
It does NOT require psql.
It uses Supabase REST/PostgREST with your service_role key from env.

Required env:
  export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

Optional env:
  export IAM_D1_DB="inneranimalmedia-business"
  export IAM_WRANGLER_CONFIG="wrangler.production.toml"
  export IAM_D1_REMOTE=1
  export IAM_WORKFLOW_KEY="agent_chat_plan"
  export IAM_WORKFLOW_ID="wf_agent_chat_plan"

Usage:
  # Dry-run latest agent_chat_plan run:
  python3 scripts/agentsam-supabase-direct-sync.py --latest --dry-run

  # Apply latest agent_chat_plan run:
  python3 scripts/agentsam-supabase-direct-sync.py --latest --apply

  # Apply specific run:
  python3 scripts/agentsam-supabase-direct-sync.py --run-id wrun_true_e2e_20260512070948 --apply

  # Verify only:
  python3 scripts/agentsam-supabase-direct-sync.py --run-id wrun_true_e2e_20260512070948 --verify

Outputs:
  artifacts/agentsam-supabase-direct-sync-report.json
  artifacts/agentsam-supabase-direct-sync-report.md
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"
REPORT_JSON = ARTIFACTS / "agentsam-supabase-direct-sync-report.json"
REPORT_MD = ARTIFACTS / "agentsam-supabase-direct-sync-report.md"
PAYLOAD_JSON = ARTIFACTS / "agentsam-supabase-direct-sync-payload.json"

D1_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
D1_REMOTE = os.getenv("IAM_D1_REMOTE", "1") not in {"0", "false", "False", "no"}

WORKFLOW_KEY = os.getenv("IAM_WORKFLOW_KEY", "agent_chat_plan")
WORKFLOW_ID = os.getenv("IAM_WORKFLOW_ID", "wf_agent_chat_plan")

DEFAULT_TENANT = os.getenv("IAM_TENANT_ID", "tenant_sam_primeaux")
DEFAULT_WORKSPACE = os.getenv("IAM_WORKSPACE_ID", "global")


# -----------------------------
# Shell / D1 helpers
# -----------------------------

def run_cmd(cmd: List[str], timeout: int = 120) -> Dict[str, Any]:
    start = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(ROOT), text=True, capture_output=True, timeout=timeout)
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


def require_ready() -> None:
    if not shutil.which("npx"):
        raise SystemExit("[FAIL] npx not found")
    if not (ROOT / WRANGLER_CONFIG).exists():
        raise SystemExit(f"[FAIL] {WRANGLER_CONFIG} not found. Run from repo root.")


def d1_sql(sql: str, timeout: int = 120) -> Dict[str, Any]:
    cmd = ["npx", "wrangler", "d1", "execute", D1_DB]
    if D1_REMOTE:
        cmd.append("--remote")
    cmd.extend(["-c", WRANGLER_CONFIG, "--json", "--command", sql])
    return run_cmd(cmd, timeout=timeout)


def parse_rows(res: Dict[str, Any]) -> List[Dict[str, Any]]:
    text = (res.get("stdout") or "").strip()
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


def sqlq(v: str) -> str:
    return "'" + str(v).replace("'", "''") + "'"


def maybe_json(v: Any, fallback: Any) -> Any:
    if v is None:
        return fallback
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return fallback
        try:
            return json.loads(s)
        except Exception:
            return fallback
    return fallback


# -----------------------------
# Supabase REST helpers
# -----------------------------

def get_supabase_env() -> Tuple[str, str]:
    url = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url:
        raise SystemExit("[FAIL] SUPABASE_URL is not set")
    if not key:
        raise SystemExit("[FAIL] SUPABASE_SERVICE_ROLE_KEY is not set")
    if "service_role" in key.lower():
        # Some people accidentally paste the label instead of value.
        pass
    return url, key


def supabase_request(method: str, table: str, *,
                     payload: Optional[Any] = None,
                     query: str = "",
                     prefer: str = "return=representation",
                     timeout: int = 60) -> Dict[str, Any]:
    base, key = get_supabase_env()
    url = f"{base}/rest/v1/{table}{query}"
    data = None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": prefer,
    }
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            parsed = json.loads(raw) if raw else None
            return {"ok": 200 <= resp.status < 300, "status": resp.status, "data": parsed, "raw": raw, "url": url}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return {"ok": False, "status": e.code, "error": raw, "url": url}
    except Exception as e:
        return {"ok": False, "status": None, "error": str(e), "url": url}


def upsert(table: str, rows: List[Dict[str, Any]], on_conflict: str = "id") -> Dict[str, Any]:
    if not rows:
        return {"ok": True, "status": 204, "data": [], "skipped": True}
    query = "?on_conflict=" + urllib.parse.quote(on_conflict)
    return supabase_request(
        "POST",
        table,
        payload=rows,
        query=query,
        prefer="resolution=merge-duplicates,return=representation",
    )


def select_count(table: str, filter_query: str) -> Dict[str, Any]:
    # Exact=false count via count header is awkward in urllib. Just select minimal rows.
    return supabase_request("GET", table, query=filter_query, prefer="return=representation")


# -----------------------------
# D1 fetch
# -----------------------------

def latest_agent_chat_run_id() -> Optional[str]:
    rows = parse_rows(d1_sql(f"""
SELECT id
FROM agentsam_workflow_runs
WHERE workflow_key={sqlq(WORKFLOW_KEY)} OR workflow_id={sqlq(WORKFLOW_ID)}
ORDER BY created_at DESC
LIMIT 1;
""".strip()))
    return rows[0]["id"] if rows else None


def fetch_d1_bundle(run_id: str) -> Dict[str, Any]:
    workflow_rows = parse_rows(d1_sql(f"""
SELECT *
FROM agentsam_workflows
WHERE id={sqlq(WORKFLOW_ID)} OR workflow_key={sqlq(WORKFLOW_KEY)}
LIMIT 1;
""".strip()))
    workflow = workflow_rows[0] if workflow_rows else None

    nodes = parse_rows(d1_sql(f"""
SELECT n.*
FROM agentsam_workflow_nodes n
JOIN agentsam_workflows w ON w.id=n.workflow_id
WHERE w.workflow_key={sqlq(WORKFLOW_KEY)}
ORDER BY n.sort_order, n.node_key;
""".strip()))

    edges = parse_rows(d1_sql(f"""
SELECT e.*
FROM agentsam_workflow_edges e
JOIN agentsam_workflows w ON w.id=e.workflow_id
WHERE w.workflow_key={sqlq(WORKFLOW_KEY)}
ORDER BY e.priority, e.from_node_key, e.to_node_key;
""".strip()))

    run_rows = parse_rows(d1_sql(f"""
SELECT *
FROM agentsam_workflow_runs
WHERE id={sqlq(run_id)}
LIMIT 1;
""".strip()))
    run = run_rows[0] if run_rows else None

    steps = parse_rows(d1_sql(f"""
SELECT *
FROM agentsam_execution_steps
WHERE execution_id={sqlq(run_id)}
ORDER BY created_at, node_key;
""".strip()))

    plan_rows = parse_rows(d1_sql(f"""
SELECT *
FROM agentsam_plans
WHERE workflow_run_id={sqlq(run_id)}
ORDER BY created_at DESC
LIMIT 1;
""".strip()))
    plan = plan_rows[0] if plan_rows else None

    tasks = []
    if plan:
        tasks = parse_rows(d1_sql(f"""
SELECT *
FROM agentsam_plan_tasks
WHERE plan_id={sqlq(plan["id"])}
ORDER BY order_index;
""".strip()))

    approvals = parse_rows(d1_sql(f"""
SELECT *
FROM agentsam_approval_queue
WHERE workflow_run_id={sqlq(run_id)}
   OR execution_step_id IN (SELECT id FROM agentsam_execution_steps WHERE execution_id={sqlq(run_id)})
ORDER BY created_at DESC;
""".strip()))

    command_runs = parse_rows(d1_sql(f"""
SELECT *
FROM agentsam_command_run
WHERE id IN (
  SELECT command_run_id FROM agentsam_approval_queue
  WHERE workflow_run_id={sqlq(run_id)}
     OR execution_step_id IN (SELECT id FROM agentsam_execution_steps WHERE execution_id={sqlq(run_id)})
)
ORDER BY created_at DESC;
""".strip()))

    return {
        "workflow": workflow,
        "nodes": nodes,
        "edges": edges,
        "run": run,
        "steps": steps,
        "plan": plan,
        "tasks": tasks,
        "approvals": approvals,
        "command_runs": command_runs,
    }


# -----------------------------
# Mapping
# -----------------------------

def iso_from_unix(v: Any) -> Optional[str]:
    if v is None:
        return None
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(v)))
    except Exception:
        return None


def normalize_workspace(v: Optional[str]) -> str:
    # Supabase defaults use ws_inneranimalmedia, but keep D1 value if present.
    return v or DEFAULT_WORKSPACE or "global"


def map_payload(bundle: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    workflow = bundle["workflow"]
    run = bundle["run"]
    steps = bundle["steps"]
    nodes = bundle["nodes"]
    edges = bundle["edges"]
    plan = bundle["plan"]
    tasks = bundle["tasks"]
    approvals = bundle["approvals"]
    command_runs = bundle["command_runs"]

    if not workflow:
        raise RuntimeError("D1 workflow template not found")
    if not run:
        raise RuntimeError("D1 workflow run not found")

    tenant_id = run.get("tenant_id") or workflow.get("tenant_id") or DEFAULT_TENANT
    workspace_id = normalize_workspace(run.get("workspace_id") or workflow.get("workspace_id"))

    workflow_row = {
        "id": "sb_" + workflow["id"],
        "d1_workflow_id": workflow["id"],
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "workflow_key": workflow.get("workflow_key") or WORKFLOW_KEY,
        "name": workflow.get("display_name") or workflow.get("workflow_key") or WORKFLOW_KEY,
        "description": workflow.get("description"),
        "status": "active" if int(workflow.get("is_active") or 1) else "inactive",
        "trigger_type": workflow.get("trigger_type") or "agent",
        "definition_json": {
            "d1_workflow": workflow,
            "nodes": nodes,
            "edges": edges,
            "source": "d1",
            "spine": "agentsam_workflow_runs.id -> agentsam_execution_steps.execution_id",
        },
        "metadata": {
            "source": "agentsam-supabase-direct-sync.py",
            "plan_id": plan.get("id") if plan else None,
        },
    }

    run_input = maybe_json(run.get("input_json"), {})
    run_output = maybe_json(run.get("output_json"), {})
    run_step_results = maybe_json(run.get("step_results_json"), [])

    run_row = {
        "id": run["id"],
        "d1_run_id": run["id"],
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "workflow_id": workflow_row["id"],  # Supabase workflow ID, not D1 template ID.
        "workflow_key": run.get("workflow_key") or WORKFLOW_KEY,
        "display_name": run.get("display_name") or "Agent Sam Workflow Run",
        "trigger_type": run.get("trigger_type") or "agent",
        "status": run.get("status") or "running",
        "input_json": run_input,
        "output_json": run_output,
        "step_results_json": run_step_results,
        "steps_completed": run.get("steps_completed") or 0,
        "steps_total": run.get("steps_total") or len(steps),
        "error_message": run.get("error_message"),
        "model_used": run.get("model_used"),
        "input_tokens": run.get("input_tokens") or 0,
        "output_tokens": run.get("output_tokens") or 0,
        "cost_usd": run.get("cost_usd") or 0,
        "duration_ms": run.get("duration_ms"),
        "environment": run.get("environment") or "production",
        "retry_count": run.get("retry_count") or 0,
        "parent_run_id": run.get("parent_run_id"),
        "started_at": iso_from_unix(run.get("started_at")),
        "completed_at": iso_from_unix(run.get("completed_at")),
        "supabase_sync_status": "synced",
        "supabase_synced_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "session_id": run.get("session_id"),
        "conversation_id": run.get("conversation_id"),
        "user_id": run.get("user_id"),
        "run_group_id": run.get("run_group_id"),
        "mode": run.get("mode"),
        "provider": run.get("provider"),
        "model_key": run.get("model_key"),
        "total_tokens": (run.get("input_tokens") or 0) + (run.get("output_tokens") or 0),
        "estimated_cost_usd": run.get("cost_usd") or 0,
        "latency_ms": run.get("duration_ms"),
        "metadata": {
            "source": "agentsam-supabase-direct-sync.py",
            "d1_workflow_id": run.get("workflow_id"),
            "d1_plan_id": plan.get("id") if plan else None,
            "approval_ids": [a.get("id") for a in approvals],
            "command_run_ids": [c.get("id") for c in command_runs],
        },
    }

    task_by_step = {t.get("execution_step_id"): t for t in tasks}
    step_rows = []
    event_rows = []
    for idx, step in enumerate(steps):
        inp = maybe_json(step.get("input_json"), {})
        out = maybe_json(step.get("output_json"), {})
        err = maybe_json(step.get("error_json"), {})
        task = task_by_step.get(step.get("id"))
        handler_key = inp.get("handler_key") or (task or {}).get("handler_key")
        model_key = handler_key if str(handler_key or "").startswith("gpt-") else None

        step_rows.append({
            "id": step["id"],
            "run_id": run["id"],
            "tenant_id": tenant_id,
            "workspace_id": workspace_id,
            "step_index": idx,
            "step_key": step.get("node_key"),
            "step_type": step.get("node_type") or "agent",
            "status": step.get("status") or "started",
            "tool_key": handler_key,
            "command_key": handler_key,
            "provider": "openai" if model_key else None,
            "model_key": model_key,
            "input_json": inp,
            "output_json": out,
            "error_message": json.dumps(err, separators=(",", ":")) if err else None,
            "latency_ms": step.get("latency_ms"),
            "metadata": {
                "d1_execution_id": step.get("execution_id"),
                "approval_id": step.get("approval_id"),
                "plan_task_id": (task or {}).get("id"),
            },
        })

        event_rows.append({
            "id": "wfe_" + step["id"],
            "run_id": run["id"],
            "step_id": step["id"],
            "tenant_id": tenant_id,
            "workspace_id": workspace_id,
            "event_type": "step_" + str(step.get("status") or "updated"),
            "event_level": "info",
            "message": f"Step {step.get('node_key')} is {step.get('status')}",
            "payload_json": {
                "node_key": step.get("node_key"),
                "node_type": step.get("node_type"),
                "status": step.get("status"),
                "approval_id": step.get("approval_id"),
                "source": "d1_mirror",
            },
        })

    snapshot_row = {
        "id": "dbg_" + run["id"].replace("-", "_"),
        "tenant_id": tenant_id,
        "workspace_id": workspace_id,
        "run_id": run["id"],
        "snapshot_key": "d1_parity_" + run["id"],
        "source": "agentsam-supabase-direct-sync.py",
        "status": "captured",
        "request_json": {
            "workflow_run_id": run["id"],
            "workflow_key": run.get("workflow_key"),
            "plan_id": plan.get("id") if plan else None,
        },
        "response_json": {
            "steps": len(steps),
            "tasks": len(tasks),
            "approvals": len(approvals),
            "command_runs": len(command_runs),
        },
        "environment_json": {
            "d1_db": D1_DB,
            "supabase_project": "dpmuvynqixblxsilnlut",
        },
        "notes": "D1 to Supabase direct parity sync for Agent Sam workflow run.",
    }

    return {
        "agentsam_workflows": [workflow_row],
        "agentsam_workflow_runs": [run_row],
        "agentsam_workflow_steps": step_rows,
        "agentsam_workflow_events": event_rows,
        "agentsam_debug_snapshots": [snapshot_row],
    }


# -----------------------------
# Sync / verify
# -----------------------------

def apply_payload(payload: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    order = [
        ("agentsam_workflows", "id"),
        ("agentsam_workflow_runs", "id"),
        ("agentsam_workflow_steps", "id"),
        ("agentsam_workflow_events", "id"),
        ("agentsam_debug_snapshots", "id"),
    ]
    results = {}
    for table, conflict in order:
        rows = payload.get(table, [])
        print(f"  upsert {table}: {len(rows)}")
        res = upsert(table, rows, on_conflict=conflict)
        results[table] = {
            "ok": res.get("ok"),
            "status": res.get("status"),
            "count": len(res.get("data") or []) if isinstance(res.get("data"), list) else None,
            "error": res.get("error"),
        }
        if not res.get("ok"):
            return {"ok": False, "failed_table": table, "results": results, "raw": res}
    return {"ok": True, "results": results}


def verify_supabase(run_id: str) -> Dict[str, Any]:
    workflow_q = "?select=id,d1_workflow_id,workflow_key&or=(d1_workflow_id.eq." + urllib.parse.quote(WORKFLOW_ID) + ",workflow_key.eq." + urllib.parse.quote(WORKFLOW_KEY) + ")"
    run_q = "?select=id,d1_run_id,workflow_key,status&or=(id.eq." + urllib.parse.quote(run_id) + ",d1_run_id.eq." + urllib.parse.quote(run_id) + ")"
    steps_q = "?select=id,run_id,step_key,status&run_id=eq." + urllib.parse.quote(run_id)
    events_q = "?select=id,run_id,event_type&run_id=eq." + urllib.parse.quote(run_id)
    snaps_q = "?select=id,run_id,snapshot_key&run_id=eq." + urllib.parse.quote(run_id)

    checks = {
        "agentsam_workflows": supabase_request("GET", "agentsam_workflows", query=workflow_q),
        "agentsam_workflow_runs": supabase_request("GET", "agentsam_workflow_runs", query=run_q),
        "agentsam_workflow_steps": supabase_request("GET", "agentsam_workflow_steps", query=steps_q),
        "agentsam_workflow_events": supabase_request("GET", "agentsam_workflow_events", query=events_q),
        "agentsam_debug_snapshots": supabase_request("GET", "agentsam_debug_snapshots", query=snaps_q),
    }
    summary = {}
    for table, res in checks.items():
        data = res.get("data")
        summary[table] = len(data) if isinstance(data, list) else None
    return {"summary": summary, "raw": checks}


def write_report(report: Dict[str, Any]) -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, indent=2, sort_keys=True))
    lines = [
        "# Agent Sam Supabase Direct Sync Report",
        "",
        f"Generated: `{report['generated_at']}`",
        f"Run ID: `{report.get('run_id')}`",
        "",
        "## Verify Summary",
        "",
        "```json",
        json.dumps((report.get("verify") or {}).get("summary", {}), indent=2),
        "```",
        "",
        "## Apply Result",
        "",
        "```json",
        json.dumps(report.get("apply_result"), indent=2),
        "```",
    ]
    REPORT_MD.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", help="D1 workflow run id to sync.")
    parser.add_argument("--latest", action="store_true", help="Use latest D1 agent_chat_plan run.")
    parser.add_argument("--dry-run", action="store_true", help="Build payload only, do not apply.")
    parser.add_argument("--apply", action="store_true", help="Apply payload to Supabase.")
    parser.add_argument("--verify", action="store_true", help="Verify Supabase rows for run id.")
    args = parser.parse_args()

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    require_ready()

    run_id = args.run_id
    if not run_id and args.latest:
        run_id = latest_agent_chat_run_id()
    if not run_id:
        raise SystemExit("[FAIL] provide --run-id or --latest")

    print("Agent Sam Supabase Direct Sync")
    print(f"repo: {ROOT}")
    print(f"d1 run_id: {run_id}")
    print("")

    # Verify mode can run with only Supabase env; fetch bundle not needed but env still needed.
    if args.verify and not (args.apply or args.dry_run):
        verify = verify_supabase(run_id)
        report = {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "run_id": run_id,
            "apply_result": None,
            "verify": verify,
        }
        write_report(report)
        print(json.dumps(verify["summary"], indent=2))
        if verify["summary"].get("agentsam_workflow_runs", 0) >= 1 and verify["summary"].get("agentsam_workflow_steps", 0) >= 1:
            print("[PASS] Supabase rows found.")
            return 0
        print("[FAIL] Supabase rows missing.")
        return 2

    print("[1/4] Fetching D1 bundle...")
    bundle = fetch_d1_bundle(run_id)
    print(f"  workflow: {bool(bundle['workflow'])}")
    print(f"  run: {bool(bundle['run'])}")
    print(f"  steps: {len(bundle['steps'])}")
    print(f"  plan: {bool(bundle['plan'])}")
    print(f"  tasks: {len(bundle['tasks'])}")
    print(f"  approvals: {len(bundle['approvals'])}")
    print(f"  command_runs: {len(bundle['command_runs'])}")

    if not bundle["run"] or not bundle["workflow"] or not bundle["steps"]:
        raise SystemExit("[FAIL] D1 bundle incomplete; refusing to sync.")

    print("[2/4] Mapping Supabase payload...")
    payload = map_payload(bundle)
    PAYLOAD_JSON.write_text(json.dumps(payload, indent=2, sort_keys=True))
    for table, rows in payload.items():
        print(f"  {table}: {len(rows)}")

    apply_result = None
    if args.apply:
        print("[3/4] Applying to Supabase via REST service_role...")
        apply_result = apply_payload(payload)
        print(json.dumps(apply_result, indent=2))
        if not apply_result.get("ok"):
            verify = verify_supabase(run_id)
            report = {
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "run_id": run_id,
                "apply_result": apply_result,
                "verify": verify,
                "payload_path": str(PAYLOAD_JSON),
            }
            write_report(report)
            print("[FAIL] Supabase apply failed.")
            return 2
    else:
        print("[3/4] Dry-run only. Use --apply to write Supabase.")
        apply_result = {"ok": True, "dry_run": True}

    print("[4/4] Verifying Supabase rows...")
    verify = verify_supabase(run_id)
    print(json.dumps(verify["summary"], indent=2))

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": run_id,
        "apply_result": apply_result,
        "verify": verify,
        "payload_path": str(PAYLOAD_JSON),
    }
    write_report(report)

    if args.apply:
        expected_steps = len(payload["agentsam_workflow_steps"])
        ok = (
            verify["summary"].get("agentsam_workflows", 0) >= 1
            and verify["summary"].get("agentsam_workflow_runs", 0) >= 1
            and verify["summary"].get("agentsam_workflow_steps", 0) >= expected_steps
            and verify["summary"].get("agentsam_workflow_events", 0) >= expected_steps
            and verify["summary"].get("agentsam_debug_snapshots", 0) >= 1
        )
        if ok:
            print("[PASS] Supabase direct sync landed and verified.")
            return 0
        print("[FAIL] Supabase apply ran but verification counts are incomplete.")
        return 2

    print("[PASS] Dry-run payload generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
