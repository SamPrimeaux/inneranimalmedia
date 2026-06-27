"""
Shopify theme audit → IAM CMS scaffold proposal + reusable gallery candidates.

Parses sections/*.liquid {% schema %} blocks, maps templates to proposed cms_pages,
and emits data-cms-section HTML stubs for gallery / proceed flows.
"""

from __future__ import annotations

import json
import re
from typing import Any

SCHEMA_RE = re.compile(
    r"\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}",
    re.DOTALL | re.IGNORECASE,
)
LIQUID_BLOCK = re.compile(r"\{%-?.*?-?%\}", re.DOTALL)
LIQUID_VAR = re.compile(r"\{\{.*?\}\}", re.DOTALL)
HTML_TAG = re.compile(r"<[a-zA-Z][^>]*>", re.DOTALL)

SHOPIFY_TO_IAM = {
    "header": "navigation",
    "footer": "footer",
    "announcement-bar": "announcement",
    "hero": "hero",
    "banner": "hero",
    "image-banner": "hero",
    "slideshow": "hero",
    "video": "hero",
    "featured-collection": "gallery",
    "collection-list": "gallery",
    "multicolumn": "services",
    "multirow": "services",
    "collage": "gallery",
    "rich-text": "custom",
    "newsletter": "cta",
    "contact-form": "cta",
    "email-signup": "cta",
    "featured-product": "product",
    "main-product": "product",
    "product-recommendations": "product",
    "cart": "cart",
    "main-cart": "cart",
}

TEMPLATE_PAGE_TYPE = {
    "index": ("home", "/"),
    "product": ("product", "/products/:handle"),
    "collection": ("collection", "/collections/:handle"),
    "cart": ("cart", "/cart"),
    "search": ("search", "/search"),
    "404": ("error", "/404"),
    "password": ("landing", "/password"),
    "list-collections": ("collection_list", "/collections"),
}


def parse_liquid_schema(liquid: str) -> dict[str, Any] | None:
    raw = liquid or ""
    m = SCHEMA_RE.search(raw)
    if not m:
        return None
    try:
        data = json.loads(m.group(1).strip())
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def infer_iam_section_type(section_key: str, schema: dict[str, Any] | None) -> str:
    key = (section_key or "").strip().lower()
    if key in SHOPIFY_TO_IAM:
        return SHOPIFY_TO_IAM[key]
    if schema:
        name = str(schema.get("name") or "").lower()
        for token, iam in SHOPIFY_TO_IAM.items():
            if token in key or token in name:
                return iam
        for block in schema.get("blocks") or []:
            btype = str(block.get("type") or "").lower()
            if btype in SHOPIFY_TO_IAM:
                return SHOPIFY_TO_IAM[btype]
    if "hero" in key or "banner" in key:
        return "hero"
    if "footer" in key:
        return "footer"
    if "header" in key or "nav" in key:
        return "navigation"
    if "gallery" in key or "collection" in key:
        return "gallery"
    if "newsletter" in key or "cta" in key:
        return "cta"
    return "custom"


def schema_setting_defaults(schema: dict[str, Any] | None) -> dict[str, Any]:
    if not schema:
        return {}
    out: dict[str, Any] = {}
    for field in schema.get("settings") or []:
        if not isinstance(field, dict):
            continue
        fid = str(field.get("id") or "").strip()
        if not fid:
            continue
        if "default" in field:
            out[fid] = field.get("default")
    return out


def strip_liquid(source: str) -> str:
    text = LIQUID_BLOCK.sub("", source or "")
    text = LIQUID_VAR.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def liquid_to_cms_html(
    section_key: str,
    liquid_source: str,
    *,
    schema: dict[str, Any] | None = None,
    settings: dict[str, Any] | None = None,
) -> str:
    """Best-effort Liquid → IAM HTML with data-cms-section (stub or stripped markup)."""
    key = (section_key or "section").strip()
    iam_type = infer_iam_section_type(key, schema)
    merged = {**schema_setting_defaults(schema), **(settings or {})}
    headline = (
        str(merged.get("heading") or merged.get("title") or merged.get("headline") or "")
        .strip()
        or key.replace("-", " ").replace("_", " ").title()
    )
    body = str(merged.get("text") or merged.get("description") or merged.get("subheading") or "").strip()
    stripped = strip_liquid(liquid_source or "")
    has_html = bool(HTML_TAG.search(stripped))

    if has_html and len(stripped) > 40:
        soup_like = stripped
        if 'data-cms-section=' not in soup_like:
            soup_like = re.sub(
                r"^(\s*<[a-zA-Z][^>]*)(>)",
                rf'\1 data-cms-section="{key}" data-iam-section-type="{iam_type}"\2',
                soup_like,
                count=1,
            )
        return soup_like

    body_html = f"<p>{body}</p>" if body else ""
    return (
        f'<section data-cms-section="{key}" data-iam-section-type="{iam_type}" '
        f'class="iam-section iam-section--{iam_type}">'
        f"<h2>{headline}</h2>{body_html}</section>"
    )


