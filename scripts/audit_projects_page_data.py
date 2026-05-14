#!/usr/bin/env python3
"""C2.1 — Audit D1 tables used by /dashboard/projects and /api/projects/overview."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TABLES = [
    "projects",
    "workspace_projects",
    "project_goals",
    "project_costs",
    "project_metrics",
    "project_issues",
    "project_quality_summary",
    "agentsam_plans",
    "agentsam_plan_tasks",
    "agentsam_workflow_runs",
    "agentsam_usage_events",
]


def run_wrangler(sql: str) -> dict:
    cmd = [
        str(ROOT / "scripts/with-cloudflare-env.sh"),
        "npx",
        "wrangler",
        "d1",
        "execute",
        "inneranimalmedia-business",
        "--remote",
        "-c",
        "wrangler.production.toml",
        "--json",
        "--command",
        sql,
    ]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        print(proc.stderr, file=sys.stderr)
        raise SystemExit(proc.returncode)
    out = proc.stdout.strip()
    if not out:
        return {}
    return json.loads(out)


def table_info(name: str) -> list[dict]:
    payload = run_wrangler(f"PRAGMA table_info({name});")
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return payload[0].get("results") or []
    return []


def row_count(name: str) -> int | None:
    try:
        payload = run_wrangler(f"SELECT COUNT(*) as c FROM {name};")
        if isinstance(payload, list) and payload:
            r = payload[0].get("results") or []
            if r:
                return int(r[0].get("c", 0))
    except Exception:
        return None
    return None


def sample(name: str, limit: int = 2) -> list[dict]:
    try:
        payload = run_wrangler(f"SELECT * FROM {name} LIMIT {int(limit)};")
        if isinstance(payload, list) and payload:
            return payload[0].get("results") or []
    except Exception:
        return []
    return []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-out", type=Path, help="Write machine-readable report")
    args = parser.parse_args()

    report: dict = {"tables": {}}
    lines = ["# Projects page D1 audit", ""]

    for t in TABLES:
        lines.append(f"## {t}")
        cols = table_info(t)
        if not cols:
            lines.append("- **exists**: no (or PRAGMA failed)")
            report["tables"][t] = {"exists": False}
            lines.append("")
            continue
        lines.append("- **exists**: yes")
        ctype = {str(c.get("name")): str(c.get("type")) for c in cols}
        lines.append(f"- **columns**: {len(cols)}")
        report["tables"][t] = {"exists": True, "columns": ctype}
        c = row_count(t)
        lines.append(f"- **row_count**: {c}")
        report["tables"][t]["row_count"] = c
        rows = sample(t, 2)
        lines.append(f"- **sample_rows**: {len(rows)}")
        report["tables"][t]["sample"] = rows
        if t == "project_costs" and "project_id" in ctype:
            lines.append(f"- **note**: project_costs.project_id type = `{ctype['project_id']}` (projects.id is TEXT)")
        if t == "project_metrics" and "project_id" in ctype:
            lines.append(f"- **note**: project_metrics.project_id type = `{ctype.get('project_id')}`")
        if t == "project_quality_summary":
            lines.append("- **note**: VIEW over quality_checks — join on TEXT project_id when rows exist")
        lines.append("")

    text = "\n".join(lines)
    print(text)
    if args.json_out:
        args.json_out.write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
