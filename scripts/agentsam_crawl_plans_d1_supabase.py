#!/usr/bin/env python3
"""
Crawl agentsam_plans + agentsam_plan_tasks from Cloudflare D1 and Supabase public mirror.

Produces a full inventory, open-work breakdown, and D1↔Supabase parity report.

Run from repo root:
  python3 scripts/agentsam_crawl_plans_d1_supabase.py

Env:
  IAM_D1_DB, IAM_WRANGLER_CONFIG, IAM_D1_REMOTE (default remote=1)
  SUPABASE_DB_URL  — session pooler :5432 (see .cursor/rules/supabase-connection.mdc)
  Loads .env.cloudflare when SUPABASE_DB_URL unset

Output:
  artifacts/agentsam_plans_crawl_<UTC>.json
  artifacts/agentsam_plans_crawl_<UTC>.md
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from plan_audit_common import AuditConfig, d1_query, now_iso, repo_root, safe_d1_query  # noqa: E402

OPEN_TASK_STATUSES = frozenset({"todo", "in_progress", "queued", "pending", "open"})
BLOCKED_STATUSES = frozenset({"blocked"})
DONE_STATUSES = frozenset({"done", "completed", "complete", "closed", "shipped"})
ACTIVE_PLAN_STATUSES = frozenset({"active", "open", "in_progress", "running"})


def load_env_cloudflare(root: Path) -> list[str]:
    """Load .env.cloudflare; always apply SUPABASE_DB_URL when present (pooler creds)."""
    path = root / ".env.cloudflare"
    notes: list[str] = []
    if not path.is_file():
        notes.append(".env.cloudflare not found — set SUPABASE_DB_URL for Supabase crawl")
        return notes
    force_keys = frozenset({"SUPABASE_DB_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"})
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'\"")
        if not key:
            continue
        if key in force_keys or key not in os.environ:
            os.environ[key] = val
    db_url = os.getenv("SUPABASE_DB_URL", "")
    if ":6543/" in db_url:
        notes.append(
            "SUPABASE_DB_URL uses port 6543 (transaction pooler). "
            "Scripts should use session pooler port 5432 — see .cursor/rules/supabase-connection.mdc"
        )
    return notes


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def normalize_status(value: Any) -> str:
    return str(value or "").strip().lower()


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def age_days_from_row(row: dict[str, Any]) -> int | None:
    for key in ("updated_at", "created_at", "plan_date", "completed_at"):
        raw = row.get(key)
        if raw in (None, ""):
            continue
        try:
            if isinstance(raw, (int, float)) or str(raw).isdigit():
                ts = int(raw)
                if ts > 1_000_000_000_000:
                    ts //= 1000
                dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            else:
                dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            return max(0, (datetime.now(timezone.utc) - dt).days)
        except (TypeError, ValueError, OSError):
            continue
    return None


def fetch_d1(cfg: AuditConfig) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    plans_sql = """
    SELECT *
    FROM agentsam_plans
    ORDER BY COALESCE(updated_at, created_at, 0) DESC, id ASC;
    """
    tasks_sql = """
    SELECT *
    FROM agentsam_plan_tasks
    ORDER BY plan_id ASC, COALESCE(order_index, 0) ASC, id ASC;
    """
    ok_p, plans = safe_d1_query(cfg, plans_sql)
    ok_t, tasks = safe_d1_query(cfg, tasks_sql)
    if not ok_p:
        warnings.append(f"D1 plans query failed: {plans}")
        plans = []
    if not ok_t:
        warnings.append(f"D1 tasks query failed: {tasks}")
        tasks = []
    return plans if isinstance(plans, list) else [], tasks if isinstance(tasks, list) else [], warnings


def fetch_supabase(db_url: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    if not db_url:
        return [], [], ["SUPABASE_DB_URL unset — skip Supabase crawl"]

    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        return [], [], ["psycopg2 missing — pip install psycopg2-binary"]

    plans: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []
    try:
        conn = psycopg2.connect(db_url, connect_timeout=20)
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT *
            FROM public.agentsam_plans
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id ASC;
            """
        )
        plans = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """
            SELECT *
            FROM public.agentsam_plan_tasks
            ORDER BY plan_id ASC, order_index ASC NULLS LAST, id ASC;
            """
        )
        tasks = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
    except Exception as exc:
        warnings.append(f"Supabase query failed: {exc}")
    return plans, tasks, warnings


