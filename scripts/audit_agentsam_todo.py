#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

DB_NAME = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
STALE_DAYS = int(os.getenv("TODO_STALE_DAYS", "14"))

OUT_MD = ARTIFACTS / "agentsam_todo_audit.md"
OUT_JSON = ARTIFACTS / "agentsam_todo_audit.json"

CLOSED_STATUSES = {
    "done",
    "fixed",
    "closed",
    "complete",
    "completed",
    "resolved",
    "verified",
    "verified_closed",
    "archived",
    "cancelled",
    "canceled",
}

ACTIVE_EXECUTION = {
    "queued",
    "running",
    "in_progress",
    "pending",
    "retrying",
}

FAILED_EXECUTION = {
    "failed",
    "error",
    "timeout",
    "blocked",
}


def run_d1(sql: str) -> list[dict[str, Any]]:
    cmd = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB_NAME,
        "--remote",
        "-c",
        WRANGLER_CONFIG,
        "--json",
        "--command",
        sql,
    ]

    proc = subprocess.run(
        cmd,
        cwd=ROOT,
        text=True,
        capture_output=True,
    )

    if proc.returncode != 0:
        raise SystemExit(
            "D1 command failed.\n\n"
            f"Command:\n{' '.join(cmd)}\n\n"
            f"STDOUT:\n{proc.stdout}\n\n"
            f"STDERR:\n{proc.stderr}\n"
        )

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        raise SystemExit(f"Could not parse Wrangler JSON output:\n{proc.stdout[:3000]}")

    rows: list[dict[str, Any]] = []

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            results = value.get("results")
            if isinstance(results, list):
                for row in results:
                    if isinstance(row, dict):
                        rows.append(row)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(payload)
    return rows


def parse_dt(value: Any) -> datetime | None:
    if value in (None, ""):
        return None

    raw = str(value).strip()
    if not raw:
        return None

    if raw.isdigit():
        try:
            n = int(raw)
            if n > 10_000_000_000:
                n = int(n / 1000)
            return datetime.fromtimestamp(n, tz=timezone.utc)
        except Exception:
            return None

    raw = raw.replace("Z", "+00:00")

    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass

    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except Exception:
            pass

    return None


def age_days(row: dict[str, Any]) -> int | None:
    for key in ("updated_at", "created_at", "created_at_unix"):
        dt = parse_dt(row.get(key))
        if dt:
            return max(0, (datetime.now(timezone.utc) - dt).days)
    return None


def txt(value: Any, limit: int = 180) -> str:
    s = "" if value is None else str(value)
    s = " ".join(s.split())
    if len(s) > limit:
        return s[: limit - 1] + "…"
    return s


def md(value: Any, limit: int = 180) -> str:
    return txt(value, limit).replace("|", "\\|")


def has_proof(row: dict[str, Any]) -> bool:
    proof_fields = [
        "completed_at",
        "linked_commit",
        "linked_route",
        "linked_table",
        "output_summary",
        "approved_at",
        "approved_by",
        "kanban_task_id",
        "kanban_board_id",
    ]
    return any(row.get(k) not in (None, "", "[]", "{}") for k in proof_fields)


def infer_bucket(row: dict[str, Any]) -> str:
    status = txt(row.get("status")).lower()
    execution_status = txt(row.get("execution_status")).lower()
    age = age_days(row)
    proof = has_proof(row)

    if status in CLOSED_STATUSES and proof:
        return "Closed with proof"

    if status in CLOSED_STATUSES and not proof:
        return "Closed but missing proof"

    if row.get("error_trace") or execution_status in FAILED_EXECUTION:
        return "Failed or blocked"

    if row.get("completed_at") and status not in CLOSED_STATUSES:
        return "Completed timestamp but still open"

    if proof and status not in CLOSED_STATUSES:
        return "Likely fixed but still open"

    if age is not None and age >= STALE_DAYS and status not in CLOSED_STATUSES:
        return "Stale open"

    if execution_status in ACTIVE_EXECUTION:
        return "Open active"

    return "Needs manual review"


def checkbox(bucket: str) -> str:
    if bucket == "Closed with proof":
        return "- [x]"
    if bucket == "Closed but missing proof":
        return "- [ ] Attach proof or reopen"
    if bucket == "Failed or blocked":
        return "- [ ] Fix, retry, or close as obsolete"
    if bucket == "Completed timestamp but still open":
        return "- [ ] Verify and mark closed"
    if bucket == "Likely fixed but still open":
        return "- [ ] Verify proof and close"
    if bucket == "Stale open":
        return "- [ ] Verify still relevant or archive"
    if bucket == "Open active":
        return "- [ ] Keep active or attach next proof"
    return "- [ ] Review"


