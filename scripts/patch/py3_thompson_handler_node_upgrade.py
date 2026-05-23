#!/usr/bin/env python3
"""
Upgrade stale agentsam_workflow_nodes.handler_key values to Thompson subagent handlers
for wf_cms_live_editor_dev_app.

Usage (repo root):
  python3 scripts/patch/py3_thompson_handler_node_upgrade.py --dry-run
  python3 scripts/patch/py3_thompson_handler_node_upgrade.py --apply
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOW_ID = "wf_cms_live_editor_dev_app"
TARGET_MASTER = "handler_thompson_subagent_master"
TARGET_WORKER = "handler_thompson_subagent_worker"

# Pre-Thompson handler_key prefixes/names observed on cms live editor graph.
STALE_PREFIXES = (
    "handler_openai_",
    "handler_agent_",
    "openai.",
    "agent.",
)
STALE_EXACT = {
    "handler_code_gen",
    "handler_tool_use",
    "handler_reasoning",
    "handler_sql",
    "handler_router_micro",
    "handler_vision",
}


def run_wrangler_json(sql: str) -> list[dict]:
    cmd = [
        str(REPO_ROOT / "scripts" / "with-cloudflare-env.sh"),
        "npx",
        "wrangler",
        "d1",
        "execute",
        "inneranimalmedia-business",
        "--remote",
        "-c",
        str(REPO_ROOT / "wrangler.production.toml"),
        "--json",
        "--command",
        sql,
    ]
    proc = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or "wrangler d1 failed")
    payload = json.loads(proc.stdout)
    if not payload or not payload[0].get("success"):
        raise RuntimeError(f"D1 query failed: {proc.stdout[:500]}")
    return payload[0].get("results") or []


def classify_replacement(handler_key: str) -> str | None:
    hk = (handler_key or "").strip()
    if not hk or hk.startswith("handler_thompson_"):
        return None
    lower = hk.lower()
    if hk in STALE_EXACT or any(lower.startswith(p) for p in STALE_PREFIXES):
        if "master" in lower or "coordinator" in lower or "router" in lower:
            return TARGET_MASTER
        return TARGET_WORKER
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print planned updates only")
    parser.add_argument("--apply", action="store_true", help="Apply updates to remote D1")
    args = parser.parse_args()
    if args.dry_run == args.apply:
        print("Specify exactly one of --dry-run or --apply", file=sys.stderr)
        return 2

    step_rows: list[dict] = []
    for step_sql in (
        f"SELECT id, handler_key FROM agentsam_workflow_run_steps WHERE workflow_id = '{WORKFLOW_ID}' LIMIT 200",
        f"SELECT id, handler_key FROM agentsam_execution_steps WHERE workflow_id = '{WORKFLOW_ID}' LIMIT 200",
    ):
        try:
            step_rows = run_wrangler_json(step_sql)
            print(f"Stale handler sample ({len(step_rows)} rows) from: {step_sql.split(' FROM ')[1].split(' ')[0]}")
            break
        except RuntimeError as exc:
            print(f"skip step probe: {exc}", file=sys.stderr)
    for row in step_rows[:20]:
        print(f"  {row.get('id')}: {row.get('handler_key')}")

    node_rows = run_wrangler_json(
        f"SELECT id, node_key, handler_key FROM agentsam_workflow_nodes WHERE workflow_id = '{WORKFLOW_ID}'"
    )
    planned: list[tuple[str, str, str]] = []
    for row in node_rows:
        node_id = str(row.get("id") or "")
        old = str(row.get("handler_key") or "")
        new = classify_replacement(old)
        if new and new != old:
            planned.append((node_id, old, new))

    print(f"\nPlanned node handler_key updates: {len(planned)}")
    for node_id, old, new in planned:
        print(f"  {node_id}: {old} -> {new}")

    if args.dry_run or not planned:
        return 0

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = REPO_ROOT / "scripts" / "patch" / f"py3_thompson_handler_node_upgrade_{ts}.sql.bak"
    backup_lines = [
        f"-- backup {ts} wf={WORKFLOW_ID}",
        "BEGIN;",
    ]
    for node_id, old, _new in planned:
        old_esc = old.replace("'", "''")
        backup_lines.append(
            f"UPDATE agentsam_workflow_nodes SET handler_key = '{old_esc}' WHERE id = '{node_id}';"
        )
    backup_lines.append("COMMIT;")
    backup_path.write_text("\n".join(backup_lines) + "\n", encoding="utf-8")
    print(f"\nWrote rollback backup: {backup_path}")

    script_copy = Path(__file__).with_suffix(f".{ts}.bak")
    shutil.copy2(Path(__file__), script_copy)

    for node_id, _old, new in planned:
        new_esc = new.replace("'", "''")
        sql = (
            f"UPDATE agentsam_workflow_nodes SET handler_key = '{new_esc}', "
            f"updated_at = datetime('now') WHERE id = '{node_id}'"
        )
        run_wrangler_json(sql)
        print(f"applied {node_id} -> {new}")

    verify = run_wrangler_json(
        f"SELECT id, handler_key FROM agentsam_workflow_nodes WHERE workflow_id = '{WORKFLOW_ID}'"
    )
    print("\nPost-apply nodes:")
    for row in verify:
        print(f"  {row.get('id')}: {row.get('handler_key')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
