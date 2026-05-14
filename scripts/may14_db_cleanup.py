#!/usr/bin/env python3
"""
scripts/may14_db_cleanup.py
VERSION = "1.0.0"

D1 cleanup tasks for May 14 2026 sprint:
  1. Insert scaffold-new-worker deploy node (fixed datetime syntax)
  2. Mark DISCONTINUED agentsam_scripts rows as inactive
  3. Update plan task statuses after completion
  4. Verify routing arms exist for active models

Usage:
  python3 scripts/may14_db_cleanup.py --dry-run   # preview all SQL
  python3 scripts/may14_db_cleanup.py              # execute
"""
import subprocess, json, sys, textwrap
from datetime import datetime, timezone

DRY = "--dry-run" in sys.argv
DB  = "inneranimalmedia-business"

# ── helpers ────────────────────────────────────────────────────────────────

def d1q(sql: str, label: str = "") -> list:
    """Read-only D1 query — returns results list."""
    r = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
        capture_output=True, text=True
    )
    try:
        return json.loads(r.stdout)[0].get("results", [])
    except Exception:
        print(f"  [parse error] {label}: {r.stderr[:200]}")
        return []

def d1x(sql: str, label: str = "") -> int:
    """Write D1 query — returns rows changed."""
    if DRY:
        print(f"  [DRY] {label}")
        print(textwrap.indent(sql.strip(), "        "))
        return 0
    r = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
        capture_output=True, text=True
    )
    try:
        meta = json.loads(r.stdout)[0].get("meta", {})
        changes = meta.get("changes", 0)
        print(f"  ✓ {label} — {changes} row(s) changed")
        return changes
    except Exception:
        print(f"  ✗ {label}: {r.stderr[:300]}")
        return -1

def section(title: str):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")

# ── 1. scaffold-new-worker deploy node ──────────────────────────────────────

section("1. Add deploy node to scaffold-new-worker")

# Check it doesn't already exist
existing = d1q(
    "SELECT id FROM agentsam_workflow_nodes WHERE id='wf_scaffold_new_worker-deploy'",
    "check existing"
)
if existing:
    print("  ⚠  node already exists — skipping")
else:
    # Use datetime('now') via SQL, not Python string — avoids shell quoting hell
    d1x(
        """INSERT OR IGNORE INTO agentsam_workflow_nodes
           (id, workflow_id, node_key, node_type, title, description,
            handler_key, input_schema_json, output_schema_json,
            timeout_ms, risk_level, requires_approval, is_active, sort_order,
            created_at, updated_at)
           VALUES (
             'wf_scaffold_new_worker-deploy',
             'wf_scaffold_new_worker',
             'deploy',
             'terminal',
             'Deploy Worker',
             'Deploy scaffolded worker via wrangler deploy. Uses terminal_wrangler MCP tool.',
             'terminal.wrangler_deploy',
             '{}', '{}',
             120000, 'high', 1, 1, 40,
             datetime('now'), datetime('now')
           )""",
        "INSERT scaffold-new-worker deploy node"
    )

# ── 2. Mark DISCONTINUED scripts inactive ──────────────────────────────────

section("2. Mark DISCONTINUED agentsam_scripts rows inactive")

discontinued = [
    ("scr_deploy_sandbox",   "DISCONTINUED - deploy-sandbox"),
    ("scr_promote_prod",     "DISCONTINUED - promote:prod"),
    ("ascr_deploy_sandbox",  "DISCONTINUED - deploy-sandbox (ascr)"),
]
for script_id, note in discontinued:
    rows = d1q(
        f"SELECT id, is_active FROM agentsam_scripts WHERE id='{script_id}'",
        f"check {script_id}"
    )
    if not rows:
        print(f"  — {script_id} not found, skipping")
        continue
    if rows[0].get("is_active") == 0:
        print(f"  — {script_id} already inactive")
        continue
    d1x(
        f"UPDATE agentsam_scripts SET is_active=0, notes='{note}' WHERE id='{script_id}'",
        f"deactivate {script_id}"
    )

# ── 3. Update plan task statuses ───────────────────────────────────────────

section("3. Mark completed plan tasks done")

# ollama dupes purge — 32 changes = done
d1x(
    """UPDATE agentsam_plan_tasks
       SET status='done', completed_at=unixepoch(),
           output_summary='32 duplicate wf_ollama_local_pinstest rows deactivated'
       WHERE id='task_purge_ollama_dupes' AND status='todo'""",
    "mark task_purge_ollama_dupes done"
)

# ── 4. Routing arms verification ────────────────────────────────────────────

section("4. Verify routing arms for key models")

arms = d1q(
    """SELECT model_key, task_type, mode, success_alpha, success_beta, is_active, is_eligible
       FROM agentsam_routing_arms
       WHERE model_key IN ('gpt-5.4-mini','gpt-5.4-nano','claude-sonnet-4-6','gemini-2.5-flash')
         AND task_type='chat' AND mode='agent'
       ORDER BY model_key""",
    "routing arms check"
)
if arms:
    print(f"  {'model_key':<26} {'α':>6} {'β':>6} {'active':>7} {'eligible':>9}")
    print(f"  {'─'*56}")
    for a in arms:
        print(f"  {a['model_key']:<26} {a['success_alpha']:>6.2f} {a['success_beta']:>6.2f} "
              f"{'yes' if a['is_active'] else 'NO':>7} {'yes' if a['is_eligible'] else 'NO':>9}")
else:
    print("  ⚠  No arms found for key models — run seed_routing_arms.py first")

# ── 5. Verify scaffold node inserted ────────────────────────────────────────

section("5. Final verification")

nodes = d1q(
    """SELECT node_key, node_type, handler_key, sort_order
       FROM agentsam_workflow_nodes
       WHERE workflow_id='wf_scaffold_new_worker'
       ORDER BY sort_order""",
    "scaffold-new-worker nodes"
)
print(f"  scaffold-new-worker nodes ({len(nodes)}):")
for n in nodes:
    print(f"    {n['sort_order']:>3}  {n['node_key']:<20} {n['node_type']:<12} {n['handler_key']}")

# ── done ───────────────────────────────────────────────────────────────────

print(f"\n{'─'*60}")
print(f"  Done {'(dry run)' if DRY else '— run with --dry-run to preview'}")
print(f"{'─'*60}\n")
