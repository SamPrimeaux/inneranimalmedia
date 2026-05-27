#!/usr/bin/env python3
"""
agentsam_status.py — Pull agentsam_plans, agentsam_plan_tasks, agentsam_todo
from D1 and generate a formatted markdown status report.

stdlib only.

Usage:
  python3 scripts/agentsam_status.py
  python3 scripts/agentsam_status.py --output reports/status.md
  python3 scripts/agentsam_status.py --stale-days 2
"""

import os, json, sys, argparse, urllib.request, datetime

CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT_ID  = "ede6590ac0d2fb7daf155b35653457b2"
D1_DATABASE_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
WORKSPACE_ID   = "ws_inneranimalmedia"

# ── D1 ────────────────────────────────────────────────────────────────────────
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
        return json.loads(r.read())["result"][0]["results"]

# ── Staleness ─────────────────────────────────────────────────────────────────
def is_stale(ts, stale_days):
    if not ts:
        return True
    try:
        # handle both unix int and ISO string
        if isinstance(ts, (int, float)):
            dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        else:
            ts = ts.replace("Z","").replace(" ","T")
            dt = datetime.datetime.fromisoformat(ts).replace(tzinfo=datetime.timezone.utc)
        age = datetime.datetime.now(datetime.timezone.utc) - dt
        return age.days >= stale_days
    except Exception:
        return False

def age_str(ts):
    if not ts:
        return "unknown age"
    try:
        if isinstance(ts, (int, float)):
            dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        else:
            ts = ts.replace("Z","").replace(" ","T")
            dt = datetime.datetime.fromisoformat(ts).replace(tzinfo=datetime.timezone.utc)
        age = datetime.datetime.now(datetime.timezone.utc) - dt
        d, s = age.days, age.seconds
        if d > 0:   return f"{d}d ago"
        if s > 3600: return f"{s//3600}h ago"
        return f"{s//60}m ago"
    except Exception:
        return str(ts)[:10]

