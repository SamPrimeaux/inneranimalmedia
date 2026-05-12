#!/usr/bin/env python3
"""
Agent Sam Workflow E2E Smoke Test

What this proves:
1. D1 has the workflow graph.
2. D1 can create a real workflow run.
3. D1 can advance all workflow nodes.
4. Supabase is reachable.
5. The completed D1 run can be mirrored into Supabase.
6. D1 sync status can be updated to synced.

Requirements:
- Run from repo root.
- Wrangler logged in.
- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY exported in your shell.
- Existing D1 workflow:
  wf_agentsam_debug_mirror_e2e
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


DB_NAME = os.environ.get("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.environ.get("IAM_WRANGLER_CONFIG", "wrangler.production.toml")

WORKFLOW_ID = "wf_agentsam_debug_mirror_e2e"
WORKFLOW_KEY = "agentsam_debug_mirror_e2e"
TENANT_ID = "tenant_sam_primeaux"
WORKSPACE_ID = "ws_inneranimalmedia"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def run_cmd(args: list[str], input_text: str | None = None) -> str:
    proc = subprocess.run(
        args,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )

    if proc.returncode != 0:
        print(proc.stdout)
        raise RuntimeError(f"Command failed: {' '.join(args)}")

    return proc.stdout


def d1(sql: str) -> str:
    args = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--command",
        sql,
    ]
    return run_cmd(args)


def supabase_request(method: str, path: str, body: object | None = None) -> tuple[int, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in shell env. "
            "Export them before running this script."
        )

    url = f"{SUPABASE_URL}{path}"

    data = None
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, method=method, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")
        return e.code, text


def assert_supabase_ok(status: int, text: str, label: str) -> list[dict]:
    if status < 200 or status >= 300:
        raise RuntimeError(f"{label} failed: HTTP {status}\n{text}")

    if not text.strip():
        return []

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise RuntimeError(f"{label} returned non-JSON:\n{text}")

    if isinstance(parsed, list):
        return parsed

    return [parsed]


def validate_d1_workflow_exists() -> None:
    print("\n== 1. Validate D1 workflow graph exists ==")

    sql = f"""
SELECT
  w.id AS workflow_id,
  w.workflow_key,
  w.display_name,
  COUNT(n.id) AS node_count
FROM agentsam_workflows w
LEFT JOIN agentsam_workflow_nodes n ON n.workflow_id = w.id
WHERE w.id = '{WORKFLOW_ID}'
GROUP BY w.id, w.workflow_key, w.display_name;
"""
    out = d1(sql)
    print(out)

    if WORKFLOW_ID not in out:
        raise RuntimeError(f"Workflow {WORKFLOW_ID} not found in D1.")

    if "6" not in out:
        print("Warning: expected 6 nodes. Check output above.")


def create_d1_run() -> str:
    print("\n== 2. Create D1 workflow run ==")

    run_id = new_id("wrun")
    input_json = json.dumps(
        {
            "source": "python_e2e_smoke",
            "goal": "prove_agentsam_can_execute_and_mirror_workflow",
            "created_at": now_iso(),
        }
    ).replace("'", "''")

    metadata_json = json.dumps(
        {
            "script": "scripts/smoke/agentsam_workflow_e2e.py",
            "safe_to_delete": True,
            "workflow_id": WORKFLOW_ID,
        }
    ).replace("'", "''")

    sql = f"""
INSERT INTO agentsam_workflow_runs (
  id,
  workflow_id,
  workflow_key,
  display_name,
  tenant_id,
  workspace_id,
  project_id,
  user_email,
  session_id,
  run_group_id,
  trigger_type,
  status,
  input_json,
  output_json,
  step_results_json,
  steps_completed,
  steps_total,
  environment,
  git_branch,
  supabase_sync_status,
  metadata_json,
  graph_mode,
  current_node_key,
  max_runtime_ms,
  max_cost_usd,
  max_total_tokens,
  heartbeat_at
)
VALUES (
  '{run_id}',
  '{WORKFLOW_ID}',
  '{WORKFLOW_KEY}',
  'Python E2E — Agent Sam Debug Mirror',
  '{TENANT_ID}',
  '{WORKSPACE_ID}',
  'inneranimalmedia',
  'info@inneranimals.com',
  'python_e2e_session',
  'python_e2e_run_group',
  'manual',
  'running',
  '{input_json}',
  '{{}}',
  '[]',
  0,
  6,
  'production',
  'main',
  'pending',
  '{metadata_json}',
  1,
  'start',
  300000,
  0.05,
  20000,
  unixepoch()
);

SELECT
  id,
  workflow_key,
  status,
  current_node_key,
  steps_completed,
  steps_total,
  supabase_sync_status
