#!/usr/bin/env python3
"""
audit_plan_debt.py
==================
Agent Sam — Plan Debt Triage
Reads ALL active plans and tasks from D1 via the worker API and produces
a triage report: zombie plans, blocked tasks, duplicate titles, completion
rate, age buckets, and a recommended work order.

Run from repo root:
    python3 scripts/audit_plan_debt.py

Requires:
    WORKER_URL             (e.g. https://inneranimalmedia.com)
    CLOUDFLARE_API_TOKEN  (bearer token used by the worker/API gateway)

Output:
    scripts/audit_plan_debt_report.md
    scripts/audit_plan_debt_data.json
"""

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import urllib.error
import urllib.request as urlreq

NOW = datetime.now(timezone.utc).isoformat()
REPO_ROOT = Path(os.getcwd())
REPORT_PATH = REPO_ROOT / "scripts" / "audit_plan_debt_report.md"
DATA_PATH = REPO_ROOT / "scripts" / "audit_plan_debt_data.json"

WORKER_URL = os.environ.get("WORKER_URL", "https://inneranimalmedia.com").rstrip("/")
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")

# Fallback: paste SQL/API output here when API is unavailable.
EMBEDDED_PLANS: list[dict[str, Any]] = []


def fetch_json(path: str) -> Any | None:
    if not CLOUDFLARE_API_TOKEN:
        return None
    try:
        req = urlreq.Request(
            f"{WORKER_URL}{path}",
            headers={
                "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        with urlreq.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        print(f"  [warn] API call failed: {path} — {exc}")
        return None


def coerce_epoch_or_iso_to_age_days(value: Any) -> int:
    if value in (None, ""):
        return 0
    try:
        if isinstance(value, (int, float)) or str(value).isdigit():
            dt = datetime.fromtimestamp(int(value), tz=timezone.utc)
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - dt).days)
    except Exception:
        return 0


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def completion_pct(done: Any, total: Any) -> float:
    done_i = safe_int(done)
    total_i = safe_int(total)
    return round((done_i / total_i) * 100, 1) if total_i > 0 else 0.0


