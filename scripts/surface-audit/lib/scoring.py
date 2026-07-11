#!/usr/bin/env python3
"""Priority scoring and sprint proposal generation."""

from __future__ import annotations

from dataclasses import dataclass

from .route_mapper import RouteMapping, agent_wiring_for


@dataclass
class SurfaceScore:
    path: str
    functionality_score: int  # 1-5 (5 = broken core path)
    experience_score: int  # 1-5 (5 = needs UX remaster)
    sprint_tier: str  # P0 | P1 | P2 | P3
    functionality_notes: str
    experience_notes: str
    user_priority: str  # from operator notes


# Operator-stated focus from conversation
USER_NOTES: dict[str, dict] = {
    "/dashboard/agent": {"func": 5, "ux": 3, "note": "Core chat — must work; cost/telemetry bugs"},
    "/dashboard/agent/editor": {"func": 5, "ux": 3, "note": "Monaco + git sync — core code surface"},
    "/dashboard/agent/workspace": {"func": 4, "ux": 5, "note": "High potential; duplicate tab paths; iOS-style workspace vision"},
    "/dashboard/agent/systems": {"func": 3, "ux": 5, "note": "Design systems + live tweaks panel — brand work"},
    "/dashboard/agent?tab=examples": {"func": 2, "ux": 4, "note": "CMS-blended prompt setups — later"},
    "/dashboard/cms": {"func": 5, "ux": 4, "note": "Huge product surface — Shopify-simple realtime deploy"},
    "/dashboard/designstudio": {"func": 4, "ux": 5, "note": "Almost wired; prompt injection trash; merge with draw"},
    "/dashboard/draw": {"func": 2, "ux": 4, "note": "Disconnected Excalidraw — merge into design pipeline"},
    "/dashboard/projects": {"func": 4, "ux": 3, "note": "Project hub + detail pages"},
    "/dashboard/artifacts": {"func": 3, "ux": 3, "note": "Like it — revise later"},
    "/dashboard/images": {"func": 3, "ux": 2, "note": "Simple; tag/multi-select later"},
    "/dashboard/database": {"func": 3, "ux": 4, "note": "Agentic D1 CRUD — low priority for Connor onboarding"},
    "/dashboard/workflows": {"func": 3, "ux": 3, "note": "Great potential — lower priority"},
    "/dashboard/moviemode": {"func": 2, "ux": 3, "note": "Lower totem pole"},
    "/dashboard/collaborate": {"func": 3, "ux": 3, "note": "Launch Desk UI lives here"},
    "/dashboard/home": {"func": 3, "ux": 2, "note": "Entry hub"},
    "/dashboard/launch-desk": {"func": 1, "ux": 1, "note": "SCRAPE — redirect only"},
}


def _prefix_key(path: str) -> str:
    base = path.split("?")[0]
    if base.startswith("/dashboard/projects/") and base != "/dashboard/projects":
        return "/dashboard/projects/:id"
    if base.startswith("/dashboard/settings/"):
        return "/dashboard/settings/*"
    if "tab=examples" in path:
        return "/dashboard/agent?tab=examples"
    if "tab=workspaces" in path:
        return "/dashboard/agent/workspace"
    return base


def score_surface(mapping: RouteMapping) -> SurfaceScore:
    path = mapping.route.path
    key = _prefix_key(path)
    user = USER_NOTES.get(key) or USER_NOTES.get(path.split("?")[0])

    func = user["func"] if user else 2
    ux = user["ux"] if user else 2
    note = user["note"] if user else ""

    agent = agent_wiring_for(path)
    if not agent["wired"]:
        func = min(5, func + 1)
        note = (note + "; Agent not route-wired").strip("; ")

    if mapping.hardcoded_model_hits:
        func = min(5, func + 1)
        note = (note + f"; {len(mapping.hardcoded_model_hits)} hardcoded model hits in page files").strip("; ")

    if mapping.zeroed_telemetry_hits:
        func = min(5, func + 1)
        note = (note + "; zeroed telemetry in related files").strip("; ")

    if mapping.route.kind in ("redirect", "alias"):
        func = 1
        ux = 1
        note = (note + f"; {mapping.route.notes}").strip("; ")

    if mapping.route.path == "/dashboard/drive":
        func = 1
        note = "ORPHAN page — no router"

    avg_func = func
    if avg_func >= 4 and ux >= 4:
        tier = "P0"
    elif avg_func >= 4:
        tier = "P1"
    elif avg_func >= 3 or ux >= 4:
        tier = "P2"
    else:
        tier = "P3"

    return SurfaceScore(
        path=path,
        functionality_score=func,
        experience_score=ux,
        sprint_tier=tier,
        functionality_notes=note or "Standard surface",
        experience_notes="See operator notes" if user else "No explicit UX note",
        user_priority=note,
    )


def build_sprint_proposal(scores: list[SurfaceScore]) -> list[dict]:
    """Strategic sprint order: functionality first within tier."""
    by_tier: dict[str, list[SurfaceScore]] = {"P0": [], "P1": [], "P2": [], "P3": []}
    seen_prefix: set[str] = set()
    for s in sorted(scores, key=lambda x: (-x.functionality_score, -x.experience_score, x.path)):
        prefix = _prefix_key(s.path)
        if prefix in seen_prefix and "?" not in s.path:
            continue
        seen_prefix.add(prefix)
        by_tier[s.sprint_tier].append(s)

    sprints: list[dict] = []
    sprint_num = 1
    for tier in ("P0", "P1", "P2", "P3"):
        items = by_tier[tier]
        if not items:
            continue
        sprints.append(
            {
                "sprint": sprint_num,
                "tier": tier,
                "theme": {
                    "P0": "Make core paths truthful — agent chat, tool cost, CMS publish, editor",
                    "P1": "Wire agent to surfaces + kill hardcoded model/telemetry drift",
                    "P2": "Design Studio + Draw merge + workspace remaster",
                    "P3": "Polish — images, artifacts, moviemode, database onboarding",
                }[tier],
                "surfaces": [
                    {
                        "path": i.path,
                        "functionality": i.functionality_score,
                        "experience": i.experience_score,
                        "notes": i.functionality_notes,
                    }
                    for i in items[:8]
                ],
            }
        )
        sprint_num += 1
    return sprints