FROM agentsam_workflow_runs
WHERE id = '{run_id}';
"""
    out = d1(sql)
    print(out)

    if run_id not in out:
        raise RuntimeError("D1 run create failed.")

    return run_id


def complete_d1_workflow(run_id: str) -> None:
    print("\n== 3. Advance D1 workflow through all nodes ==")

    steps = [
        {
            "node_key": "start",
            "next_node": "inspect_context",
            "handler_key": "agentsam.workflow.start",
            "message": "Initialized workflow context",
        },
        {
            "node_key": "inspect_context",
            "next_node": "run_tool",
            "handler_key": "agentsam.workflow.inspect_context",
            "context_ok": 1,
            "hyperdrive_binding": "HYPERDRIVE",
        },
        {
            "node_key": "run_tool",
            "next_node": "capture_debug_snapshot",
            "handler_key": "agentsam.workflow.run_tool",
            "tool_key": "debug.noop",
            "tool_ok": 1,
            "latency_ms": 42,
        },
        {
            "node_key": "capture_debug_snapshot",
            "next_node": "quality_gate",
            "handler_key": "agentsam.workflow.capture_debug_snapshot",
            "snapshot_key": "python_e2e_debug_snapshot",
            "snapshot_captured": 1,
        },
        {
            "node_key": "quality_gate",
            "next_node": "finalize",
            "handler_key": "agentsam.workflow.quality_gate",
            "quality_ok": 1,
            "score": 0.98,
        },
    ]

    for index, step in enumerate(steps, start=1):
        payload = dict(step)
        payload["status"] = "completed"
        payload["completed_at"] = now_iso()

        step_json = json.dumps(payload).replace("'", "''")
        next_node = step["next_node"]

        sql = f"""
UPDATE agentsam_workflow_runs
SET
  current_node_key = '{next_node}',
  steps_completed = {index},
  step_results_json = json_insert(step_results_json, '$[#]', json('{step_json}')),
  input_tokens = CASE WHEN '{step["node_key"]}' = 'run_tool' THEN input_tokens + 12 ELSE input_tokens END,
  output_tokens = CASE WHEN '{step["node_key"]}' = 'run_tool' THEN output_tokens + 8 ELSE output_tokens END,
  cost_usd = CASE WHEN '{step["node_key"]}' = 'run_tool' THEN cost_usd + 0.000001 ELSE cost_usd END,
  model_used = CASE WHEN model_used IS NULL AND '{step["node_key"]}' = 'run_tool' THEN 'python-e2e-debug-model' ELSE model_used END,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '{run_id}';
"""
        d1(sql)

    final_step = json.dumps(
        {
            "node_key": "finalize",
            "status": "completed",
            "handler_key": "agentsam.workflow.finalize",
            "finalized": 1,
            "dashboard_ready": 1,
            "completed_at": now_iso(),
        }
    ).replace("'", "''")

    output_json = json.dumps(
        {
            "ok": 1,
            "dashboard_ready": 1,
            "workflow_id": WORKFLOW_ID,
            "run_id": run_id,
            "message": "Python E2E Agent Sam workflow completed",
        }
    ).replace("'", "''")

    sql = f"""
UPDATE agentsam_workflow_runs
SET
  status = 'completed',
  current_node_key = 'finalize',
  steps_completed = 6,
  output_json = json('{output_json}'),
  step_results_json = json_insert(step_results_json, '$[#]', json('{final_step}')),
  duration_ms = CASE
    WHEN started_at IS NOT NULL THEN MAX(1, (unixepoch() - started_at) * 1000)
    ELSE duration_ms
  END,
  completed_at = unixepoch(),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  heartbeat_at = unixepoch()
WHERE id = '{run_id}';

SELECT
  id,
  workflow_key,
  status,
  steps_completed,
  steps_total,
  current_node_key,
  model_used,
  input_tokens,
  output_tokens,
  cost_usd,
  duration_ms,
  supabase_sync_status,
  json_array_length(step_results_json) AS step_result_count,
  json_extract(output_json, '$.dashboard_ready') AS dashboard_ready
FROM agentsam_workflow_runs
WHERE id = '{run_id}';
"""
    out = d1(sql)
    print(out)

    if "completed" not in out or "finalize" not in out:
        raise RuntimeError("D1 workflow did not complete.")


def fetch_d1_run_json(run_id: str) -> dict:
    print("\n== 4. Export completed D1 run as JSON ==")

    # Wrangler table output is annoying to parse, so use sqlite json_object in one row.
    sql = f"""
