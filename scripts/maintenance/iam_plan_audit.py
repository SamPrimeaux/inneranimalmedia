#!/usr/bin/env python3
"""
iam_plan_audit.py — Inner Animal Media D1 Plan/Task/Todo Health Check
Usage: CLOUDFLARE_API_TOKEN=xxx python3 iam_plan_audit.py
Outputs a scannable summary with flagged problems. No mutations.
"""

import os, sys, json, requests
from datetime import datetime, timezone
from collections import defaultdict

DB_ID   = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
ACCT_ID = "ede6590ac0d2fb7daf155b35653457b2"
TOKEN   = os.environ.get("CLOUDFLARE_API_TOKEN", "")
BASE    = f"https://api.cloudflare.com/client/v4/accounts/{ACCT_ID}/d1/database/{DB_ID}/query"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

CANONICAL_TENANT    = "tenant_sam_primeaux"
CANONICAL_WORKSPACE = "ws_inneranimalmedia"
STALE_DAYS          = 7   # active plans with zero progress older than this

def q(sql):
    r = requests.post(BASE, headers=HEADERS, json={"sql": sql})
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise RuntimeError(data)
    return data["result"][0]["results"]

def ts_to_date(ts):
    if ts is None: return "—"
    try:
        if isinstance(ts, str): return ts[:10]
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")
    except: return str(ts)

def age_days(ts):
    try:
        if isinstance(ts, str): t = datetime.fromisoformat(ts.replace("Z","")).replace(tzinfo=timezone.utc)
        else: t = datetime.fromtimestamp(int(ts), tz=timezone.utc)
        return (datetime.now(tz=timezone.utc) - t).days
    except: return 0

# ── fetch ─────────────────────────────────────────────────────────────────────

plans = q("SELECT id,title,status,tasks_total,tasks_done,tenant_id,workspace_id,created_at FROM agentsam_plans ORDER BY created_at DESC")
tasks = q("SELECT plan_id,COUNT(*) as cnt, COUNT(CASE WHEN status='done' THEN 1 END) as done, COUNT(CASE WHEN status='blocked' THEN 1 END) as blocked, COUNT(CASE WHEN tenant_id IS NULL OR workspace_id IS NULL THEN 1 END) as null_scope FROM agentsam_plan_tasks GROUP BY plan_id")
todos = q("SELECT id,title,status,priority,tenant_id,workspace_id,created_at FROM agentsam_todo ORDER BY created_at DESC")

task_map = {t["plan_id"]: t for t in tasks}

# ── classify plans ────────────────────────────────────────────────────────────

BAD_TENANTS     = {"iam","inneranimalmedia","tenant_inneranimalmedia","agentsam"}
BAD_WORKSPACES  = {"global","agentsam",None}
TITLE_SEEN      = defaultdict(list)
for p in plans:
    TITLE_SEEN[p["title"].strip().lower()].append(p["id"])

flags = defaultdict(list)  # plan_id → [flag strings]

for p in plans:
    pid   = p["id"]
    tm    = task_map.get(pid, {})
    acnt  = tm.get("cnt",0)
    ttl   = p["tasks_total"] or 0
    tdone = p["tasks_done"] or 0
    age   = age_days(p["created_at"])

    if abs(acnt - ttl) > 0:
        flags[pid].append(f"tasks_total={ttl} but actual={acnt} (Δ{acnt-ttl:+d})")
    if tm.get("null_scope",0) > 0:
        flags[pid].append(f"{tm['null_scope']}/{acnt} tasks missing tenant/workspace scope")
    if p["tenant_id"] in BAD_TENANTS:
        flags[pid].append(f"legacy tenant_id='{p['tenant_id']}'")
    if p["workspace_id"] in BAD_WORKSPACES:
        flags[pid].append(f"bad workspace_id='{p['workspace_id']}'")
    if p["status"] == "active" and tdone == 0 and ttl > 0 and age > STALE_DAYS:
        flags[pid].append(f"STALE — {age}d old, 0% progress")
    if p["status"] == "active" and ttl > 0 and tdone == ttl:
        flags[pid].append("all tasks done but status still 'active' — should be closed")
    if p["status"] == "complete" and ttl > 0 and tdone < ttl:
        flags[pid].append(f"marked complete but only {tdone}/{ttl} tasks done")
    if ttl == 0 and acnt == 0 and p["status"] not in ("draft",):
        flags[pid].append("empty plan — no tasks, not draft")
    if len(TITLE_SEEN[p["title"].strip().lower()]) > 1:
        flags[pid].append("DUPLICATE TITLE")

