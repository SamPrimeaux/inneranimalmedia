"""D1 bootstrap reads for CMS projects — used by agentic prototyping flows."""

from __future__ import annotations

import json
from typing import Any


async def fetch_project_pages(db, project_slug: str, *, limit: int = 100) -> list[dict[str, Any]]:
    slug = (project_slug or "").strip()
    if not slug:
        return []
    result = await db.prepare(
        """
        SELECT id, slug, title, status, route_path, page_type, r2_key, updated_at
        FROM cms_pages
        WHERE project_slug = ? AND status != 'archived'
        ORDER BY updated_at DESC
        LIMIT ?
        """
    ).bind(slug, limit).all()
    rows = result.results if hasattr(result, "results") else result
    return list(rows or [])


async def fetch_page_sections(db, page_id: str) -> list[dict[str, Any]]:
    pid = (page_id or "").strip()
    if not pid:
        return []
    result = await db.prepare(
        """
        SELECT id, section_type, section_name, section_data, sort_order, is_visible
        FROM cms_page_sections
        WHERE page_id = ?
        ORDER BY sort_order ASC, section_name ASC
        """
    ).bind(pid).all()
    rows = result.results if hasattr(result, "results") else result
    out: list[dict[str, Any]] = []
    for row in rows or []:
        item = dict(row)
        raw = item.get("section_data")
        if isinstance(raw, str):
            try:
                item["section_data"] = json.loads(raw)
            except json.JSONDecodeError:
                item["section_data"] = {}
        out.append(item)
    return out


async def build_bootstrap(db, project_slug: str) -> dict[str, Any]:
    pages = await fetch_project_pages(db, project_slug)
    sections_by_page: dict[str, list] = {}
    for page in pages:
        pid = str(page.get("id") or "")
        if pid:
            sections_by_page[pid] = await fetch_page_sections(db, pid)
    return {
        "project_slug": project_slug,
        "pages": pages,
        "sections_by_page": sections_by_page,
    }
