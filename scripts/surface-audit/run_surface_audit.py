#!/usr/bin/env python3
"""
IAM Dashboard Surface Audit — investigation + sprint proposal generator.

Discovers all /dashboard/* routes, compares to operator baseline list, maps each
surface to page files / API / D1 / agent wiring, and proposes ranked sprints.

Usage:
  python3 scripts/surface-audit/run_surface_audit.py
  python3 scripts/surface-audit/run_surface_audit.py --ai-triage
  python3 scripts/surface-audit/run_surface_audit.py --no-d1

Env (optional AI triage):
  AUDIT_AI_PROVIDER=openai|anthropic
  AUDIT_AI_MODEL=gpt-5.4-mini|claude-sonnet-4-6|gemini-2.5-flash
  OPENAI_API_KEY / ANTHROPIC_API_KEY
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SURFACE_AUDIT = Path(__file__).resolve().parent
sys.path.insert(0, str(SURFACE_AUDIT))

from lib.route_discovery import discover_all_routes
from lib.route_mapper import agent_wiring_for, map_route
from lib.scoring import build_sprint_proposal, score_surface
from lib.report import write_json_report, write_markdown_report


def load_user_routes(config_path: Path) -> set[str]:
    data = json.loads(config_path.read_text(encoding="utf-8"))
    return {normalize_for_compare(r) for r in data.get("routes", [])}


def normalize_for_compare(path: str) -> str:
    p = path.strip()
    if not p.startswith("/"):
        p = "/" + p
    # Treat project slug example as pattern
    if p.startswith("/dashboard/projects/") and p != "/dashboard/projects":
        return "/dashboard/projects/:projectId"
    if p.startswith("/dashboard/moviemode/mmproj_"):
        return "/dashboard/moviemode/:projectId"
    if p.startswith("/dashboard/cms/") and "site=" in p:
        return p.split("?")[0] + "?site=*"
    if p.startswith("/dashboard/cms?site="):
        return "/dashboard/cms?site=*"
    return p


def route_compare_key(entry_path: str) -> str:
    return normalize_for_compare(entry_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="IAM dashboard surface audit")
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument(
        "--user-routes",
        type=Path,
        default=ROOT / "scripts/surface-audit/config/user_routes.json",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "artifacts/surface_audit",
    )
    parser.add_argument("--ai-triage", action="store_true", help="Run AI on top P0/P1 surfaces")
    parser.add_argument("--ai-limit", type=int, default=10)
    args = parser.parse_args()

    discovered = discover_all_routes(args.repo)
    user_set = load_user_routes(args.user_routes)

    discovered_keys = {route_compare_key(e.path): e for e in discovered}
    user_keys = user_set

    missing_from_user: list[dict] = []
    for key, entry in sorted(discovered_keys.items()):
        if key not in user_keys and not any(key.startswith(u.split("?")[0]) for u in user_keys if ":projectId" not in u):
            # include if not covered by a prefix the user listed
            covered = False
            for u in user_keys:
                u_base = u.split("?")[0]
                if key.split("?")[0] == u_base or key.startswith(u_base + "/"):
                    covered = True
                    break
            if not covered:
                missing_from_user.append(
                    {
                        "path": entry.path,
                        "kind": entry.kind,
                        "sidebar": entry.sidebar,
                        "notes": entry.notes,
                        "page": entry.page_component,
                    }
                )

    user_only: list[str] = []
    for u in sorted(user_keys):
        if u not in discovered_keys:
            base = u.split("?")[0]
            if not any(k.split("?")[0] == base for k in discovered_keys):
                user_only.append(u)

    scrape_candidates = [
        {
            "path": e.path,
            "notes": e.notes or e.kind,
            "recommendation": "SCRAPE — redirect/legacy" if e.kind in ("redirect", "alias") else "REVIEW",
        }
        for e in discovered
        if e.kind in ("redirect", "alias")
        or e.path in ("/dashboard/launch-desk", "/dashboard/drive", "/dashboard/overview", "/dashboard/finance")
        or "legacy" in (e.notes or "").lower()
    ]

    surfaces: list[dict] = []
    agent_gaps: list[dict] = []
    scores = []

    for entry in discovered:
        if entry.kind == "redirect" and entry.path.startswith("/dashboard/settings/"):
            continue
        mapping = map_route(args.repo, entry)
        agent = agent_wiring_for(entry.path)
        score = score_surface(mapping)
        scores.append(score)

        row = {
            "path": entry.path,
            "kind": entry.kind,
            "sidebar": entry.sidebar,
            "page_files": mapping.page_files,
            "api_endpoints": mapping.api_endpoints,
            "d1_tables": mapping.d1_tables[:15],
            "worker_handlers": mapping.worker_handlers[:10],
            "hardcoded_models": mapping.hardcoded_model_hits[:5],
            "zeroed_telemetry": mapping.zeroed_telemetry_hits[:5],
            "agent": agent,
            "tier": score.sprint_tier,
            "scores": {
                "functionality": score.functionality_score,
                "experience": score.experience_score,
            },
            "notes": score.functionality_notes,
        }
        surfaces.append(row)
        if not agent["wired"] and entry.sidebar in ("yes", "no") and entry.kind not in ("redirect", "alias"):
            if entry.path.split("?")[0] not in (
                "/dashboard/settings/general",
                "/dashboard/home",
            ):
                agent_gaps.append({"path": entry.path, **agent})

    sprint_proposal = build_sprint_proposal(scores)

    payload: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "discovered": len(discovered),
            "user_listed": len(user_set),
            "missing_from_user": len(missing_from_user),
            "user_only": len(user_only),
            "scrape_candidates": len(scrape_candidates),
            "agent_gaps": len(agent_gaps),
        },
        "missing_from_user": missing_from_user,
        "user_only": user_only,
        "scrape_candidates": scrape_candidates,
        "agent_gaps": agent_gaps[:25],
        "sprint_proposal": sprint_proposal,
        "surfaces": sorted(surfaces, key=lambda x: (x["tier"], x["path"])),
    }

    if args.ai_triage:
        try:
            from lib.ai_triage import triage_batch

            priority = [s for s in surfaces if s["tier"] in ("P0", "P1")][: args.ai_limit]
            payload["ai_triage"] = triage_batch(priority, limit=args.ai_limit)
        except Exception as exc:
            payload["ai_triage_error"] = str(exc)

    json_path = write_json_report(payload, args.out)
    md_path = write_markdown_report(payload, args.out)

    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    print(
        f"Discovered {payload['summary']['discovered']} routes; "
        f"{payload['summary']['missing_from_user']} not in your list; "
        f"{payload['summary']['agent_gaps']} agent wiring gaps"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