def normalize_plans(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]
    if isinstance(payload, dict):
        for key in ("plans", "data", "rows", "results", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return [p for p in value if isinstance(p, dict)]
        return [p for p in payload.values() if isinstance(p, dict)]
    return []


def classify_plans(plans: list[dict[str, Any]]) -> dict[str, Any]:
    zombie = []
    stalled = []
    blocked = []
    no_tasks = []
    near_done = []
    healthy = []
    title_normalized: dict[str, list[str]] = defaultdict(list)

    for plan in plans:
        age = coerce_epoch_or_iso_to_age_days(plan.get("created_at") or plan.get("plan_date"))
        done = safe_int(plan.get("tasks_done"))
        total = safe_int(plan.get("tasks_total"))
        blocked_count = safe_int(plan.get("tasks_blocked"))
        pct = completion_pct(done, total)
        plan["_age_days"] = age
        plan["_completion_pct"] = pct

        title = str(plan.get("title", ""))
        slug = re.sub(r"[^a-z0-9]", "", title.lower())[:40] or "untitled"
        title_normalized[slug].append(str(plan.get("id", "missing_id")))

        if total == 0:
            no_tasks.append(plan)
        elif blocked_count > 0:
            blocked.append(plan)
        elif pct == 0 and age >= 7:
            zombie.append(plan)
        elif pct < 25 and age >= 3:
            stalled.append(plan)
        elif pct >= 75:
            near_done.append(plan)
        else:
            healthy.append(plan)

    duplicates = {slug: ids for slug, ids in title_normalized.items() if len(ids) > 1}

    return {
        "zombie": sorted(zombie, key=lambda x: -safe_int(x.get("_age_days"))),
        "stalled": sorted(stalled, key=lambda x: -safe_int(x.get("_age_days"))),
        "blocked": sorted(blocked, key=lambda x: -safe_int(x.get("tasks_blocked"))),
        "no_tasks": no_tasks,
        "near_done": sorted(near_done, key=lambda x: -float(x.get("_completion_pct", 0))),
        "healthy": healthy,
        "duplicates": duplicates,
    }


def build_work_order(classified: dict[str, Any]) -> list[dict[str, Any]]:
    order: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(plan: dict[str, Any], reason: str) -> None:
        plan_id = str(plan.get("id", "missing_id"))
        if plan_id in seen:
            return
        seen.add(plan_id)
        order.append(
            {
                "id": plan_id,
                "title": str(plan.get("title", "Untitled")),
                "reason": reason,
                "pct": plan.get("_completion_pct", 0),
                "age": plan.get("_age_days", 0),
                "type": plan.get("plan_type", "unknown"),
            }
        )

    for plan in classified["near_done"]:
        add(plan, "FINISH_FIRST — near completion")
    for plan in classified["blocked"]:
        add(plan, "UNBLOCK — has blocked tasks preventing progress")
    for plan in classified["healthy"]:
        add(plan, "CONTINUE — active and in progress")
    for plan in classified["no_tasks"]:
        add(plan, "NEEDS_TASKS — shell plan, add tasks or abandon")
    for plan in classified["stalled"]:
        add(plan, "REVIEW — stalled, confirm still relevant")
    for plan in classified["zombie"]:
        add(plan, "ABANDON_CANDIDATE — 0% progress, >7 days old")

    return order


def write_report(data: dict[str, Any]) -> None:
    lines: list[str] = []
    append = lines.append
    classified = data["classified"]
    plans = data["plans"]

    append("# Agent Sam — Plan Debt Triage Report")
    append(f"**Generated:** {NOW}")
    append("")
    append("## Summary")
    append("| Bucket | Count |")
    append("|--------|-------|")
    append(f"| Total active plans | {len(plans)} |")
    append(f"| Zero progress (zombie candidates) | {len(classified['zombie'])} |")
    append(f"| Stalled (<25%) | {len(classified['stalled'])} |")
    append(f"| Blocked | {len(classified['blocked'])} |")
    append(f"| No tasks (shells) | {len(classified['no_tasks'])} |")
    append(f"| Near done (>=75%) | {len(classified['near_done'])} |")
    append(f"| Healthy | {len(classified['healthy'])} |")
    append(f"| Duplicate title groups | {len(classified['duplicates'])} |")
    append("")

    append("## Recommended Work Order")
    append("| # | Plan | Type | % Done | Age (days) | Reason |")
    append("|---|------|------|--------|------------|--------|")
    for index, item in enumerate(data["work_order"], 1):
        title = str(item["title"]).replace("|", "-")[:70]
        append(f"| {index} | `{item['id']}` {title} | {item['type']} | {item['pct']}% | {item['age']}d | {item['reason']} |")
    append("")

    append("## Zombie Plans (0% progress, >=7 days old)")
    for plan in classified["zombie"]:
        append(f"- `{plan.get('id')}` — **{plan.get('title')}** ({plan.get('_age_days')}d old, {plan.get('tasks_total')} tasks)")
    append("")

    append("## Blocked Plans")
    for plan in classified["blocked"]:
        append(f"- `{plan.get('id')}` — **{plan.get('title')}** ({plan.get('tasks_blocked')} blocked)")
    append("")

    append("## Duplicate Title Groups")
    for slug, ids in classified["duplicates"].items():
        append(f"- `{slug[:30]}...`: {ids}")
    append("")

    append("## Shell Plans (no tasks)")
    for plan in classified["no_tasks"]:
        append(f"- `{plan.get('id')}` — {plan.get('title')}")
    append("")
    append("---")
    append(f"*Generated by `scripts/audit_plan_debt.py` at {NOW}*")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"[ok] Report -> {REPORT_PATH}")


def main() -> None:
    print(f"[->] Plan Debt Triage — {NOW}")
    raw_plans = fetch_json("/api/plans") or EMBEDDED_PLANS
    plans = normalize_plans(raw_plans)
    if not plans:
        print("[!] No plan data. Set WORKER_URL + CLOUDFLARE_API_TOKEN or populate EMBEDDED_PLANS.")
        return

    active = [plan for plan in plans if plan.get("status") == "active"]
    print(f"    {len(active)} active plans found")

    classified = classify_plans(active)
    work_order = build_work_order(classified)
    data = {
        "generated_at": NOW,
        "plans": active,
        "classified": classified,
        "work_order": work_order,
    }
    DATA_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    write_report(data)

    print(f"[ok] Data   -> {DATA_PATH}")
    print()
    print(f"  Zombie:    {len(classified['zombie'])}")
    print(f"  Stalled:   {len(classified['stalled'])}")
    print(f"  Blocked:   {len(classified['blocked'])}")
    print(f"  Near done: {len(classified['near_done'])}")
    print(f"  Dupes:     {len(classified['duplicates'])}")


if __name__ == "__main__":
    main()