# ── print ─────────────────────────────────────────────────────────────────────

W = 90
def sep(char="─"): print(char * W)
def hdr(txt): sep("═"); print(f"  {txt}"); sep("═")

now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
hdr(f"IAM D1 PLAN/TASK/TODO AUDIT  ·  {now}")

# ── stats ──────────────────────────────────────────────────────────────────────
status_counts = defaultdict(int)
for p in plans: status_counts[p["status"]] += 1
total_tasks_rows = sum(t.get("cnt",0) for t in tasks)
null_scoped_tasks = sum(t.get("null_scope",0) for t in tasks)
flagged_plans = sum(1 for pid in flags if flags[pid])

print(f"\n  Plans total : {len(plans)}")
for s,c in sorted(status_counts.items()): print(f"    {s:<12}: {c}")
print(f"\n  Task rows   : {total_tasks_rows}")
print(f"  Null-scoped : {null_scoped_tasks} tasks")
print(f"\n  Flagged plans : {flagged_plans}/{len(plans)}")
print()

# ── flagged plans ──────────────────────────────────────────────────────────────
hdr("FLAGGED PLANS (problems to address)")

SEVERITY = ["STALE","DUPLICATE","tasks_total","null_scope","legacy tenant","bad workspace","empty plan","all tasks done","marked complete"]

def severity_score(flist):
    score = 0
    for f in flist:
        for i,kw in enumerate(SEVERITY):
            if kw in f: score = max(score, len(SEVERITY)-i)
    return score

sorted_plans = sorted(plans, key=lambda p: -severity_score(flags.get(p["id"],[])))

for p in sorted_plans:
    pid = p["id"]
    fl  = flags.get(pid, [])
    if not fl: continue
    tm   = task_map.get(pid, {})
    acnt = tm.get("cnt", 0)
    done = tm.get("done", 0)
    sep()
    pct = f"{done}/{acnt}" if acnt else "0/0"
    print(f"  {pid}")
    print(f"  {p['title'][:70]}")
    print(f"  status={p['status']}  progress={pct}  tenant={p['tenant_id']}  ws={p['workspace_id']}  age={age_days(p['created_at'])}d")
    for f in fl:
        print(f"  ⚠️  {f}")
print()

# ── clean active plans ─────────────────────────────────────────────────────────
hdr("ACTIVE PLANS — CLEAN (no flags)")
clean = [p for p in plans if p["status"]=="active" and not flags.get(p["id"])]
for p in clean:
    pid = p["id"]
    tm  = task_map.get(pid, {})
    acnt= tm.get("cnt",0)
    done= tm.get("done",0)
    blk = tm.get("blocked",0)
    bar = f"{done}/{acnt}"
    blk_str = f"  [{blk} blocked]" if blk else ""
    print(f"  {bar:<8} {p['title'][:60]}{blk_str}")
print()

# ── todos ──────────────────────────────────────────────────────────────────────
hdr("TODO TABLE HEALTH")

open_todos  = [t for t in todos if t["status"] in ("open","pending")]
closed_todos= [t for t in todos if t["status"] in ("done","closed","complete")]
bad_ids     = [t for t in todos if t["id"].startswith("task_")]
null_ws     = [t for t in todos if not t.get("workspace_id")]

print(f"  Total     : {len(todos)}")
print(f"  Open      : {len(open_todos)}")
print(f"  Closed    : {len(closed_todos)}")
print(f"  ⚠️  task_ IDs in todo table (wrong table): {len(bad_ids)}")
print(f"  ⚠️  null workspace_id                    : {len(null_ws)}")

if open_todos:
    print("\n  Open todos (priority sorted):")
    pri_order = {"critical":0,"high":1,"medium":2,"low":3}
    for t in sorted(open_todos, key=lambda x: pri_order.get(x.get("priority","low"),9)):
        age = age_days(t["created_at"])
        print(f"  [{t.get('priority','?'):<8}] {t['id'][:40]:<42} {age}d  {t['title'][:50]}")

if bad_ids:
    print("\n  ⚠️  task_ IDs polluting todo table:")
    for t in bad_ids:
        print(f"    {t['id']}  →  {t['title'][:60]}")

sep("═")
print("  Audit complete. No mutations were made.")
sep("═")