SELECT json_object(
  'id', id,
  'd1_run_id', id,
  'tenant_id', tenant_id,
  'workspace_id', workspace_id,
  'workflow_id', workflow_id,
  'workflow_key', workflow_key,
  'display_name', display_name,
  'trigger_type', trigger_type,
  'status', status,
  'input_json', input_json,
  'output_json', output_json,
  'step_results_json', step_results_json,
  'steps_completed', steps_completed,
  'steps_total', steps_total,
  'error_message', error_message,
  'model_used', model_used,
  'input_tokens', input_tokens,
  'output_tokens', output_tokens,
  'cost_usd', cost_usd,
  'duration_ms', duration_ms,
  'environment', environment,
  'retry_count', retry_count,
  'started_at', started_at,
  'completed_at', completed_at,
  'metadata_json', metadata_json
) AS run_json
FROM agentsam_workflow_runs
WHERE id = '{run_id}';
"""
    out = d1(sql)
    print(out)

    # Wrangler may return a JSON wrapper:
    # [{ "results": [{ "run_json": "{...}" }], "success": true, ... }]
    try:
        wrapped = json.loads(out)
        run_json = wrapped[0]["results"][0]["run_json"]
        return json.loads(run_json)
    except Exception:
        pass

    # Fallback for older/table-style Wrangler output.
    marker = '"run_json":'
    idx = out.find(marker)
    if idx != -1:
        start = out.find('"{', idx)
        end = out.find('}"', start)
        if start != -1 and end != -1:
            raw_escaped = out[start + 1 : end + 1]
            return json.loads(bytes(raw_escaped, "utf-8").decode("unicode_escape"))

    raise RuntimeError("Could not parse D1 run JSON from wrangler output.")


def mirror_run_to_supabase(run: dict) -> None:
    print("\n== 5. Mirror completed run to Supabase ==")

    run_id = run["id"]

    # Convert D1 text JSON fields into Supabase jsonb values.
    def parse_json_field(key: str, fallback):
        value = run.get(key)
        if value is None:
            return fallback
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(value)
        except Exception:
            return fallback

    body = {
        "id": run_id,
        "d1_run_id": run_id,
        "tenant_id": run.get("tenant_id") or TENANT_ID,
        "workspace_id": run.get("workspace_id") or WORKSPACE_ID,
        "workflow_id": run.get("workflow_id"),
        "workflow_key": run.get("workflow_key"),
        "display_name": run.get("display_name"),
        "trigger_type": run.get("trigger_type") or "manual",
        "status": run.get("status") or "completed",
        "input_json": parse_json_field("input_json", {}),
        "output_json": parse_json_field("output_json", {}),
        "step_results_json": parse_json_field("step_results_json", []),
        "steps_completed": int(run.get("steps_completed") or 0),
        "steps_total": int(run.get("steps_total") or 0),
        "error_message": run.get("error_message"),
        "model_used": run.get("model_used"),
        "input_tokens": int(run.get("input_tokens") or 0),
        "output_tokens": int(run.get("output_tokens") or 0),
        "total_tokens": int(run.get("input_tokens") or 0) + int(run.get("output_tokens") or 0),
        "cost_usd": float(run.get("cost_usd") or 0),
        "estimated_cost_usd": float(run.get("cost_usd") or 0),
        "duration_ms": run.get("duration_ms"),
        "environment": run.get("environment") or "production",
        "metadata": {
            "source": "python_e2e_smoke",
            "mirrored_at": now_iso(),
            "d1_metadata_json": parse_json_field("metadata_json", {}),
        },
        "supabase_sync_status": "synced",
        "supabase_synced_at": now_iso(),
    }

    # Upsert by id. Supabase REST upsert uses POST + on_conflict.
    path = "/rest/v1/agentsam_workflow_runs?on_conflict=id"
    status, text = supabase_request("POST", path, [body])
    rows = assert_supabase_ok(status, text, "Supabase run upsert")
    print(json.dumps(rows, indent=2)[:4000])

    # Add one step, one event, one snapshot so the new spine is proven too.
    step_body = {
        "id": new_id("wfs"),
        "run_id": run_id,
        "tenant_id": body["tenant_id"],
        "workspace_id": body["workspace_id"],
        "step_index": 1,
        "step_key": "python_e2e_summary",
        "step_type": "eval",
        "status": "completed",
        "tool_key": "python_e2e",
        "input_json": {"run_id": run_id},
        "output_json": {"ok": True, "steps_completed": body["steps_completed"]},
        "completed_at": now_iso(),
        "latency_ms": 1,
        "metadata": {"source": "python_e2e_smoke"},
    }
    status, text = supabase_request("POST", "/rest/v1/agentsam_workflow_steps", [step_body])
    step_rows = assert_supabase_ok(status, text, "Supabase step insert")
    print("Supabase step inserted:", len(step_rows))

    step_id = step_rows[0]["id"] if step_rows else None

    event_body = {
        "id": new_id("wfe"),
        "run_id": run_id,
        "step_id": step_id,
        "tenant_id": body["tenant_id"],
        "workspace_id": body["workspace_id"],
        "event_type": "python_e2e_completed",
        "event_level": "info",
        "message": "Python E2E smoke mirrored Agent Sam workflow run to Supabase.",
        "payload_json": {"run_id": run_id, "workflow_key": body["workflow_key"]},
    }
    status, text = supabase_request("POST", "/rest/v1/agentsam_workflow_events", [event_body])
    event_rows = assert_supabase_ok(status, text, "Supabase event insert")
    print("Supabase event inserted:", len(event_rows))

    snapshot_body = {
        "id": new_id("dbg"),
        "tenant_id": body["tenant_id"],
        "workspace_id": body["workspace_id"],
        "run_id": run_id,
        "snapshot_key": "python_e2e_workflow_snapshot",
        "source": "python_e2e_smoke",
        "status": "captured",
        "request_json": {"workflow_id": WORKFLOW_ID, "run_id": run_id},
        "response_json": {"d1_completed": True, "supabase_mirrored": True},
        "environment_json": {
            "db": DB_NAME,
            "wrangler_config": WRANGLER_CONFIG,
            "supabase_url_present": bool(SUPABASE_URL),
        },
        "notes": "End-to-end Agent Sam workflow smoke test.",
    }
    status, text = supabase_request("POST", "/rest/v1/agentsam_debug_snapshots", [snapshot_body])
    snapshot_rows = assert_supabase_ok(status, text, "Supabase snapshot insert")
    print("Supabase snapshot inserted:", len(snapshot_rows))


def verify_supabase_readback(run_id: str) -> None:
    print("\n== 6. Verify Supabase readback ==")

    encoded = urllib.parse.quote(run_id)
    path = (
        "/rest/v1/agentsam_workflow_runs"
        f"?select=id,d1_run_id,workflow_key,status,steps_completed,steps_total,total_tokens,supabase_sync_status"
        f"&or=(id.eq.{encoded},d1_run_id.eq.{encoded})"
    )
    status, text = supabase_request("GET", path)
    rows = assert_supabase_ok(status, text, "Supabase run readback")
    print(json.dumps(rows, indent=2))

    if not rows:
        raise RuntimeError("Supabase readback returned no rows.")

    row = rows[0]
    if row.get("status") != "completed":
        raise RuntimeError(f"Supabase row status was not completed: {row}")

    # Verify spine child rows.
    for table in ["agentsam_workflow_steps", "agentsam_workflow_events", "agentsam_debug_snapshots"]:
        path = f"/rest/v1/{table}?select=id,run_id&run_id=eq.{encoded}"
        status, text = supabase_request("GET", path)
        child_rows = assert_supabase_ok(status, text, f"Supabase {table} readback")
        print(f"{table}: {len(child_rows)} row(s)")
        if not child_rows:
            raise RuntimeError(f"No rows found in {table} for run {run_id}.")


def mark_d1_synced(run_id: str) -> None:
    print("\n== 7. Mark D1 run as Supabase synced ==")

    sql = f"""
