#!/usr/bin/env python3
"""Map routes → page files, API endpoints, D1 table references."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .route_discovery import RouteEntry


@dataclass
class RouteMapping:
    route: RouteEntry
    page_files: list[str] = field(default_factory=list)
    api_endpoints: list[str] = field(default_factory=list)
    d1_tables: list[str] = field(default_factory=list)
    worker_handlers: list[str] = field(default_factory=list)
    hardcoded_model_hits: list[str] = field(default_factory=list)
    zeroed_telemetry_hits: list[str] = field(default_factory=list)


# Curated route → primary page file (when App.tsx only names component)
PAGE_OVERRIDES: dict[str, list[str]] = {
    "/dashboard/home": ["dashboard/components/DashboardHome.tsx"],
    "/dashboard/artifacts": ["dashboard/pages/library/LibraryPage.tsx"],
    "/dashboard/projects": ["dashboard/pages/projects/ProjectsPage.tsx"],
    "/dashboard/projects/:projectId": ["dashboard/pages/projects/ProjectDetailPage.tsx"],
    "/dashboard/agent": ["dashboard/components/agent/AgentHome.tsx", "dashboard/components/ChatAssistant/"],
    "/dashboard/agent/editor": ["dashboard/components/MonacoEditorView.tsx", "dashboard/components/shell/CodeToolsSidebar.tsx"],
    "/dashboard/agent/workspace": ["dashboard/components/WorkspaceDashboardV2.tsx"],
    "/dashboard/agent/systems": ["dashboard/components/WorkspaceDashboardV2.tsx"],
    "/dashboard/designstudio": ["dashboard/components/DesignStudioPage.tsx"],
    "/dashboard/draw": ["dashboard/pages/draw/DrawPage.tsx"],
    "/dashboard/images": ["dashboard/components/ImagesPage.tsx"],
    "/dashboard/database": ["dashboard/components/DatabasePage.tsx"],
    "/dashboard/workflows": ["dashboard/pages/workflows/WorkflowsPage.tsx"],
    "/dashboard/collaborate": ["dashboard/pages/LaunchDeskPage.tsx"],
    "/dashboard/mail": ["dashboard/components/MailPage.tsx"],
    "/dashboard/meet": ["dashboard/components/MeetPage.tsx"],
    "/dashboard/learn": ["dashboard/components/LearnPage.tsx"],
}

# Curated route prefix → likely API prefixes
API_PREFIX_BY_ROUTE: dict[str, list[str]] = {
    "/dashboard/home": ["/api/dashboard/home", "/api/dashboard/bootstrap"],
    "/dashboard/projects": ["/api/projects"],
    "/dashboard/artifacts": ["/api/r2/", "/api/integrations/gdrive", "/api/library"],
    "/dashboard/agent": ["/api/agent/chat", "/api/agent/sessions"],
    "/dashboard/agent/editor": ["/api/agent/git", "/api/monaco/complete", "/api/agent/chat"],
    "/dashboard/cms": ["/api/cms/"],
    "/dashboard/designstudio": ["/api/cad/", "/api/designstudio", "/api/meshy"],
    "/dashboard/draw": ["/api/draw/"],
    "/dashboard/images": ["/api/images", "/api/r2/"],
    "/dashboard/moviemode": ["/api/moviemode/"],
    "/dashboard/database": ["/api/database", "/api/d1/"],
    "/dashboard/workflows": ["/api/workflows", "/api/agentsam/workflows"],
    "/dashboard/collaborate": ["/api/collaborate", "/api/launch-desk", "/api/agentsam/todo"],
    "/dashboard/mail": ["/api/mail/"],
    "/dashboard/meet": ["/api/meet/"],
    "/dashboard/settings": ["/api/settings/"],
    "/dashboard/launch-desk": ["/api/launch-desk"],
}

# Curated agent route_key from dashboardRouteContext.ts
AGENT_ROUTE_KEYS: dict[str, str] = {
    "/dashboard/cms": "cms_edit | cms_client_worker | fuel_cms_admin",
    "/dashboard/designstudio": "design_studio",
    "/dashboard/database": "database_studio",
    "/dashboard/workflows": "workflows",
    "/dashboard/agent": "agent_sam | agent_examples",
    "/dashboard/mail": "mail_triage",
    "/dashboard/collaborate": "collaborate_tasks | collaborate_calendar",
    "/dashboard/draw": "(none — falls through to dashboard)",
    "/dashboard/images": "(none — falls through to dashboard)",
    "/dashboard/projects": "(none — falls through to dashboard)",
    "/dashboard/designstudio": "design_studio",
}

MODEL_PATTERNS = [
    re.compile(r"""['"`](gpt-[0-9][^'"`]*)['"`]"""),
    re.compile(r"""['"`](claude-[^'"`]*)['"`]"""),
    re.compile(r"""['"`](gemini-[^'"`]*)['"`]"""),
]
ZERO_PATTERNS = [
    re.compile(r"costUsd:\s*0"),
    re.compile(r"inputTokens:\s*0"),
    re.compile(r"outputTokens:\s*0"),
]

