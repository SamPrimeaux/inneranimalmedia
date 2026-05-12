#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

TENANT_ID = os.getenv("AGENTSAM_TENANT_ID", "tenant_sam_primeaux")
WORKSPACE_ID = os.getenv("AGENTSAM_WORKSPACE_ID", "ws_inneranimalmedia")

WORKFLOW_RUNS = "agentsam_workflow_runs"
DEBUG_SNAPSHOTS = "agentsam_debug_snapshots"
WORKFLOWS = "agentsam_workflows"

DEFAULT_PAYLOAD = Path("artifacts/agentsam_supabase_memory_cursor_replacement.json")


def fail(msg: str) -> int:
    print(f"[FAIL] {msg}", file=sys.stderr)
    return 1


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value[:80] or "memory_checkpoint"


def request_json(method: str, url: str, body=None):
    data = None
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=45) as res:
            raw = res.read().decode("utf-8")
            return res.status, json.loads(raw) if raw else None
    except Exception as e:
        body_text = ""
        if hasattr(e, "read"):
            try:
                body_text = e.read().decode("utf-8")
            except Exception:
                body_text = ""
        raise RuntimeError(f"{e}\n{body_text}") from e


def get_first(table: str, query: str):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    _, rows = request_json("GET", url)
    return rows[0] if rows else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--payload", default=str(DEFAULT_PAYLOAD))
    ap.add_argument("--memory-key", default=None)
    ap.add_argument("--title", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SUPABASE_URL:
        return fail("SUPABASE_URL is not set")
    if not SUPABASE_SERVICE_ROLE_KEY:
        return fail("SUPABASE_SERVICE_ROLE_KEY is not set")

    payload_path = Path(args.payload)
    if not payload_path.exists():
        return fail(f"payload missing: {payload_path}")

    payload = json.loads(payload_path.read_text())

    memory_key = args.memory_key or payload.get("memory_key") or "agentsam.memory.checkpoint"
    title = args.title or payload.get("title") or memory_key
    memory_slug = slugify(memory_key)
    ts = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    run_id = f"memrun_{memory_slug}_{ts}"
    snapshot_id = f"dbg_{memory_slug}_{ts}"
    snapshot_key = f"{memory_slug}_{ts}"

    # Need a real workflow_id because agentsam_workflow_runs may FK to agentsam_workflows.
    workflow = (
        get_first(WORKFLOWS, "id=eq.wf_agent_chat_plan&select=id,workflow_key")
        or get_first(WORKFLOWS, "workflow_key=eq.agent_chat_plan&select=id,workflow_key")
        or get_first(WORKFLOWS, "select=id,workflow_key&limit=1")
    )
    if not workflow:
        return fail("No Supabase agentsam_workflows row found to attach memory run to")

    workflow_id = workflow["id"]
    workflow_key = workflow.get("workflow_key") or "agent_sam_memory"

    run_row = {
        "id": run_id,
        "workflow_id": workflow_id,
        "workflow_key": workflow_key,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "status": "completed",
        "trigger_type": "agent",
        "input_json": {
            "memory_key": memory_key,
            "memory_type": payload.get("memory_type", "decision"),
            "title": title,
            "source": "agentsam-supabase-memory-checkpoint.py"
        },
        "output_json": {
            "captured": True,
            "snapshot_id": snapshot_id,
            "snapshot_key": snapshot_key,
            "source_table": DEBUG_SNAPSHOTS
        },
        "metadata_json": {
            "kind": "memory_checkpoint",
            "memory_key": memory_key,
            "stable_lookup_key": memory_slug,
            "source_of_truth": payload.get("source_of_truth", "D1 / Agent Sam runtime"),
            "canonical_spine": payload.get("canonical_spine")
        },
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    snapshot_row = {
        "id": snapshot_id,
        "tenant_id": TENANT_ID,
        "workspace_id": WORKSPACE_ID,
        "run_id": run_id,
        "snapshot_key": snapshot_key,
        "source": "agentsam_memory_checkpoint",
        "status": "captured",
        "request_json": {
            "memory_key": memory_key,
            "memory_slug": memory_slug,
            "memory_type": payload.get("memory_type", "decision"),
            "title": title,
            "stable_lookup_key": memory_slug,
        },
        "response_json": payload,
        "environment_json": {
            "db": "inneranimalmedia-business",
            "supabase_table": DEBUG_SNAPSHOTS,
            "parent_run_table": WORKFLOW_RUNS,
            "created_by": "agentsam-supabase-memory-checkpoint.py",
        },
        "notes": payload.get("summary", title),
        "created_at": now_iso,
    }

    print("Agent Sam Supabase Memory Checkpoint")
    print(f"memory_key: {memory_key}")
    print(f"workflow_id: {workflow_id}")
    print(f"run_id: {run_id}")
    print(f"snapshot_id: {snapshot_id}")
    print(f"snapshot_key: {snapshot_key}")

    if args.dry_run:
        print(json.dumps({"run": run_row, "snapshot": snapshot_row}, indent=2))
        print("[PASS] dry-run only")
        return 0

    try:
        status, result = request_json("POST", f"{SUPABASE_URL}/rest/v1/{WORKFLOW_RUNS}", [run_row])
        print(f"insert workflow_run status: {status}")
        print(json.dumps(result, indent=2))
    except Exception as e:
        return fail(f"workflow_run insert failed: {e}")

    try:
        status, result = request_json("POST", f"{SUPABASE_URL}/rest/v1/{DEBUG_SNAPSHOTS}", [snapshot_row])
        print(f"insert debug_snapshot status: {status}")
        print(json.dumps(result, indent=2))
    except Exception as e:
        return fail(f"debug_snapshot insert failed: {e}")

    encoded_key = urllib.parse.quote(snapshot_key, safe="")
    verify_url = (
        f"{SUPABASE_URL}/rest/v1/{DEBUG_SNAPSHOTS}"
        f"?snapshot_key=eq.{encoded_key}"
        f"&select=id,tenant_id,workspace_id,run_id,snapshot_key,source,status,notes,created_at"
    )
    try:
        _, verify = request_json("GET", verify_url)
        print("verify:")
        print(json.dumps(verify, indent=2))
    except Exception as e:
        return fail(f"verify failed: {e}")

    if not verify:
        return fail("snapshot not found after insert")

    print("[PASS] Supabase memory checkpoint saved with unique parent workflow_run")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
