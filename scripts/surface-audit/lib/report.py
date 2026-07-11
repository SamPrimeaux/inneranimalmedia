#!/usr/bin/env python3
"""Markdown + JSON report writers."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_json_report(payload: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"surface_audit_{_ts()}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def write_markdown_report(payload: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"surface_audit_{_ts()}.md"
    lines: list[str] = [
        "# IAM Dashboard Surface Audit",
        "",
        f"Generated: {payload.get('generated_at', '')}",
        "",
        "## Summary",
        "",
        f"- **Discovered routes:** {payload['summary']['discovered']}",
        f"- **User-listed routes:** {payload['summary']['user_listed']}",
        f"- **Missing from user list:** {payload['summary']['missing_from_user']}",
        f"- **User listed but not in repo:** {payload['summary']['user_only']}",
        f"- **Legacy / scrape candidates:** {payload['summary']['scrape_candidates']}",
        "",
        "## Routes you did NOT list (worth knowing)",
        "",
    ]
    for r in payload.get("missing_from_user", [])[:40]:
        lines.append(f"- `{r['path']}` — {r.get('notes') or r.get('kind')} ({r.get('sidebar', '?')})")

    lines.extend(["", "## Legacy / redirect / scrape", ""])
    for r in payload.get("scrape_candidates", []):
        lines.append(f"- `{r['path']}` → {r.get('notes', 'review')}")

    lines.extend(["", "## Agent wiring gaps", ""])
    for g in payload.get("agent_gaps", []):
        lines.append(f"- `{g['path']}` — route_key: {g['route_key']}")

    lines.extend(["", "## Sprint proposal (functionality → experience)", ""])
    for sp in payload.get("sprint_proposal", []):
        lines.append(f"### Sprint {sp['sprint']} — {sp['tier']}: {sp['theme']}")
        lines.append("")
        for s in sp["surfaces"]:
            lines.append(
                f"- `{s['path']}` — func {s['functionality']}/5, ux {s['experience']}/5 — {s['notes']}"
            )
        lines.append("")

    lines.extend(["", "## Full surface map", ""])
    lines.append("| Route | Page | API | Agent wired | Tier |")
    lines.append("|-------|------|-----|-------------|------|")
    for row in payload.get("surfaces", []):
        pages = ", ".join(row.get("page_files", [])[:2]) or "—"
        apis = ", ".join(row.get("api_endpoints", [])[:2]) or "—"
        wired = "yes" if row.get("agent", {}).get("wired") else "NO"
        lines.append(
            f"| `{row['path']}` | {pages} | {apis} | {wired} | {row.get('tier', '?')} |"
        )

    if payload.get("ai_triage"):
        lines.extend(["", "## AI triage (sample)", ""])
        for item in payload["ai_triage"]:
            ai = item.get("ai", {})
            lines.append(f"### `{item.get('surface')}` — {ai.get('verdict', '?')}")
            for a in ai.get("next_actions") or []:
                lines.append(f"- {a}")
            lines.append("")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path