D1_TABLE_PATTERN = re.compile(r"\b(agentsam_[a-z0-9_]+)\b")


def route_prefix(path: str) -> str:
    base = path.split("?")[0]
    if base.startswith("/dashboard/projects/") and base != "/dashboard/projects":
        return "/dashboard/projects/:projectId"
    if base.startswith("/dashboard/settings/"):
        return "/dashboard/settings"
    if base.startswith("/dashboard/cms/"):
        return "/dashboard/cms"
    if base.startswith("/dashboard/moviemode/") and base not in (
        "/dashboard/moviemode/templates",
        "/dashboard/moviemode/ai-studio",
        "/dashboard/moviemode/projects",
    ):
        return "/dashboard/moviemode/:projectId"
    return base


def grep_files(root: Path, pattern: str, globs: list[str], limit: int = 30) -> list[str]:
    hits: list[str] = []
    rx = re.compile(pattern)
    for glob in globs:
        for fp in root.glob(glob):
            if not fp.is_file():
                continue
            try:
                text = fp.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if rx.search(text):
                hits.append(str(fp.relative_to(root)))
                if len(hits) >= limit:
                    return hits
    return hits


def scan_file_signals(root: Path, rel_files: list[str]) -> tuple[list[str], list[str], list[str]]:
    d1: set[str] = set()
    models: list[str] = []
    zeros: list[str] = []
    for rel in rel_files:
        fp = root / rel
        if not fp.is_file():
            continue
        try:
            lines = fp.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines, 1):
            for m in D1_TABLE_PATTERN.finditer(line):
                d1.add(m.group(1))
            for pat in MODEL_PATTERNS:
                mm = pat.search(line)
                if mm and "agentsam_model" not in line and "//" not in line[: line.find(mm.group(0))]:
                    models.append(f"{rel}:{i}:{mm.group(1)}")
            for pat in ZERO_PATTERNS:
                if pat.search(line) and "blocked" not in line.lower():
                    zeros.append(f"{rel}:{i}")
    return sorted(d1), models[:20], zeros[:20]


def map_route(repo_root: Path, entry: RouteEntry) -> RouteMapping:
    prefix = route_prefix(entry.path)
    page_files = list(PAGE_OVERRIDES.get(prefix, PAGE_OVERRIDES.get(entry.path, [])))
    if entry.page_component and "dashboard/" in (entry.page_component or ""):
        pc = entry.page_component.split("(")[0].strip()
        if pc.startswith("dashboard/"):
            page_files.append(pc)

    api_endpoints: list[str] = []
    for key, apis in API_PREFIX_BY_ROUTE.items():
        if prefix.startswith(key) or entry.path.startswith(key):
            api_endpoints.extend(apis)
    api_endpoints = sorted(set(api_endpoints))

    worker_handlers: list[str] = []
    for api in api_endpoints:
        stub = api.replace("/api/", "").replace("/", "-").strip("-")
        hits = grep_files(repo_root, re.escape(api.split("{")[0].rstrip("/")), ["src/**/*.js"], limit=5)
        worker_handlers.extend(hits)

    scan_roots = page_files + worker_handlers + entry.source_files
    d1_tables, models, zeros = scan_file_signals(repo_root, list(dict.fromkeys(scan_roots)))

    return RouteMapping(
        route=entry,
        page_files=sorted(set(page_files)),
        api_endpoints=api_endpoints,
        d1_tables=d1_tables,
        worker_handlers=sorted(set(worker_handlers)),
        hardcoded_model_hits=models,
        zeroed_telemetry_hits=zeros,
    )


def agent_wiring_for(path: str) -> dict:
    prefix = route_prefix(path)
    route_key = AGENT_ROUTE_KEYS.get(prefix, "(none — generic dashboard context)")
    ctx_file = "dashboard/lib/dashboardRouteContext.ts"
    wired = route_key != "(none — falls through to dashboard)" and "none" not in route_key
    return {
        "route_key": route_key,
        "context_resolver": ctx_file,
        "chat_endpoint": "/api/agent/chat",
        "wired": wired,
        "gap": None if wired else "Agent panel gets generic dashboard context — no route_key-specific tools/prompts",
    }
