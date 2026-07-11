#!/usr/bin/env python3
"""Discover dashboard routes from repo SSOT files."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


@dataclass
class RouteEntry:
    path: str
    path_pattern: str
    kind: str  # route | redirect | alias | agent_shell | query_variant
    page_component: str | None = None
    source_files: list[str] = field(default_factory=list)
    sidebar: str = "unknown"  # yes | no | action | legacy | redirect
    product: str | None = None
    notes: str = ""


def _read(path: Path) -> str:
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def _norm(path: str) -> str:
    p = path.strip()
    if not p.startswith("/"):
        p = "/" + p
    if "?" in p:
        return p
    return p.rstrip("/") or p


def discover_from_app_tsx(root: Path) -> list[RouteEntry]:
    text = _read(root / "dashboard" / "App.tsx")
    entries: list[RouteEntry] = []
    for m in re.finditer(
        r'<Route\s+path="(/dashboard[^"]*)"\s+element=\{<(?:Navigate[^>]*to="([^"]+)"|(\w+))',
        text,
    ):
        path, redirect, component = m.group(1), m.group(2), m.group(3)
        if redirect:
            entries.append(
                RouteEntry(
                    path=path,
                    path_pattern=path,
                    kind="redirect",
                    source_files=["dashboard/App.tsx"],
                    sidebar="redirect",
                    notes=f"→ {redirect}",
                )
            )
        elif component:
            entries.append(
                RouteEntry(
                    path=path,
                    path_pattern=path.replace(":projectId", "*").replace(":slug", "*").replace(":sectionSlug", "*").replace(":databaseName", "*"),
                    kind="route",
                    page_component=f"dashboard/.../{component}.tsx (in App.tsx)",
                    source_files=["dashboard/App.tsx"],
                )
            )
    return entries


def discover_from_shell_nav(root: Path) -> list[RouteEntry]:
    text = _read(root / "dashboard" / "config" / "shellNav.ts")
    entries: list[RouteEntry] = []
    for m in re.finditer(r"path:\s*['\"](/dashboard[^'\"]+)['\"]", text):
        path = m.group(1)
        entries.append(
            RouteEntry(
                path=path,
                path_pattern=path.split("?")[0],
                kind="query_variant" if "?" in path else "route",
                source_files=["dashboard/config/shellNav.ts"],
                sidebar="yes",
            )
        )
    for alias, target in re.findall(
        r"['\"](/dashboard[^'\"]+)['\"]:\s*['\"](/dashboard[^'\"]+)['\"]", text
    ):
        entries.append(
            RouteEntry(
                path=alias,
                path_pattern=alias,
                kind="alias",
                source_files=["dashboard/config/shellNav.ts"],
                sidebar="legacy",
                notes=f"alias → {target}",
            )
        )
    return entries


def discover_agent_routes(root: Path) -> list[RouteEntry]:
    text = _read(root / "dashboard" / "lib" / "agentRoutes.ts")
    const_paths = re.findall(r"export const AGENT_\w+_PATH = '(/dashboard/agent[^']*)'", text)
    entries: list[RouteEntry] = []
    for path in sorted(set(const_paths)):
        sidebar = "yes" if path == "/dashboard/agent" else "no"
        entries.append(
            RouteEntry(
                path=path,
                path_pattern=path,
                kind="agent_shell",
                page_component="Agent shell (App.tsx branch, not React Router)",
                source_files=["dashboard/lib/agentRoutes.ts", "dashboard/App.tsx"],
                sidebar=sidebar,
                product="code",
            )
        )
    for tab in ("recent", "workspaces", "systems", "examples"):
        entries.append(
            RouteEntry(
                path=f"/dashboard/agent?tab={tab}",
                path_pattern="/dashboard/agent",
                kind="query_variant",
                page_component="WorkspaceDashboardV2 / AgentHome",
                source_files=["dashboard/lib/agentRoutes.ts"],
                sidebar="yes" if tab == "examples" else "no",
                product="code",
            )
        )
    entries.append(
        RouteEntry(
            path="/dashboard/agent/:conversationId",
            path_pattern="/dashboard/agent/*",
            kind="agent_shell",
            page_component="Agent conversation deep link",
            source_files=["dashboard/lib/agentRoutes.ts"],
            sidebar="no",
            product="code",
        )
    )
    return entries


def discover_settings_routes(root: Path) -> list[RouteEntry]:
    text = _read(root / "dashboard" / "components" / "settings" / "settingsConstants.ts")
    slugs = re.findall(r"^\s+(\w[\w-]*):\s*'", text, re.MULTILINE)
    entries = [
        RouteEntry(
            path="/dashboard/settings",
            path_pattern="/dashboard/settings",
            kind="redirect",
            source_files=["dashboard/App.tsx"],
            sidebar="yes",
            notes="→ /dashboard/settings/general",
        )
    ]
    for slug in slugs:
        if slug in ("security",):
            continue
        entries.append(
            RouteEntry(
                path=f"/dashboard/settings/{slug}",
                path_pattern="/dashboard/settings/*",
                kind="route",
                page_component="dashboard/components/settings/SettingsPanel.tsx",
                source_files=["dashboard/components/settings/settingsConstants.ts"],
                sidebar="yes",
                product="settings",
            )
        )
    return entries


def discover_cms_routes(root: Path) -> list[RouteEntry]:
    panels = [
        "pages",
        "templates",
        "imports",
        "media",
        "online-store",
        "theme-editor",
    ]
    entries = [
        RouteEntry(
            path="/dashboard/cms",
            path_pattern="/dashboard/cms",
            kind="route",
            page_component="dashboard/pages/cms/CmsPage.tsx",
            source_files=["dashboard/pages/cms/cmsRoute.ts", "dashboard/config/shellNav.ts"],
            sidebar="yes",
            product="create",
        ),
        RouteEntry(
            path="/dashboard/cms?site=*",
            path_pattern="/dashboard/cms",
            kind="query_variant",
            page_component="dashboard/pages/cms/CmsPage.tsx (hub)",
            source_files=["dashboard/pages/cms/cmsRoute.ts"],
            sidebar="no",
            product="create",
        ),
    ]
    for panel in panels:
        entries.append(
            RouteEntry(
                path=f"/dashboard/cms/{panel}",
                path_pattern=f"/dashboard/cms/{panel}",
                kind="route",
                page_component="dashboard/pages/cms/CmsPage.tsx",
                source_files=["dashboard/pages/cms/cmsRoute.ts"],
                sidebar="yes" if panel != "media" else "no",
                product="create",
                notes="hidden from sidebar" if panel == "media" else "",
            )
        )
        entries.append(
            RouteEntry(
                path=f"/dashboard/cms/{panel}?site=*",
                path_pattern=f"/dashboard/cms/{panel}",
                kind="query_variant",
                page_component="dashboard/pages/cms/CmsPage.tsx",
                source_files=["dashboard/pages/cms/cmsRoute.ts"],
                sidebar="no",
                product="create",
            )
        )
    entries.append(
        RouteEntry(
            path="/dashboard/cms/pages/:pageId",
            path_pattern="/dashboard/cms/pages/*",
            kind="route",
            page_component="dashboard/pages/cms/CmsPage.tsx",
            source_files=["dashboard/pages/cms/cmsRoute.ts"],
            sidebar="no",
            product="create",
        )
    )
    return entries


def discover_moviemode_routes(root: Path) -> list[RouteEntry]:
    entries = [
        RouteEntry(
            path="/dashboard/moviemode",
            path_pattern="/dashboard/moviemode",
            kind="route",
            page_component="dashboard/pages/moviemode/MovieModePage.tsx",
            source_files=["dashboard/features/moviemode/movieModeRoutes.ts"],
            sidebar="yes",
            product="create",
        ),
        RouteEntry(
            path="/dashboard/moviemode/:projectId",
            path_pattern="/dashboard/moviemode/*",
            kind="route",
            page_component="dashboard/pages/moviemode/MovieModePage.tsx",
            source_files=["dashboard/features/moviemode/movieModeRoutes.ts"],
            sidebar="no",
            product="create",
        ),
    ]
    for tab in ("templates", "ai-studio", "projects"):
        entries.append(
            RouteEntry(
                path=f"/dashboard/moviemode/{tab}",
                path_pattern=f"/dashboard/moviemode/{tab}",
                kind="route",
                page_component="dashboard/pages/moviemode/MovieModePage.tsx",
                source_files=["dashboard/features/moviemode/movieModeRoutes.ts"],
                sidebar="no",
                product="create",
                notes="in-app bottom nav",
            )
        )
    return entries


def discover_hidden_routes(root: Path) -> list[RouteEntry]:
    """Routes in App.tsx but not shellNav — operator may still hit them."""
    hidden = [
        ("/dashboard/overview", "OverviewPage", "auth default landing; not in sidebar"),
        ("/dashboard/finance", "FinancePage", "overview quick nav only"),
        ("/dashboard/tasks", "TasksPage", "hidden task board"),
        ("/dashboard/chats", "ChatsPage", "sidebar opens via action, not route link"),
        ("/dashboard/analytics", "AnalyticsPage", "health/* redirects here"),
        ("/dashboard/book/:slug", "BookPage", "booking surface"),
        ("/dashboard/database/:databaseName", "DatabasePage", "studio deep link"),
        ("/dashboard/agent/quickstart", "AgentQuickstartPage", "agent shell hidden"),
        ("/dashboard/drive", "DrivePage", "ORPHAN — page exists, no router entry"),
        ("/api/launch-desk", "src/api/launch-desk.js", "API only; UI is /dashboard/collaborate"),
    ]
    return [
        RouteEntry(
            path=path,
            path_pattern=path.replace(":slug", "*").replace(":databaseName", "*"),
            kind="route" if not path.startswith("/api") else "api",
            page_component=comp,
            source_files=["dashboard/App.tsx" if not path.startswith("/api") else "src/index.js"],
            sidebar="no",
            notes=note,
        )
        for path, comp, note in hidden
    ]


def merge_entries(entries: Iterable[RouteEntry]) -> list[RouteEntry]:
    by_path: dict[str, RouteEntry] = {}
    for e in entries:
        key = _norm(e.path)
        if key not in by_path:
            by_path[key] = e
            continue
        existing = by_path[key]
        for sf in e.source_files:
            if sf not in existing.source_files:
                existing.source_files.append(sf)
        if e.page_component and not existing.page_component:
            existing.page_component = e.page_component
        if e.notes and e.notes not in (existing.notes or ""):
            existing.notes = (existing.notes + "; " + e.notes).strip("; ")
    return sorted(by_path.values(), key=lambda x: x.path)


def discover_all_routes(repo_root: Path) -> list[RouteEntry]:
    chunks = [
        discover_from_app_tsx(repo_root),
        discover_from_shell_nav(repo_root),
        discover_agent_routes(repo_root),
        discover_settings_routes(repo_root),
        discover_cms_routes(repo_root),
        discover_moviemode_routes(repo_root),
        discover_hidden_routes(repo_root),
    ]
    return merge_entries(e for chunk in chunks for e in chunk)