def _section_audit_row(
    section_key: str,
    path: str,
    liquid_source: str,
    *,
    template_usage: list[str] | None = None,
) -> dict[str, Any]:
    schema = parse_liquid_schema(liquid_source)
    iam_type = infer_iam_section_type(section_key, schema)
    settings_count = len(schema.get("settings") or []) if schema else 0
    blocks_count = len(schema.get("blocks") or []) if schema else 0
    findings: list[str] = []
    if not schema:
        findings.append("missing_schema_block")
    if schema and not settings_count and not blocks_count:
        findings.append("empty_schema")
    if len(liquid_source or "") > 32000:
        findings.append("liquid_truncated_in_d1")
    if "{% render" in (liquid_source or "") or "{%- render" in (liquid_source or ""):
        findings.append("uses_snippet_render")
    if "{% include" in (liquid_source or ""):
        findings.append("uses_legacy_include")

    gallery_score = 0
    if schema:
        gallery_score += 2
    if settings_count >= 2:
        gallery_score += 1
    if iam_type in ("hero", "services", "cta", "gallery", "navigation", "footer"):
        gallery_score += 2
    if template_usage and len(template_usage) > 1:
        gallery_score += 2

    resale_tier = "raw"
    if gallery_score >= 5:
        resale_tier = "premium"
    elif gallery_score >= 3:
        resale_tier = "standard"

    return {
        "section_key": section_key,
        "path": path,
        "iam_section_type": iam_type,
        "schema": schema,
        "schema_name": (schema or {}).get("name"),
        "settings_count": settings_count,
        "blocks_count": blocks_count,
        "template_usage": template_usage or [],
        "findings": findings,
        "gallery_score": gallery_score,
        "resale_tier": resale_tier,
        "gallery_eligible": gallery_score >= 3,
        "section_data": {
            "headline": section_key.replace("-", " ").title(),
            "shopify_section_type": section_key,
            **schema_setting_defaults(schema),
        },
        "html_fragment": liquid_to_cms_html(
            section_key,
            liquid_source,
            schema=schema,
        ),
    }


def build_template_usage(templates: list[dict[str, Any]]) -> dict[str, list[str]]:
    usage: dict[str, list[str]] = {}
    for tpl in templates or []:
        name = str(tpl.get("name") or "")
        for st in tpl.get("section_types") or []:
            key = str(st)
            usage.setdefault(key, [])
            if name not in usage[key]:
                usage[key].append(name)
    return usage