# ── Status icons ──────────────────────────────────────────────────────────────
PLAN_ICON = {
    "complete": "✅", "active": "🔄", "draft": "📝",
    "abandoned": "🗑️"
}
TASK_ICON = {
    "done": "✅", "todo": "⬜", "in_progress": "🔵",
    "blocked": "🔴", "carried": "🔁", "skipped": "⏭️"
}
TODO_ICON = {
    "done": "✅", "completed": "✅", "closed": "✅",
    "open": "⬜", "in_progress": "🔵", "blocked": "🔴"
}
PRIORITY_ICON = {"P0": "🚨", "P1": "🔥", "P2": "🟡", "P3": "⚪"}
TODO_PRI_ICON = {"critical": "🚨", "high": "🔥", "medium": "🟡", "low": "⚪"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=None,
        help="Output file path (default: print to stdout)")
    parser.add_argument("--stale-days", type=int, default=3,
        help="Plans/tasks inactive this many days are flagged stale (default: 3)")
    args = parser.parse_args()

    print("Fetching plans...", file=sys.stderr)
    plans = d1("""
        SELECT id, title, status, plan_type, plan_date, tasks_total, tasks_done,
               tasks_blocked, cost_usd, tokens_used, morning_brief, eod_summary,
               updated_at, created_at, carry_over_count, risk_level
        FROM agentsam_plans
        WHERE workspace_id = ?
        ORDER BY updated_at DESC, created_at DESC
    """, [WORKSPACE_ID])

    print("Fetching plan tasks...", file=sys.stderr)
    tasks = d1("""
        SELECT id, plan_id, title, status, priority, category, order_index,
               blocked_reason, notes, output_summary, tokens_used, cost_usd,
               started_at, completed_at, created_at, assigned_model, risk_level
        FROM agentsam_plan_tasks
        WHERE workspace_id = ?
        ORDER BY plan_id, order_index ASC
    """, [WORKSPACE_ID])

    print("Fetching todos...", file=sys.stderr)
    todos = d1("""
        SELECT id, title, description, status, priority, category, tags,
               due_date, created_at, updated_at, notes, project_key,
               assigned_to, execution_status, plan_id,
               linked_route, linked_table, error_trace
        FROM agentsam_todo
        WHERE workspace_id = ?
        ORDER BY
          CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                        WHEN 'medium' THEN 2 ELSE 3 END,
          updated_at DESC
    """, [WORKSPACE_ID])

    # ── Index tasks by plan ───────────────────────────────────────────────────
    tasks_by_plan = {}
    for t in tasks:
        tasks_by_plan.setdefault(t["plan_id"], []).append(t)

    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    stale_days = args.stale_days

    # ── Stats ─────────────────────────────────────────────────────────────────
    plan_counts  = {}
    for p in plans:
        plan_counts[p["status"]] = plan_counts.get(p["status"], 0) + 1
    task_counts  = {}
    for t in tasks:
        task_counts[t["status"]] = task_counts.get(t["status"], 0) + 1
    todo_counts  = {}
    for t in todos:
        todo_counts[t["status"]] = todo_counts.get(t["status"], 0) + 1

    stale_plans  = [p for p in plans if p["status"] == "active"
                    and is_stale(p.get("updated_at") or p.get("created_at"), stale_days)]
    blocked_tasks = [t for t in tasks if t["status"] == "blocked"]
    open_todos   = [t for t in todos if t["status"] == "open"]
    done_todos   = [t for t in todos if t["status"] in ("done","completed","closed")]

    total_cost   = sum((p.get("cost_usd") or 0) for p in plans)
    total_tokens = sum((p.get("tokens_used") or 0) for p in plans)

    # ── Build markdown ────────────────────────────────────────────────────────
    lines = []
    def h(n, txt): lines.append(f"{'#'*n} {txt}")
    def ln(txt=""): lines.append(txt)

    h(1, f"AgentSam Status Report")
    ln(f"*Generated: {now_str} · Workspace: {WORKSPACE_ID}*")
    ln()

    # Summary table
    h(2, "Summary")
    ln("| | Total | Active/Open | Done | Blocked | Stale |")
    ln("|---|---|---|---|---|---|")
    ln(f"| **Plans** | {len(plans)} | {plan_counts.get('active',0)} | {plan_counts.get('complete',0)} | — | {len(stale_plans)} |")
    ln(f"| **Tasks** | {len(tasks)} | {task_counts.get('todo',0)+task_counts.get('in_progress',0)} | {task_counts.get('done',0)} | {task_counts.get('blocked',0)} | — |")
    ln(f"| **Todos** | {len(todos)} | {todo_counts.get('open',0)} | {sum(todo_counts.get(s,0) for s in ('done','completed','closed'))} | — | — |")
    ln()
    ln(f"**Total AI spend across plans:** ${total_cost:.4f} · {total_tokens:,} tokens")
    ln()

    # ── STALE PLANS ───────────────────────────────────────────────────────────
    if stale_plans:
        h(2, f"⚠️ Stale Active Plans ({len(stale_plans)}) — no update in {stale_days}+ days")
        ln("*These plans are marked active but haven't been touched. Recommend: close or carry over.*")
        ln()
        for p in stale_plans:
            upd = p.get("updated_at") or p.get("created_at")
            pts = tasks_by_plan.get(p["id"], [])
            done_c  = sum(1 for t in pts if t["status"] == "done")
            total_c = len(pts)
            ln(f"- **{p['title']}** `{p['id'][:12]}` — last updated {age_str(upd)} | {done_c}/{total_c} tasks done | ${p.get('cost_usd',0):.4f}")
        ln()

    # ── BLOCKED TASKS ─────────────────────────────────────────────────────────
    if blocked_tasks:
        h(2, f"🔴 Blocked Tasks ({len(blocked_tasks)})")
        for t in sorted(blocked_tasks, key=lambda x: x.get("priority","P2")):
            plan = next((p for p in plans if p["id"] == t["plan_id"]), None)
            plan_title = plan["title"] if plan else t["plan_id"][:12]
            icon = PRIORITY_ICON.get(t.get("priority","P2"),"🟡")
            ln(f"- {icon} **{t['title']}** ← *{plan_title}*")
            if t.get("blocked_reason"):
                ln(f"  - Reason: {t['blocked_reason']}")
        ln()

    # ── IN-PROGRESS TASKS ─────────────────────────────────────────────────────
    in_progress = [t for t in tasks if t["status"] == "in_progress"]
    if in_progress:
        h(2, f"🔵 In Progress ({len(in_progress)})")
        for t in in_progress:
            plan = next((p for p in plans if p["id"] == t["plan_id"]), None)
            plan_title = plan["title"] if plan else t["plan_id"][:12]
            started = age_str(t.get("started_at")) if t.get("started_at") else "not started"
            ln(f"- **{t['title']}** ← *{plan_title}* | started {started}")
        ln()

    # ── ACTIVE PLANS ──────────────────────────────────────────────────────────
    active_fresh = [p for p in plans if p["status"] == "active" and p not in stale_plans]
    h(2, f"🔄 Active Plans ({len(active_fresh)} fresh · {len(stale_plans)} stale)")
    ln()

    for p in active_fresh:
        upd  = p.get("updated_at") or p.get("created_at")
        pts  = tasks_by_plan.get(p["id"], [])
        done_c    = sum(1 for t in pts if t["status"] == "done")
        blocked_c = sum(1 for t in pts if t["status"] == "blocked")
        todo_c    = sum(1 for t in pts if t["status"] == "todo")
        inprog_c  = sum(1 for t in pts if t["status"] == "in_progress")
        pct  = int((done_c / len(pts) * 100)) if pts else 0
        bar  = "█" * (pct // 10) + "░" * (10 - pct // 10)

        h(3, f"{p['title']}")
        ln(f"`{p['id'][:16]}` · {p.get('plan_type','daily')} · updated {age_str(upd)} · ${p.get('cost_usd',0):.4f}")
        ln()
        ln(f"Progress: `{bar}` {pct}% — {done_c} done · {todo_c} todo · {inprog_c} in progress · {blocked_c} blocked")
        ln()

        if p.get("morning_brief"):
            ln(f"> {p['morning_brief'][:200].strip()}")
            ln()

        if pts:
            # Group by status
            for status_group, icon in [("in_progress","🔵"),("blocked","🔴"),
                                        ("todo","⬜"),("done","✅"),
                                        ("carried","🔁"),("skipped","⏭️")]:
                group = [t for t in pts if t["status"] == status_group]
                if not group:
                    continue
                for t in group:
                    pri = PRIORITY_ICON.get(t.get("priority","P1"),"🟡")
                    cat = f"`{t['category']}`" if t.get("category") else ""
                    ln(f"  - {icon} {pri} **{t['title']}** {cat}")
                    if t.get("blocked_reason"):
                        ln(f"    - 🔴 {t['blocked_reason']}")
                    if t.get("output_summary") and status_group == "done":
                        ln(f"    - ✓ {t['output_summary'][:120]}")
        ln()

    # ── COMPLETE PLANS ────────────────────────────────────────────────────────
    complete_plans = [p for p in plans if p["status"] == "complete"]
    if complete_plans:
        h(2, f"✅ Complete Plans ({len(complete_plans)})")
        for p in complete_plans:
            upd = p.get("updated_at") or p.get("created_at")
            ln(f"- **{p['title']}** — completed {age_str(upd)} · ${p.get('cost_usd',0):.4f}")
        ln()

    # ── OPEN TODOS ────────────────────────────────────────────────────────────
    h(2, f"📋 Open Todos ({len(open_todos)})")
    ln()

    # Group by priority
    for pri in ["critical","high","medium","low"]:
        group = [t for t in open_todos if t.get("priority") == pri]
        if not group:
            continue
        icon = TODO_PRI_ICON.get(pri, "⚪")
        h(3, f"{icon} {pri.capitalize()} ({len(group)})")
        for t in group:
            proj = f"`{t['project_key']}`" if t.get("project_key") else ""
            cat  = f"`{t['category']}`" if t.get("category") else ""
            due  = f" · due {t['due_date']}" if t.get("due_date") else ""
            ln(f"- **{t['title']}** {proj} {cat}{due}")
            if t.get("description"):
                ln(f"  {t['description'][:120]}")
        ln()

    # ── DONE TODOS ────────────────────────────────────────────────────────────
    h(2, f"✅ Closed / Done Todos ({len(done_todos)})")
    for t in done_todos[:30]:  # cap at 30
        upd = t.get("updated_at") or t.get("created_at")
        ln(f"- ~~{t['title']}~~ — {age_str(upd)}")
    if len(done_todos) > 30:
        ln(f"- *...and {len(done_todos)-30} more*")
    ln()

    # ── CARRIED TASKS ─────────────────────────────────────────────────────────
    carried = [t for t in tasks if t["status"] == "carried"]
    if carried:
        h(2, f"🔁 Carried Over Tasks ({len(carried)})")
        for t in carried:
            plan = next((p for p in plans if p["id"] == t["plan_id"]), None)
            plan_title = plan["title"] if plan else t["plan_id"][:12]
            ln(f"- **{t['title']}** ← *{plan_title}*")
        ln()

    # ── DRAFT PLANS ───────────────────────────────────────────────────────────
    draft_plans = [p for p in plans if p["status"] == "draft"]
    if draft_plans:
        h(2, f"📝 Draft Plans ({len(draft_plans)})")
        for p in draft_plans:
            ln(f"- **{p['title']}** — created {age_str(p.get('created_at'))}")
        ln()

    # ── OUTPUT ────────────────────────────────────────────────────────────────
    output = "\n".join(lines)
    if args.output:
        os.makedirs(os.path.dirname(args.output), exist_ok=True) if os.path.dirname(args.output) else None
        with open(args.output, "w") as f:
            f.write(output)
        print(f"✓ Written to {args.output}", file=sys.stderr)
    else:
        print(output)

if __name__ == "__main__":
    main()