UPDATE agentsam_workflow_runs
SET
  supabase_sync_status = 'synced',
  supabase_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  supabase_sync_error = NULL,
  supabase_sync_attempts = supabase_sync_attempts + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = '{run_id}';

SELECT
  id,
  status,
  steps_completed,
  steps_total,
  supabase_sync_status,
  supabase_synced_at,
  supabase_sync_attempts
FROM agentsam_workflow_runs
WHERE id = '{run_id}';
"""
    out = d1(sql)
    print(out)

    if "synced" not in out:
        raise RuntimeError("D1 sync status was not updated.")


def main() -> int:
    print("Agent Sam Workflow E2E Smoke")
    print(f"D1 DB: {DB_NAME}")
    print(f"Wrangler config: {WRANGLER_CONFIG}")
    print(f"Supabase URL present: {bool(SUPABASE_URL)}")
    print(f"Supabase service key present: {bool(SUPABASE_SERVICE_ROLE_KEY)}")

    validate_d1_workflow_exists()
    run_id = create_d1_run()
    complete_d1_workflow(run_id)
    run = fetch_d1_run_json(run_id)
    mirror_run_to_supabase(run)
    verify_supabase_readback(run_id)
    mark_d1_synced(run_id)

    print("\n== PASS ==")
    print(f"Agent Sam completed and mirrored workflow run: {run_id}")
    print("D1 lifecycle: OK")
    print("Supabase mirror: OK")
    print("Debug spine rows: OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print("\n== FAIL ==")
        print(str(e))
        raise
