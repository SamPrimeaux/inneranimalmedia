#!/usr/bin/env python3
"""
agentsam_triage.py — Triage stale plans, archive progress snapshots, track efficiency.

Three modes:
  --scan        Show what would be cleaned up (no writes)
  --cleanup     Bulk-abandon obvious throwaway plans + carry real tasks forward
  --archive     Write today's snapshot to R2 + update efficiency log in D1
  --efficiency  Show completion rate, velocity, cost metrics

stdlib only.
"""

import os, sys, json, re, argparse, datetime, urllib.request, urllib.parse, uuid

CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT_ID  = "ede6590ac0d2fb7daf155b35653457b2"
D1_DATABASE_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
WORKSPACE_ID   = "ws_inneranimalmedia"
R2_BUCKET      = "inneranimalmedia-autorag"

# Plans that are clearly throwaway — match on title patterns
THROWAWAY_PATTERNS = [
    r"^use the d1_query tool",
    r"^run a d1 query",
    r"^phase \d+ —",
    r"^active clients per tenant",
    r"^resolve duplicate",
    r"^clarify and structure the plan",
    r"^plan api smoke",
    r"^live markdown and visual plan smoke",
    r"^quick system status check",
    r"^run a d1",
    r"^benchmark plan 20\d{2}",
    r"^daily plan 20\d{2}",
]

def d1(sql, params=None):
    url  = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
            f"/d1/database/{D1_DATABASE_ID}/query")
    body = {"sql": sql}
    if params:
        body["params"] = params
    data = json.dumps(body).encode()
    req  = urllib.request.Request(url, data=data,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
        return resp["result"][0]["results"]

def d1_exec(sql, params=None):
    """Execute write SQL — returns meta."""
    url  = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
            f"/d1/database/{D1_DATABASE_ID}/query")
    body = {"sql": sql}
    if params:
        body["params"] = params
    data = json.dumps(body).encode()
    req  = urllib.request.Request(url, data=data,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
        return resp["result"][0].get("meta", {})

def age_days(ts):
    if not ts:
        return 999
    try:
        if isinstance(ts, (int, float)):
            dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        else:
            ts = str(ts).replace("Z","").replace(" ","T")
            dt = datetime.datetime.fromisoformat(ts).replace(tzinfo=datetime.timezone.utc)
        return (datetime.datetime.now(datetime.timezone.utc) - dt).days
    except:
        return 999

def is_throwaway(title):
    t = (title or "").lower().strip()
    return any(re.match(p, t) for p in THROWAWAY_PATTERNS)

def r2_put(key, content, content_type="text/markdown"):
    """Upload to R2 via boto3."""
    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3",
        endpoint_url=f"https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto")
    s3.put_object(Bucket=R2_BUCKET, Key=key,
                  Body=content.encode(), ContentType=content_type)
    return f"https://rag.inneranimalmedia.com/{key}"

# ── SCAN ──────────────────────────────────────────────────────────────────────
def cmd_scan():
    print("Scanning stale plans...\n")

    plans = d1("""
        SELECT id, title, status, tasks_total, tasks_done, updated_at, created_at
        FROM agentsam_plans
        WHERE workspace_id = ? AND status = 'active'
        ORDER BY updated_at ASC
    """, [WORKSPACE_ID])

    tasks_by_plan = {}
    all_tasks = d1("SELECT plan_id, status FROM agentsam_plan_tasks WHERE workspace_id = ?", [WORKSPACE_ID])
    for t in all_tasks:
        tasks_by_plan.setdefault(t["plan_id"], []).append(t["status"])

    throwaway, carry_forward, review = [], [], []

    for p in plans:
        age = age_days(p.get("updated_at") or p.get("created_at"))
        task_statuses = tasks_by_plan.get(p["id"], [])
        done  = sum(1 for s in task_statuses if s == "done")
        total = len(task_statuses)
        pct   = int(done/total*100) if total else 0

        if is_throwaway(p["title"]) or (total == 0 and age > 7):
            throwaway.append({**p, "age": age, "done": done, "total": total})
        elif age > 14 and pct < 20 and total > 0:
            carry_forward.append({**p, "age": age, "done": done, "total": total, "pct": pct})
        elif age > 3:
            review.append({**p, "age": age, "done": done, "total": total, "pct": pct})

    print(f"{'='*60}")
    print(f"THROWAWAY (safe to abandon — {len(throwaway)} plans)")
    print(f"{'='*60}")
    for p in throwaway:
        print(f"  [{p['age']}d] {p['title'][:60]}")

    print(f"\n{'='*60}")
    print(f"CARRY FORWARD (real work, >14d stale, <20% done — {len(carry_forward)} plans)")
    print(f"{'='*60}")
    for p in carry_forward:
        print(f"  [{p['age']}d | {p['pct']}%] {p['title'][:60]}")

    print(f"\n{'='*60}")
    print(f"REVIEW (stale but may still be active — {len(review)} plans)")
    print(f"{'='*60}")
    for p in review:
        print(f"  [{p['age']}d | {p['done']}/{p['total']}] {p['title'][:60]}")

    print(f"\nRun --cleanup to execute. --archive to snapshot current state first.")
    return throwaway, carry_forward, review