def audit_theme_package(
    *,
    manifest: dict[str, Any] | None = None,
    sections: list[dict[str, Any]] | None = None,
    templates: list[dict[str, Any]] | None = None,
    categories: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Deep audit of extracted theme package."""
    manifest = manifest or {}
    sections = sections or []
    templates = templates or manifest.get("templates") or []
    categories = categories or manifest.get("categories") or {}

    usage = build_template_usage(templates)
    audited_sections: list[dict[str, Any]] = []
    for sec in sections:
        key = str(sec.get("section_key") or sec.get("section_type") or "").strip()
        if not key:
            continue
        audited_sections.append(
            _section_audit_row(
                key,
                str(sec.get("path") or f"sections/{key}.liquid"),
                str(sec.get("liquid_source") or ""),
                template_usage=usage.get(key, []),
            )
        )

    missing_schema = sum(1 for s in audited_sections if "missing_schema_block" in s["findings"])
    snippet_heavy = sum(1 for s in audited_sections if "uses_snippet_render" in s["findings"])
    gallery_eligible = [s for s in audited_sections if s["gallery_eligible"]]

    severity = "info"
    if missing_schema > len(audited_sections) * 0.5:
        severity = "warning"
    if not templates:
        severity = "warning"

    return {
        "ok": True,
        "audit_version": "theme_audit_v1",
        "severity": severity,
        "summary": {
            "sections_audited": len(audited_sections),
            "templates_found": len(templates),
            "missing_schema_count": missing_schema,
            "snippet_dependent_count": snippet_heavy,
            "gallery_eligible_count": len(gallery_eligible),
            "categories": categories,
        },
        "sections": audited_sections,
        "templates": templates,
        "recommendations": _build_recommendations(
            audited_sections, templates, categories, missing_schema, snippet_heavy
        ),
    }


def _build_recommendations(
    sections: list[dict[str, Any]],
    templates: list[dict[str, Any]],
    categories: dict[str, Any],
    missing_schema: int,
    snippet_heavy: int,
) -> list[str]:
    recs: list[str] = []
    if missing_schema:
        recs.append(
            f"{missing_schema} section(s) lack a schema block — manual mapping or AI prototype recommended."
        )
    if snippet_heavy:
        recs.append(
            f"{snippet_heavy} section(s) use snippet render tags — resolve snippets before pixel-accurate HTML."
        )
    if (categories.get("assets") or 0) > 0:
        recs.append("Copy theme assets/ to cms_assets or CDN before publish for image parity.")
    if len(templates) > 1:
        recs.append(
            f"Theme has {len(templates)} templates — proceed with index first, then batch-scaffold product/collection pages."
        )
    premium = [s for s in sections if s.get("resale_tier") == "premium"]
    if premium:
        recs.append(
            f"{len(premium)} section(s) scored premium for template gallery resale."
        )
    return recs


def build_proposed_scaffold(
    *,
    manifest: dict[str, Any] | None = None,
    audit: dict[str, Any] | None = None,
    project_slug: str = "site",
    workspace_id: str = "",
) -> dict[str, Any]:
    """Organized IAM CMS scaffold plan from audit output."""
    manifest = manifest or {}
    audit = audit or {}
    audited_by_key = {s["section_key"]: s for s in audit.get("sections") or []}
    templates = audit.get("templates") or manifest.get("templates") or []

    proposed_pages: list[dict[str, Any]] = []
    for tpl in templates:
        name = str(tpl.get("name") or "index")
        page_type, route_path = TEMPLATE_PAGE_TYPE.get(name, ("page", f"/{name}"))
        slug = "home" if name == "index" else name.replace("_", "-")
        page_sections: list[dict[str, Any]] = []
        order_keys = tpl.get("section_order") or []
        section_types = tpl.get("section_types") or []
        for i, instance_key in enumerate(order_keys):
            stype = str(section_types[i] if i < len(section_types) else instance_key)
            audited = audited_by_key.get(stype, {})
            page_sections.append(
                {
                    "instance_key": instance_key,
                    "section_name": instance_key,
                    "section_type": audited.get("iam_section_type") or infer_iam_section_type(stype, None),
                    "shopify_section_type": stype,
                    "sort_order": (i + 1) * 10,
                    "section_data": audited.get("section_data")
                    or {"headline": stype.replace("-", " ").title(), "shopify_section_type": stype},
                    "html_fragment": audited.get("html_fragment"),
                    "liquid_section_key": stype,
                    "gallery_eligible": audited.get("gallery_eligible", False),
                }
            )
        proposed_pages.append(
            {
                "slug": slug,
                "title": slug.replace("-", " ").title(),
                "route_path": route_path if name == "index" else route_path,
                "page_type": page_type,
                "is_homepage": name == "index",
                "shopify_template": name,
                "sections": page_sections,
                "r2_published_key": f"cms/{workspace_id}/{project_slug}/{slug}/published.html",
            }
        )

    gallery_candidates = [
        {
            "section_key": s["section_key"],
            "iam_section_type": s["iam_section_type"],
            "resale_tier": s["resale_tier"],
            "gallery_score": s["gallery_score"],
            "schema_name": s.get("schema_name"),
            "template_usage": s.get("template_usage") or [],
            "section_data": s.get("section_data") or {},
            "html_fragment": s.get("html_fragment"),
            "source_path": s.get("path"),
            "tags": _gallery_tags(s),
        }
        for s in audit.get("sections") or []
        if s.get("gallery_eligible")
    ]
    gallery_candidates.sort(key=lambda x: (-x["gallery_score"], x["section_key"]))

    default_template = manifest.get("default_template") or "index"
    default_page = next((p for p in proposed_pages if p["shopify_template"] == default_template), proposed_pages[0] if proposed_pages else None)

    return {
        "ok": True,
        "scaffold_version": "iam_scaffold_v1",
        "project_slug": project_slug,
        "workspace_id": workspace_id,
        "default_template": default_template,
        "default_page": default_page,
        "proposed_pages": proposed_pages,
        "gallery_candidates": gallery_candidates,
        "proceed_hint": {
            "template": default_template,
            "sections": [s["shopify_section_type"] for s in (default_page or {}).get("sections") or []],
            "endpoint": "POST /api/cms/site-packages/{id}/proceed",
        },
    }


def _gallery_tags(section: dict[str, Any]) -> list[str]:
    tags = [section.get("iam_section_type") or "custom"]
    if section.get("resale_tier") == "premium":
        tags.append("premium")
    usage = section.get("template_usage") or []
    if len(usage) > 1:
        tags.append("multi-template")
    if section.get("schema_name"):
        tags.append("schema")
    return tags


def convert_sections_batch(
    sections: list[dict[str, Any]] | None = None,
    *,
    section_keys: list[str] | None = None,
) -> dict[str, Any]:
    """Convert selected Liquid sections to IAM HTML fragments."""
    sections = sections or []
    keys = set(section_keys or [])
    converted: list[dict[str, Any]] = []
    for sec in sections:
        key = str(sec.get("section_key") or "").strip()
        if keys and key not in keys:
            continue
        schema = parse_liquid_schema(str(sec.get("liquid_source") or ""))
        html = liquid_to_cms_html(
            key,
            str(sec.get("liquid_source") or ""),
            schema=schema,
            settings=sec.get("settings") if isinstance(sec.get("settings"), dict) else None,
        )
        converted.append(
            {
                "section_key": key,
                "iam_section_type": infer_iam_section_type(key, schema),
                "html_fragment": html,
            }
        )
    return {"ok": True, "converted": converted, "count": len(converted)}
