"""Extract and inject CMS sections (data-cms-section) — Python mirror of cms-injected-sections.js."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from bs4 import BeautifulSoup


@dataclass
class CmsSectionSlot:
    name: str
    tag: str
    outer_html: str


def extract_body_inner(html: str) -> str:
    raw = (html or "").strip()
    if not raw:
        return ""
    soup = BeautifulSoup(raw, "html.parser")
    body = soup.find("body")
    if body:
        return str(body.decode_contents()).strip()
    return raw


def list_section_slots(html: str) -> list[CmsSectionSlot]:
    soup = BeautifulSoup(html or "", "html.parser")
    slots: list[CmsSectionSlot] = []
    for el in soup.find_all(attrs={"data-cms-section": True}):
        name = str(el.get("data-cms-section") or "").strip()
        if not name:
            continue
        slots.append(
            CmsSectionSlot(
                name=name,
                tag=str(el.name or "section"),
                outer_html=str(el),
            )
        )
    return slots


def inject_section_html(
    shell_html: str,
    section_name: str,
    fragment_html: str,
    *,
    position: str = "replace",
) -> str:
    """Replace [data-cms-section=name] or append to body."""
    name = (section_name or "").strip()
    fragment = extract_body_inner(fragment_html)
    if not name or not fragment:
        return shell_html

    soup = BeautifulSoup(shell_html or "", "html.parser")
    target = soup.find(attrs={"data-cms-section": name})
    frag_soup = BeautifulSoup(fragment, "html.parser")
    nodes = list(frag_soup.children)

    if target is not None:
        target.clear()
        for node in nodes:
            target.append(node)
        return str(soup)

    body = soup.find("body")
    if body is None:
        body = soup.new_tag("body")
        if soup.html:
            soup.html.append(body)
        else:
            soup.append(body)

    if position == "start":
        for node in reversed(nodes):
            body.insert(0, node)
    else:
        for node in nodes:
            body.append(node)
    return str(soup)


def section_names_from_html(html: str) -> list[str]:
    return [s.name for s in list_section_slots(html)]


def slugify(value: str, fallback: str = "section") -> str:
    out = re.sub(r"[^a-z0-9._-]+", "-", (value or "").strip().lower()).strip("-")
    return out or fallback


def default_sections_from_template(html: str) -> list[dict]:
    """Build D1 section stubs from data-cms-section markers in page HTML."""
    sections: list[dict] = []
    for i, slot in enumerate(list_section_slots(html)):
        sections.append(
            {
                "section_type": "custom",
                "section_name": slot.name,
                "section_data": {
                    "headline": slot.name.replace("-", " ").title(),
                    "html_source": "template",
                },
                "sort_order": (i + 1) * 10,
            }
        )
    return sections