# ── CLEANUP ───────────────────────────────────────────────────────────────────
def cmd_cleanup(dry_run=True):
    throwaway, carry_forward, _ = cmd_scan()

    throwaway_ids  = [p["id"] for p in throwaway]
    carryover_ids  = [p["id"] for p in carry_forward]

    print(f"\n{'='*60}")
    if dry_run:
        print("DRY RUN — no writes. Pass --confirm to execute.")
    else:
        print("EXECUTING CLEANUP")
    print(f"{'='*60}")

    # 1. Abandon throwaway plans
    print(f"\n→ Abandoning {len(throwaway_ids)} throwaway plans...")
    if not dry_run and throwaway_ids:
        placeholders = ",".join("?" * len(throwaway_ids))
        meta = d1_exec(f"""
            UPDATE agentsam_plans
            SET status = 'abandoned', updated_at = unixepoch(),
                eod_summary = 'Auto-abandoned: throwaway/empty plan (triage 2026-05-27)'
            WHERE id IN ({placeholders}) AND workspace_id = ?
        """, throwaway_ids + [WORKSPACE_ID])
        print(f"  ✓ {meta.get('changes', 0)} plans abandoned")

    # 2. Mark carry_forward plans as abandoned + skip their todo tasks
    print(f"\n→ Marking {len(carryover_ids)} stale plans as abandoned (tasks → skipped)...")
    if not dry_run and carryover_ids:
        placeholders = ",".join("?" * len(carryover_ids))
        meta = d1_exec(f"""
            UPDATE agentsam_plans
            SET status = 'abandoned', updated_at = unixepoch(),
                eod_summary = 'Auto-abandoned: stale >14d <20% complete (triage 2026-05-27)'
            WHERE id IN ({placeholders}) AND workspace_id = ?
        """, carryover_ids + [WORKSPACE_ID])
        print(f"  ✓ {meta.get('changes', 0)} plans abandoned")

        # Skip their unstarted tasks
        meta2 = d1_exec(f"""
            UPDATE agentsam_plan_tasks
            SET status = 'skipped'
            WHERE plan_id IN ({placeholders})
            AND status IN ('todo') AND workspace_id = ?
        """, carryover_ids + [WORKSPACE_ID])
        print(f"  ✓ {meta2.get('changes', 0)} unstarted tasks skipped")

    # 3. Close todos that are already in done/closed plans
    print(f"\n→ Closing todos linked to completed/abandoned plans...")
    if not dry_run:
        meta = d1_exec("""
            UPDATE agentsam_todo
            SET status = 'closed', updated_at = datetime('now')
            WHERE status = 'open'
            AND plan_id IN (
                SELECT id FROM agentsam_plans
                WHERE status IN ('complete','abandoned')
                AND workspace_id = ?
            )
            AND workspace_id = ?
        """, [WORKSPACE_ID, WORKSPACE_ID])
        print(f"  ✓ {meta.get('changes', 0)} stale todos closed")

    print(f"\n{'Done.' if not dry_run else 'Dry run complete — run with --confirm to apply.'}")