def json_safe_row(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def index_by_id(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(r["id"]): r for r in rows if r.get("id")}


def task_counts_by_plan(tasks: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    by_plan: dict[str, dict[str, int]] = defaultdict(lambda: Counter())
    for t in tasks:
        pid = str(t.get("plan_id") or "")
        if not pid:
            continue
        st = normalize_status(t.get("status"))
        by_plan[pid]["total"] += 1
        if st in DONE_STATUSES:
            by_plan[pid]["done"] += 1
        elif st in BLOCKED_STATUSES:
            by_plan[pid]["blocked"] += 1
        elif st in OPEN_TASK_STATUSES:
            by_plan[pid]["open"] += 1
        else:
            by_plan[pid]["other"] += 1
    return {k: dict(v) for k, v in by_plan.items()}


def compare_plan_row(d1: dict[str, Any], pg: dict[str, Any]) -> list[str]:
    diffs: list[str] = []
    keys = ("status", "title", "tasks_total", "tasks_done", "tasks_blocked", "plan_date")
    for key in keys:
        a = d1.get(key)
        b = pg.get(key)
        if key.startswith("tasks_"):
            if safe_int(a) != safe_int(b):
                diffs.append(f"{key}: d1={a} pg={b}")
        else:
            sa, sb = str(a or "").strip(), str(b or "").strip()
            if sa != sb:
                diffs.append(f"{key}: d1={sa!r} pg={sb!r}")
    return diffs


def compare_task_row(d1: dict[str, Any], pg: dict[str, Any]) -> list[str]:
    diffs: list[str] = []
    keys = ("status", "title", "plan_id", "order_index", "priority", "category")
    for key in keys:
        a, b = d1.get(key), pg.get(key)
        if key == "order_index":
            if safe_int(a, -1) != safe_int(b, -1):
                diffs.append(f"{key}: d1={a} pg={b}")
        else:
            if str(a or "").strip().lower() != str(b or "").strip().lower():
                diffs.append(f"{key}: d1={a!r} pg={b!r}")
    d1_notes = str(d1.get("output_summary") or d1.get("notes") or "").strip()
    pg_notes = str(pg.get("notes") or pg.get("output_summary") or "").strip()
    if d1_notes and pg_notes and d1_notes != pg_notes and len(d1_notes) > 80:
        if d1_notes[:80] != pg_notes[:80]:
            diffs.append("notes/output_summary: content differs (truncated compare)")
    return diffs


def build_open_work(
    plans: list[dict[str, Any]],
    tasks: list[dict[str, Any]],
    source: str,
) -> dict[str, Any]:
    plan_by_id = index_by_id(plans)
    open_tasks: list[dict[str, Any]] = []
    blocked_tasks: list[dict[str, Any]] = []
    in_progress_tasks: list[dict[str, Any]] = []

    for t in tasks:
        st = normalize_status(t.get("status"))
        entry = {
            "source": source,
            "task_id": t.get("id"),
            "plan_id": t.get("plan_id"),
            "plan_title": (plan_by_id.get(str(t.get("plan_id") or "")) or {}).get("title"),
            "title": t.get("title"),
            "status": st,
            "priority": t.get("priority"),
            "category": t.get("category"),
            "blocked_reason": t.get("blocked_reason"),
            "order_index": t.get("order_index"),
        }
        if st in BLOCKED_STATUSES:
            blocked_tasks.append(entry)
        elif st == "in_progress":
            in_progress_tasks.append(entry)
        elif st in OPEN_TASK_STATUSES:
            open_tasks.append(entry)

    active_plans: list[dict[str, Any]] = []
    for p in plans:
        pst = normalize_status(p.get("status"))
        if pst not in ACTIVE_PLAN_STATUSES and pst != "":
            continue
        pid = str(p.get("id"))
        counts = task_counts_by_plan(tasks).get(pid, {})
        total_live = counts.get("total", 0)
        done_live = counts.get("done", 0)
        active_plans.append(
            {
                "source": source,
                "plan_id": pid,
                "title": p.get("title"),
                "status": pst,
                "plan_date": p.get("plan_date"),
                "tasks_total_col": safe_int(p.get("tasks_total")),
                "tasks_done_col": safe_int(p.get("tasks_done")),
                "tasks_blocked_col": safe_int(p.get("tasks_blocked")),
                "tasks_live_total": total_live,
                "tasks_live_done": done_live,
                "tasks_live_open": counts.get("open", 0),
                "tasks_live_blocked": counts.get("blocked", 0),
                "counter_drift": (
                    safe_int(p.get("tasks_total")) != total_live
                    or safe_int(p.get("tasks_done")) != done_live
                ),
                "age_days": age_days_from_row(p),
            }
        )

    return {
        "open_tasks": open_tasks,
        "in_progress_tasks": in_progress_tasks,
        "blocked_tasks": blocked_tasks,
        "active_plans": active_plans,
    }


def parity_report(
    d1_plans: list[dict[str, Any]],
    d1_tasks: list[dict[str, Any]],
    pg_plans: list[dict[str, Any]],
    pg_tasks: list[dict[str, Any]],
) -> dict[str, Any]:
    d1_plan_ids = {str(p["id"]) for p in d1_plans if p.get("id")}
    pg_plan_ids = {str(p["id"]) for p in pg_plans if p.get("id")}
    d1_task_ids = {str(t["id"]) for t in d1_tasks if t.get("id")}
    pg_task_ids = {str(t["id"]) for t in pg_tasks if t.get("id")}

    d1_plans_by_id = index_by_id(d1_plans)
    pg_plans_by_id = index_by_id(pg_plans)
    d1_tasks_by_id = index_by_id(d1_tasks)
    pg_tasks_by_id = index_by_id(pg_tasks)

    plan_diffs: list[dict[str, Any]] = []
    for pid in sorted(d1_plan_ids & pg_plan_ids):
        diffs = compare_plan_row(d1_plans_by_id[pid], pg_plans_by_id[pid])
        if diffs:
            plan_diffs.append({"plan_id": pid, "diffs": diffs})

    task_diffs: list[dict[str, Any]] = []
    for tid in sorted(d1_task_ids & pg_task_ids):
        diffs = compare_task_row(d1_tasks_by_id[tid], pg_tasks_by_id[tid])
        if diffs:
            task_diffs.append({"task_id": tid, "plan_id": d1_tasks_by_id[tid].get("plan_id"), "diffs": diffs})

    orphan_d1_tasks = [
        t for t in d1_tasks if str(t.get("plan_id") or "") not in d1_plan_ids
    ]
    orphan_pg_tasks = [
        t for t in pg_tasks if str(t.get("plan_id") or "") not in pg_plan_ids
    ]

    d1_counts = task_counts_by_plan(d1_tasks)
    counter_drift: list[dict[str, Any]] = []
    for p in d1_plans:
        pid = str(p.get("id") or "")
        live = d1_counts.get(pid, {})
        if (
            safe_int(p.get("tasks_total")) != live.get("total", 0)
            or safe_int(p.get("tasks_done")) != live.get("done", 0)
            or safe_int(p.get("tasks_blocked")) != live.get("blocked", 0)
        ):
            counter_drift.append(
                {
                    "plan_id": pid,
                    "title": p.get("title"),
                    "columns": {
                        "tasks_total": safe_int(p.get("tasks_total")),
                        "tasks_done": safe_int(p.get("tasks_done")),
                        "tasks_blocked": safe_int(p.get("tasks_blocked")),
                    },
                    "live": live,
                }
            )

    return {
        "plans": {
            "d1_count": len(d1_plans),
            "pg_count": len(pg_plans),
            "d1_only": sorted(d1_plan_ids - pg_plan_ids),
            "pg_only": sorted(pg_plan_ids - d1_plan_ids),
            "shared": len(d1_plan_ids & pg_plan_ids),
            "field_diffs": plan_diffs[:200],
            "field_diff_count": len(plan_diffs),
        },
        "tasks": {
            "d1_count": len(d1_tasks),
            "pg_count": len(pg_tasks),
            "d1_only": sorted(d1_task_ids - pg_task_ids)[:500],
            "d1_only_count": len(d1_task_ids - pg_task_ids),
            "pg_only": sorted(pg_task_ids - d1_task_ids)[:500],
            "pg_only_count": len(pg_task_ids - d1_task_ids),
            "shared": len(d1_task_ids & pg_task_ids),
            "field_diffs": task_diffs[:200],
            "field_diff_count": len(task_diffs),
        },
        "orphan_tasks": {
            "d1_orphan_count": len(orphan_d1_tasks),
            "d1_orphan_sample": [
                {"id": t.get("id"), "plan_id": t.get("plan_id"), "title": t.get("title")}
                for t in orphan_d1_tasks[:30]
            ],
            "pg_orphan_count": len(orphan_pg_tasks),
            "pg_orphan_sample": [
                {"id": t.get("id"), "plan_id": t.get("plan_id"), "title": t.get("title")}
                for t in orphan_pg_tasks[:30]
            ],
        },
        "d1_counter_drift": counter_drift,
    }


def status_histogram(rows: list[dict[str, Any]], field: str = "status") -> dict[str, int]:
    c: Counter[str] = Counter()
    for r in rows:
        c[normalize_status(r.get(field)) or "(empty)"] += 1
    return dict(sorted(c.items(), key=lambda x: (-x[1], x[0])))


def render_markdown(payload: dict[str, Any], md_path: Path) -> None:
    s = payload["summary"]
    parity = payload["parity"]
    d1_open = payload["open_work"]["d1"]
    lines = [
        "# Agent Sam plans crawl — D1 + Supabase",
        "",
        f"- **Generated:** {payload['generated_at']}",
        f"- **D1:** `{payload['d1']['database']}` remote={payload['d1']['remote']}",
        f"- **Supabase:** {'connected' if payload['supabase']['connected'] else 'skipped'}",
        "",
        "## Summary",
        "",
        "| Store | Plans | Tasks |",
        "|-------|------:|------:|",
        f"| D1 | {s['d1_plans']} | {s['d1_tasks']} |",
        f"| Supabase | {s['pg_plans']} | {s['pg_tasks']} |",
        "",
        "### D1 plan status",
        "",
    ]
    for k, v in payload["histograms"]["d1_plan_status"].items():
        lines.append(f"- `{k}`: {v}")
    lines.extend(["", "### D1 task status", ""])
    for k, v in payload["histograms"]["d1_task_status"].items():
        lines.append(f"- `{k}`: {v}")

    lines.extend(
        [
            "",
            "## Open work (D1 — canonical)",
            "",
            f"- **Active plans:** {len(d1_open['active_plans'])}",
            f"- **Open/queued tasks:** {len(d1_open['open_tasks'])}",
            f"- **In progress tasks:** {len(d1_open['in_progress_tasks'])}",
            f"- **Blocked tasks:** {len(d1_open['blocked_tasks'])}",
            "",
        ]
    )

    if d1_open["in_progress_tasks"]:
        lines.append("### In progress")
        for t in d1_open["in_progress_tasks"][:40]:
            lines.append(
                f"- `{t['task_id']}` — **{t.get('title') or '?'}** "
                f"(plan `{t.get('plan_id')}` · {t.get('plan_title') or '?'})"
            )
        if len(d1_open["in_progress_tasks"]) > 40:
            lines.append(f"- … +{len(d1_open['in_progress_tasks']) - 40} more")
        lines.append("")

    if d1_open["blocked_tasks"]:
        lines.append("### Blocked")
        for t in d1_open["blocked_tasks"][:30]:
            reason = t.get("blocked_reason") or "—"
            lines.append(
                f"- `{t['task_id']}` — {t.get('title')} — _{reason}_"
            )
        lines.append("")

    lines.append("### Active plans (counter drift flagged)")
    for p in sorted(d1_open["active_plans"], key=lambda x: (not x["counter_drift"], x.get("plan_id") or "")):
        drift = " ⚠️ counter drift" if p["counter_drift"] else ""
        lines.append(
            f"- `{p['plan_id']}` — **{p.get('title')}** — "
            f"cols {p['tasks_done_col']}/{p['tasks_total_col']} done/total · "
            f"live {p['tasks_live_done']}/{p['tasks_live_total']}{drift}"
        )

    lines.extend(
        [
            "",
            "## D1 ↔ Supabase parity",
            "",
            f"- Plans only on D1: **{len(parity['plans']['d1_only'])}**",
            f"- Plans only on Supabase: **{len(parity['plans']['pg_only'])}**",
            f"- Plans with field diffs: **{parity['plans']['field_diff_count']}**",
            f"- Tasks only on D1: **{parity['tasks']['d1_only_count']}**",
            f"- Tasks only on Supabase: **{parity['tasks']['pg_only_count']}**",
            f"- Tasks with field diffs: **{parity['tasks']['field_diff_count']}**",
            f"- D1 plans with counter drift: **{len(parity['d1_counter_drift'])}**",
            "",
        ]
    )

    if parity["plans"]["d1_only"][:15]:
        lines.append("### Sample plans D1-only")
        for pid in parity["plans"]["d1_only"][:15]:
            lines.append(f"- `{pid}`")
        lines.append("")

    if parity["d1_counter_drift"][:20]:
        lines.append("### Counter drift (D1 columns vs live task rows)")
        for row in parity["d1_counter_drift"][:20]:
            lines.append(
                f"- `{row['plan_id']}` — cols {row['columns']} vs live {row['live']}"
            )
        lines.append("")

    if payload.get("warnings"):
        lines.append("## Warnings")
        for w in payload["warnings"]:
            lines.append(f"- {w}")
        lines.append("")

    lines.append(f"\nFull JSON: `{payload['artifacts']['json']}`\n")
    md_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Crawl agentsam_plans/tasks from D1 + Supabase")
    parser.add_argument("--local-d1", action="store_true", help="Use local D1 instead of --remote")
    parser.add_argument("--no-supabase", action="store_true", help="Skip Supabase crawl")
    parser.add_argument("--out-dir", default=str(ROOT / "artifacts"), help="Output directory")
    args = parser.parse_args()

    root = repo_root()
    os.chdir(root)
    warnings: list[str] = load_env_cloudflare(root)

    stamp = utc_stamp()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"agentsam_plans_crawl_{stamp}.json"
    md_path = out_dir / f"agentsam_plans_crawl_{stamp}.md"

    cfg = AuditConfig(
        db=os.getenv("IAM_D1_DB", "inneranimalmedia-business"),
        config=os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml"),
        remote=not args.local_d1 and os.getenv("IAM_D1_REMOTE", "1").lower() not in {"0", "false", "no"},
        root=root,
    )

    print(f"[crawl] D1 ({'remote' if cfg.remote else 'local'}) …")
    d1_plans, d1_tasks, w_d1 = fetch_d1(cfg)
    warnings.extend(w_d1)
    print(f"  plans={len(d1_plans)} tasks={len(d1_tasks)}")

    pg_plans: list[dict[str, Any]] = []
    pg_tasks: list[dict[str, Any]] = []
    if not args.no_supabase:
        db_url = os.getenv("SUPABASE_DB_URL", "").strip()
        print("[crawl] Supabase …")
        pg_plans, pg_tasks, w_pg = fetch_supabase(db_url)
        warnings.extend(w_pg)
        print(f"  plans={len(pg_plans)} tasks={len(pg_tasks)}")

    parity = parity_report(d1_plans, d1_tasks, pg_plans, pg_tasks)
    d1_open = build_open_work(d1_plans, d1_tasks, "d1")
    pg_open = build_open_work(pg_plans, pg_tasks, "supabase") if pg_plans or pg_tasks else {}

    payload: dict[str, Any] = {
        "generated_at": now_iso(),
        "artifacts": {"json": str(json_path.relative_to(root)), "markdown": str(md_path.relative_to(root))},
        "d1": {
            "database": cfg.db,
            "remote": cfg.remote,
            "plans": [json_safe_row(r) for r in d1_plans],
            "tasks": [json_safe_row(r) for r in d1_tasks],
        },
        "supabase": {
            "connected": bool(pg_plans or pg_tasks),
            "plans": [json_safe_row(r) for r in pg_plans],
            "tasks": [json_safe_row(r) for r in pg_tasks],
        },
        "summary": {
            "d1_plans": len(d1_plans),
            "d1_tasks": len(d1_tasks),
            "pg_plans": len(pg_plans),
            "pg_tasks": len(pg_tasks),
        },
        "histograms": {
            "d1_plan_status": status_histogram(d1_plans),
            "d1_task_status": status_histogram(d1_tasks),
            "pg_plan_status": status_histogram(pg_plans),
            "pg_task_status": status_histogram(pg_tasks),
        },
        "open_work": {"d1": d1_open, "supabase": pg_open},
        "parity": parity,
        "warnings": warnings,
    }

    json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    render_markdown(payload, md_path)

    print(f"\n[crawl] Wrote {json_path}")
    print(f"[crawl] Wrote {md_path}")
    print(
        f"[crawl] D1 open={len(d1_open['open_tasks'])} "
        f"in_progress={len(d1_open['in_progress_tasks'])} "
        f"blocked={len(d1_open['blocked_tasks'])} "
        f"parity_plan_diffs={parity['plans']['field_diff_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
