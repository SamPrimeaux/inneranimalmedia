#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

TABLE = "agentsam_debug_snapshots"

DEFAULT_PAYLOAD = Path("artifacts/agentsam_supabase_memory_cursor_replacement.json")

def fail(msg: str) -> int:
    print(f"[FAIL] {msg}", file=sys.stderr)
    return 1

def request_json(method: str, url: str, body=None):
    data = None
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=merge-duplicates",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=45) as res:
        raw = res.read().decode("utf-8")
        return res.status, json.loads(raw) if raw else None

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--payload", default=str(DEFAULT_PAYLOAD))
    ap.add_argument("--id", default="dbg_cursor_replacement_cli_master_20260512")
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

    row = {
        "id": args.id,
        "tenant_id": "tenant_sam_primeaux",
        "workspace_id": "ws_inneranimalmedia",
        "run_id": payload.get("plan_id", "plan_agentsam_cursor_replacement_cli_master_20260512"),
        "snapshot_key": "cursor_replacement_cli_master_20260512",
        "source": "agentsam_memory_checkpoint",
        "status": "captured",
        "request_json": {
            "memory_key": payload.get("memory_key"),
            "memory_type": payload.get("memory_type"),
            "plan_id": payload.get("plan_id"),
            "source_of_truth": payload.get("source_of_truth"),
            "canonical_spine": payload.get("canonical_spine"),
        },
        "response_json": payload,
        "environment_json": {
            "db": "inneranimalmedia-business",
            "supabase_url_present": bool(SUPABASE_URL),
            "service_role_present": bool(SUPABASE_SERVICE_ROLE_KEY),
            "table": TABLE,
            "created_by": "agentsam-supabase-memory-snapshot.py"
        },
        "notes": payload.get("summary", "Agent Sam memory checkpoint."),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    print("Agent Sam Supabase Memory Snapshot")
    print(f"table: {TABLE}")
    print(f"id: {row['id']}")
    print(f"run_id: {row['run_id']}")

    if args.dry_run:
        print(json.dumps(row, indent=2))
        print("[PASS] dry-run only")
        return 0

    # Use snapshot_key as the stable memory key. If it exists, PATCH it.
    # If not, POST a new row. This avoids PostgREST on_conflict/id issues.
    check_url = f"{SUPABASE_URL}/rest/v1/{TABLE}?snapshot_key=eq.{row['snapshot_key']}&select=id,snapshot_key"
    try:
        _, existing = request_json("GET", check_url)
    except Exception as e:
        return fail(f"existence check failed: {e}")

    try:
        if existing:
            existing_id = existing[0]["id"]
            row["id"] = existing_id
            url = f"{SUPABASE_URL}/rest/v1/{TABLE}?id=eq.{existing_id}"
            status, result = request_json("PATCH", url, row)
            print(f"patch status: {status}")
        else:
            url = f"{SUPABASE_URL}/rest/v1/{TABLE}"
            status, result = request_json("POST", url, [row])
            print(f"insert status: {status}")
        print(json.dumps(result, indent=2))
    except Exception as e:
        return fail(str(e))

    snapshot_key = row["snapshot_key"]
    verify_url = f"{SUPABASE_URL}/rest/v1/{TABLE}?snapshot_key=eq.{snapshot_key}&select=id,tenant_id,workspace_id,run_id,snapshot_key,source,status,created_at"
    try:
        status, result = request_json("GET", verify_url)
        print("verify:")
        print(json.dumps(result, indent=2))
    except Exception as e:
        return fail(f"verify failed: {e}")

    if not result:
        return fail("no row found after upsert")

    print("[PASS] Supabase memory snapshot saved")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