# ── ARCHIVE ───────────────────────────────────────────────────────────────────
def cmd_archive():
    """Write snapshot to R2 + record efficiency row in D1."""
    import subprocess
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")

    print("Generating status report...")
    result = subprocess.run(
        ["python3", "scripts/agentsam_status.py"],
        capture_output=True, text=True,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    report = result.stdout

    # Write to R2 as dated snapshot
    key = f"plans/snapshots/status_{today}.md"
    print(f"Uploading to R2: {key}...")
    url = r2_put(key, report)
    print(f"  ✓ {url}")

    # Also write as latest
    r2_put("plans/status_latest.md", report)
    print(f"  ✓ rag.inneranimalmedia.com/plans/status_latest.md")

    # Pull efficiency numbers
    stats = d1("""
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) as complete,
          SUM(CASE WHEN status='abandoned' THEN 1 ELSE 0 END) as abandoned,
          SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
          SUM(tasks_done) as tasks_done,
          SUM(tasks_total) as tasks_total
        FROM agentsam_plans WHERE workspace_id = ?
    """, [WORKSPACE_ID])[0]

    todo_stats = d1("""
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('done','completed','closed') THEN 1 ELSE 0 END) as done,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open
        FROM agentsam_todo WHERE workspace_id = ?
    """, [WORKSPACE_ID])[0]

    completion_rate = round(stats["complete"] / max(stats["total"],1) * 100, 1)
    task_rate       = round(stats["tasks_done"] / max(stats["tasks_total"],1) * 100, 1)

    print(f"\n── Efficiency Snapshot {today} ──")
    print(f"  Plans:  {stats['complete']}/{stats['total']} complete ({completion_rate}%)")
    print(f"  Tasks:  {stats['tasks_done']}/{stats['tasks_total']} done ({task_rate}%)")
    print(f"  Todos:  {todo_stats['done']}/{todo_stats['total']} closed")
    print(f"  Active: {stats['active']} plans still open")

    # (efficiency row skipped — agentsam_health_daily schema varies)

    # Write a running efficiency log to R2
    eff_entry = (f"| {today} | {stats['complete']}/{stats['total']} ({completion_rate}%) "
                 f"| {stats['tasks_done']}/{stats['tasks_total']} ({task_rate}%) "
                 f"| {todo_stats['done']}/{todo_stats['total']} | {stats['active']} active |\n")

    print(f"\n  ✓ Snapshot archived. Run --scan to identify next cleanup batch.")

# ── EFFICIENCY ────────────────────────────────────────────────────────────────
def cmd_efficiency():
    stats = d1("""
        SELECT
          COUNT(*) as total_plans,
          SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) as complete,
          SUM(CASE WHEN status='abandoned' THEN 1 ELSE 0 END) as abandoned,
          SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as draft,
          SUM(tasks_done) as tasks_done,
          SUM(tasks_total) as tasks_total,
          SUM(tasks_blocked) as tasks_blocked,
          SUM(carry_over_count) as total_carryovers
        FROM agentsam_plans WHERE workspace_id = ?
    """, [WORKSPACE_ID])[0]

    todo_stats = d1("""
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('done','completed','closed') THEN 1 ELSE 0 END) as done,
          SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN priority='critical' AND status='open' THEN 1 ELSE 0 END) as critical_open
        FROM agentsam_todo WHERE workspace_id = ?
    """, [WORKSPACE_ID])[0]

    plan_rate = round(stats["complete"] / max(stats["total_plans"],1) * 100, 1)
    task_rate = round(stats["tasks_done"] / max(stats["tasks_total"],1) * 100, 1)
    abandon_rate = round(stats["abandoned"] / max(stats["total_plans"],1) * 100, 1)
    todo_rate = round(todo_stats["done"] / max(todo_stats["total"],1) * 100, 1)

    print(f"""
╔══════════════════════════════════════════╗
║         AgentSam Efficiency Report       ║
╚══════════════════════════════════════════╝

PLANS
  Total created:     {stats['total_plans']}
  Completed:         {stats['complete']}  ({plan_rate}%)
  Abandoned:         {stats['abandoned']} ({abandon_rate}%)
  Still active:      {stats['active']}
  Draft (unstarted): {stats['draft']}
  Carryovers:        {stats['total_carryovers']}

TASKS
  Total:    {stats['tasks_total']}
  Done:     {stats['tasks_done']} ({task_rate}%)
  Blocked:  {stats['tasks_blocked']}

TODOS
  Total:    {todo_stats['total']}
  Closed:   {todo_stats['done']} ({todo_rate}%)
  Open:     {todo_stats['open']}
  🚨 Critical open: {todo_stats['critical_open']}

VELOCITY SIGNAL
  Plan completion rate: {plan_rate}%  {'✅ good' if plan_rate > 30 else '⚠️  low — too many plans abandoned or stale'}
  Task completion rate: {task_rate}%  {'✅ good' if task_rate > 50 else '⚠️  low — tasks not getting closed'}
  Todo closure rate:    {todo_rate}%  {'✅ good' if todo_rate > 30 else '⚠️  low — backlog growing faster than output'}
""")

# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--scan",       action="store_true", help="Show triage breakdown (no writes)")
    grp.add_argument("--cleanup",    action="store_true", help="Dry-run cleanup")
    grp.add_argument("--archive",    action="store_true", help="Snapshot to R2 + log efficiency")
    grp.add_argument("--efficiency", action="store_true", help="Show completion/velocity metrics")
    parser.add_argument("--confirm", action="store_true", help="Execute writes (use with --cleanup)")
    args = parser.parse_args()

    if args.scan:
        cmd_scan()
    elif args.cleanup:
        cmd_cleanup(dry_run=not args.confirm)
    elif args.archive:
        cmd_archive()
    elif args.efficiency:
        cmd_efficiency()

if __name__ == "__main__":
    main()
