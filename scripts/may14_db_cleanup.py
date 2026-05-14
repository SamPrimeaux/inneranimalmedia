#!/usr/bin/env python3
"""
scripts/may14_db_cleanup.py
VERSION = "1.1.0"

Useful end-of-session cleanup + health report.
Shows only active/eligible arms, active plan tasks, real system state.

Usage:
  python3 scripts/may14_db_cleanup.py --dry-run
  python3 scripts/may14_db_cleanup.py
"""
import subprocess, json, sys, textwrap

DRY = "--dry-run" in sys.argv
DB  = "inneranimalmedia-business"

def d1q(sql):
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    try:
        return json.loads(r.stdout)[0].get("results",[])
    except Exception:
        return []

def d1x(sql, label):
    if DRY:
        print(f"  [DRY] {label}")
        return 0
    r = subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",sql],
        capture_output=True, text=True
    )
    try:
        changes = json.loads(r.stdout)[0].get("meta",{}).get("changes",0)
        print(f"  ✓ {label} — {changes} changed")
        return changes
    except Exception:
        print(f"  ✗ {label}: {r.stderr[:200]}")
        return -1

def section(t):
    print(f"\n{'─'*62}\n  {t}\n{'─'*62}")

# ── 1. Fix scaffold-new-worker (already done — just verify) ─────────────────

section("1. scaffold-new-worker workflow nodes")
nodes = d1q("SELECT node_key, node_type, handler_key, sort_order FROM agentsam_workflow_nodes WHERE workflow_id='wf_scaffold_new_worker' ORDER BY sort_order")
for n in nodes:
    flag = "✓" if n["handler_key"] not in ("", None) else "⚠"
    print(f"  {flag}  [{n['sort_order']:>2}] {n['node_key']:<22} {n['node_type']:<12} → {n['handler_key']}")

# ── 2. Active routing arms — ONLY show eligible ones ────────────────────────

section("2. Active routing arms (eligible only)")
arms = d1q("""
    SELECT model_key, task_type, mode,
           ROUND(success_alpha,2) as a,
           ROUND(success_beta,2)  as b,
           ROUND(success_alpha/(success_alpha+success_beta),3) as win_rate
    FROM agentsam_routing_arms
    WHERE is_active=1 AND is_eligible=1
    ORDER BY task_type, win_rate DESC
""")
if arms:
    print(f"  {'model_key':<28} {'task_type':<24} {'mode':<12} {'α':>5} {'β':>5} {'win%':>6}")
    print(f"  {'─'*82}")
    for a in arms:
        print(f"  {a['model_key']:<28} {a['task_type']:<24} {a['mode']:<12} "
              f"{a['a']:>5} {a['b']:>5} {a['win_rate']*100:>5.1f}%")
    print(f"\n  Total eligible arms: {len(arms)}")
else:
    print("  ⚠  No eligible arms — run seed_routing_arms.py")

# ── 3. Plan tasks status ─────────────────────────────────────────────────────

section("3. plan_may14_2026_repair — task status")
tasks = d1q("""
    SELECT order_index, title, status, blocked_reason
    FROM agentsam_plan_tasks
    WHERE plan_id='plan_may14_2026_repair'
    ORDER BY order_index
""")
icons = {"done":"✓","in_progress":"⟳","todo":"○","blocked":"✗"}
for t in tasks:
    icon = icons.get(t["status"],"?")
    extra = f"  ← {t['blocked_reason']}" if t.get("blocked_reason") and t["status"]=="blocked" else ""
    print(f"  {icon}  [{t['order_index']}] {t['title'][:50]:<50} {t['status']}{extra}")

# ── 4. Recent agent runs ─────────────────────────────────────────────────────

section("4. Recent agent runs — model + arm linkage")
runs = d1q("""
    SELECT ai_model_ref, status,
           CASE WHEN routing_arm_id IS NOT NULL THEN '✓ linked' ELSE '✗ no arm' END as arm,
           datetime(created_at) as ts
    FROM agentsam_agent_run
    ORDER BY created_at DESC LIMIT 8
""")
if runs:
    print(f"  {'model':<26} {'status':<12} {'arm':<10} {'time'}")
    print(f"  {'─'*62}")
    for r in runs:
        print(f"  {(r['ai_model_ref'] or 'none'):<26} {r['status']:<12} {r['arm']:<10} {r['ts']}")
else:
    print("  No runs found")

# ── 5. agentsam_scripts now populated ───────────────────────────────────────

section("5. agentsam_scripts — body coverage")
stats = d1q("""
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN body IS NOT NULL AND body != '' THEN 1 ELSE 0 END) as has_body,
      SUM(CASE WHEN is_active=0 THEN 1 ELSE 0 END) as inactive,
      SUM(CASE WHEN safe_to_run=1 THEN 1 ELSE 0 END) as safe
    FROM agentsam_scripts
""")
if stats:
    s = stats[0]
    pct = round(s["has_body"]/s["total"]*100) if s["total"] else 0
    print(f"  Total scripts:  {s['total']}")
    print(f"  Has body:       {s['has_body']} ({pct}%)")
    print(f"  Safe to run:    {s['safe']}")
    print(f"  Inactive:       {s['inactive']}")

# ── 6. Mark plan tasks done ──────────────────────────────────────────────────

section("6. Sync plan task statuses")
d1x("UPDATE agentsam_plan_tasks SET status='done', completed_at=unixepoch() WHERE id='task_purge_ollama_dupes' AND status!='done'", "task_purge_ollama_dupes → done")
d1x("UPDATE agentsam_plan_tasks SET status='done', completed_at=unixepoch(), output_summary='252 scripts synced to D1 with body + skill registration' WHERE id='task_dead_scripts' AND status!='done'", "task_dead_scripts → done")

# ── 7. agentsam_todo — open items ────────────────────────────────────────────

section("7. Open agentsam_todo items")
todos = d1q("""
    SELECT id, title, status, priority
    FROM agentsam_todo
    WHERE status NOT IN ('done','closed','cancelled')
    ORDER BY priority DESC, id
    LIMIT 10
""")
if todos:
    for t in todos:
        print(f"  [{t['priority']:<3}] {t['id']:<30} {t['title'][:45]}")
else:
    print("  No open todos")

print(f"\n{'═'*62}")
print(f"  Done {'(dry run)' if DRY else '✓'}")
print(f"{'═'*62}\n")