def main() -> None:
    schema_rows = run_d1("PRAGMA table_info(agentsam_todo);")
    schema_cols = [r["name"] for r in schema_rows if r.get("name")]

    expected = {
        "id",
        "tenant_id",
        "workspace_id",
        "title",
        "description",
        "status",
        "priority",
        "category",
        "tags",
        "due_date",
        "completed_at",
        "created_at",
        "updated_at",
        "created_by",
        "notes",
        "linked_commit",
        "linked_route",
        "linked_table",
        "sort_order",
        "plan_id",
        "project_key",
        "task_type",
        "execution_status",
        "assigned_to",
        "depends_on",
        "retry_count",
        "max_retries",
        "timeout_seconds",
        "context_snapshot",
        "output_summary",
        "error_trace",
        "token_budget",
        "tokens_used",
        "cost_usd",
        "requires_approval",
        "approved_by",
        "approved_at",
        "started_at",
        "kanban_task_id",
        "kanban_board_id",
        "created_at_unix",
    }

    missing = sorted(expected - set(schema_cols))

    rows = run_d1(
        """
        SELECT
          id,
          tenant_id,
          workspace_id,
          title,
          description,
          status,
          priority,
          category,
          tags,
          due_date,
          completed_at,
          created_at,
          updated_at,
          created_by,
          notes,
          linked_commit,
          linked_route,
          linked_table,
          sort_order,
          plan_id,
          project_key,
          task_type,
          execution_status,
          assigned_to,
          depends_on,
          retry_count,
          max_retries,
          timeout_seconds,
          context_snapshot,
          output_summary,
          error_trace,
          token_budget,
          tokens_used,
          cost_usd,
          requires_approval,
          approved_by,
          approved_at,
          started_at,
          kanban_task_id,
          kanban_board_id,
          created_at_unix
        FROM agentsam_todo
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END,
          COALESCE(updated_at, created_at) DESC;
        """
    )

    for row in rows:
        row["_bucket"] = infer_bucket(row)
        row["_age_days"] = age_days(row)
        row["_has_proof"] = has_proof(row)

    bucket_order = [
        "Likely fixed but still open",
        "Completed timestamp but still open",
        "Closed but missing proof",
        "Failed or blocked",
        "Stale open",
        "Open active",
        "Needs manual review",
        "Closed with proof",
    ]

    grouped: dict[str, list[dict[str, Any]]] = {b: [] for b in bucket_order}
    for row in rows:
        grouped.setdefault(row["_bucket"], []).append(row)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    lines: list[str] = []
    lines.append("# Agent Sam TODO Cleanup Audit")
    lines.append("")
    lines.append(f"Generated: `{now}`")
    lines.append(f"Database: `{DB_NAME}`")
    lines.append(f"Config: `{WRANGLER_CONFIG}`")
    lines.append(f"Rows scanned: **{len(rows)}**")
    lines.append(f"Stale threshold: **{STALE_DAYS} days**")
    lines.append("")

    lines.append("## Schema verification")
    lines.append("")
    if missing:
        lines.append("Missing expected columns:")
        lines.append("")
        for col in missing:
            lines.append(f"- `{col}`")
    else:
        lines.append("All expected `agentsam_todo` columns were found.")
    lines.append("")

    lines.append("## Cleanup summary")
    lines.append("")
    lines.append("| Bucket | Count | Meaning |")
    lines.append("|---|---:|---|")

    meanings = {
        "Likely fixed but still open": "Has proof fields like commit/route/table/output but status is still open.",
        "Completed timestamp but still open": "Has completed_at but status was not moved to a closed state.",
        "Closed but missing proof": "Marked closed/resolved but lacks clear proof metadata.",
        "Failed or blocked": "Has error_trace or failed/blocked execution_status.",
        "Stale open": f"Open and untouched for at least {STALE_DAYS} days.",
        "Open active": "Queued/running/pending and not old enough to mark stale.",
        "Needs manual review": "Did not match a strong automatic cleanup signal.",
        "Closed with proof": "Already closed and has proof metadata.",
    }

    for bucket in bucket_order:
        lines.append(f"| {bucket} | {len(grouped.get(bucket, []))} | {meanings[bucket]} |")
    lines.append("")

    lines.append("## Close/cleanup candidates")
    lines.append("")
    lines.append("Start here. These are the rows most likely safe to verify and close/archive.")
    lines.append("")

    candidate_buckets = [
        "Likely fixed but still open",
        "Completed timestamp but still open",
        "Closed but missing proof",
        "Stale open",
    ]

    for bucket in candidate_buckets:
        group = grouped.get(bucket, [])
        lines.append(f"### {bucket}")
        lines.append("")
        if not group:
            lines.append("_None._")
            lines.append("")
            continue

        lines.append("| Check | ID | Priority | Status | Exec | Age | Title | Proof fields | Route/Table |")
        lines.append("|---|---|---|---|---|---:|---|---|---|")

        for row in group:
            proof_bits = []
            for key in ("linked_commit", "completed_at", "output_summary", "approved_at", "kanban_task_id"):
                if row.get(key) not in (None, "", "[]", "{}"):
                    proof_bits.append(key)

            route_table = " / ".join(
                x for x in [
                    txt(row.get("linked_route"), 70),
                    txt(row.get("linked_table"), 70),
                ]
                if x
            )

            lines.append(
                f"| {checkbox(bucket)} "
                f"| `{md(row.get('id'), 80)}` "
                f"| `{md(row.get('priority'), 30)}` "
                f"| `{md(row.get('status'), 40)}` "
                f"| `{md(row.get('execution_status'), 40)}` "
                f"| {row.get('_age_days') if row.get('_age_days') is not None else ''} "
                f"| {md(row.get('title'), 160)} "
                f"| `{md(', '.join(proof_bits), 120)}` "
                f"| `{md(route_table, 140)}` |"
            )

        lines.append("")

    lines.append("## Full checklist by bucket")
    lines.append("")

    for bucket in bucket_order:
        group = grouped.get(bucket, [])
        lines.append(f"### {bucket}")
        lines.append("")
        if not group:
            lines.append("_None._")
            lines.append("")
            continue

        for row in group:
            lines.append(f"{checkbox(bucket)} `{md(row.get('id'), 90)}` — **{md(row.get('title'), 180)}**")
            lines.append(f"  - Status: `{md(row.get('status'), 40)}` | Execution: `{md(row.get('execution_status'), 40)}` | Priority: `{md(row.get('priority'), 40)}` | Age: `{row.get('_age_days')}` days")
            if row.get("linked_commit"):
                lines.append(f"  - Commit: `{md(row.get('linked_commit'), 120)}`")
            if row.get("linked_route"):
                lines.append(f"  - Route: `{md(row.get('linked_route'), 120)}`")
            if row.get("linked_table"):
                lines.append(f"  - Table: `{md(row.get('linked_table'), 120)}`")
            if row.get("output_summary"):
                lines.append(f"  - Output: {md(row.get('output_summary'), 220)}")
            if row.get("error_trace"):
                lines.append(f"  - Error: `{md(row.get('error_trace'), 220)}`")
            if row.get("notes"):
                lines.append(f"  - Notes: {md(row.get('notes'), 220)}")
            lines.append("")

    lines.append("## Manual SQL templates")
    lines.append("")
    lines.append("Only run these after reviewing the checklist.")
    lines.append("")
    lines.append("```sql")
    lines.append("-- Mark verified fixed tasks closed.")
    lines.append("UPDATE agentsam_todo")
    lines.append("SET")
    lines.append("  status = 'verified_closed',")
    lines.append("  execution_status = CASE")
    lines.append("    WHEN execution_status IN ('queued', 'pending', 'running', 'in_progress') THEN 'completed'")
    lines.append("    ELSE execution_status")
    lines.append("  END,")
    lines.append("  completed_at = COALESCE(completed_at, datetime('now')),")
    lines.append("  updated_at = datetime('now'),")
    lines.append("  notes = COALESCE(notes, '') || char(10) || 'Verified and closed during agentsam_todo cleanup audit.'")
    lines.append("WHERE id IN (")
    lines.append("  'todo_id_here'")
    lines.append(");")
    lines.append("")
    lines.append("-- Archive stale obsolete tasks without pretending they were completed.")
    lines.append("UPDATE agentsam_todo")
    lines.append("SET")
    lines.append("  status = 'archived',")
    lines.append("  execution_status = 'cancelled',")
    lines.append("  updated_at = datetime('now'),")
    lines.append("  notes = COALESCE(notes, '') || char(10) || 'Archived as stale/obsolete during agentsam_todo cleanup audit.'")
    lines.append("WHERE id IN (")
    lines.append("  'todo_id_here'")
    lines.append(");")
    lines.append("```")
    lines.append("")

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    OUT_JSON.write_text(json.dumps(rows, indent=2, sort_keys=True), encoding="utf-8")

    print(f"PASS rows scanned: {len(rows)}")
    print(f"PASS wrote markdown: {OUT_MD}")
    print(f"PASS wrote json: {OUT_JSON}")

    print("")
    print("Bucket counts:")
    for bucket in bucket_order:
        print(f"  {bucket}: {len(grouped.get(bucket, []))}")


if __name__ == "__main__":
    main()
