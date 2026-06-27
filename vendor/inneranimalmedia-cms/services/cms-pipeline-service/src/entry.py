"""
IAM CMS Pipeline — Python Worker (Pyodide / workers-py).

Agentic HTML parsing, D1 bootstrap, R2 reads, Workers AI prototyping.
Called from Agent Sam tools or via service binding from inneranimalmedia Worker.
"""

from __future__ import annotations

import json
from urllib.parse import urlparse

from workers import WorkerEntrypoint, Response

from pipeline.agent_prototype import propose_sections
from pipeline.bootstrap import build_bootstrap, fetch_page_sections
from pipeline.html_sections import (
    default_sections_from_template,
    extract_body_inner,
    inject_section_html,
    list_section_slots,
    section_names_from_html,
)
from pipeline.preview import inject_bootstrap_script, studio_bootstrap_payload
from pipeline.theme_audit import (
    audit_theme_package,
    build_proposed_scaffold,
    convert_sections_batch,
    liquid_to_cms_html,
    parse_liquid_schema,
)


def _json_response(payload, status=200):
    return Response.from_json(payload, status=status)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urlparse(request.url)
        path = url.path.rstrip("/") or "/"
        method = request.method.upper()

        if path == "/health":
            return _json_response({"ok": True, "service": "iam-cms-pipeline", "runtime": "python"})

        if path == "/pipeline/extract-sections" and method == "POST":
            body = await request.json()
            html = str(body.get("html") or body.get("content") or "")
            slots = list_section_slots(html)
            return _json_response(
                {
                    "section_names": section_names_from_html(html),
                    "slots": [{"name": s.name, "tag": s.tag} for s in slots],
                    "default_sections": default_sections_from_template(html),
                    "body_inner": extract_body_inner(html),
                }
            )

        if path == "/pipeline/inject" and method == "POST":
            body = await request.json()
            out = inject_section_html(
                str(body.get("shell_html") or body.get("html") or ""),
                str(body.get("section_name") or ""),
                str(body.get("fragment_html") or body.get("fragment") or ""),
                position=str(body.get("position") or "replace"),
            )
            return _json_response({"html": out})

        if path == "/pipeline/bootstrap" and method in ("GET", "POST"):
            project = ""
            if method == "GET":
                from urllib.parse import parse_qs

                project = (parse_qs(url.query).get("project_slug") or [""])[0]
            else:
                body = await request.json()
                project = str(body.get("project_slug") or body.get("project") or "")
            if not self.env.DB:
                return _json_response({"error": "DB binding missing"}, status=503)
            data = await build_bootstrap(self.env.DB, project)
            return _json_response(data)

        if path == "/pipeline/r2-text" and method == "POST":
            body = await request.json()
            key = str(body.get("r2_key") or body.get("key") or "").strip()
            bucket = str(body.get("r2_bucket") or body.get("bucket") or "cms").strip().lower()
            if not key:
                return _json_response({"error": "r2_key required"}, status=400)
            r2 = None
            if bucket == "cms" and getattr(self.env, "CMS_BUCKET", None):
                r2 = self.env.CMS_BUCKET
            elif bucket in ("inneranimalmedia", "dashboard") and getattr(self.env, "ASSETS", None):
                r2 = self.env.ASSETS
            elif getattr(self.env, "CMS_BUCKET", None):
                r2 = self.env.CMS_BUCKET
            elif getattr(self.env, "ASSETS", None):
                r2 = self.env.ASSETS
            if not r2:
                return _json_response({"error": "R2 binding missing", "bucket": bucket}, status=503)
            obj = await r2.get(key)
            if not obj:
                return _json_response({"error": "not_found", "r2_key": key, "r2_bucket": bucket}, status=404)
            text = await obj.text()
            return _json_response({"r2_key": key, "r2_bucket": bucket, "text": text})

        if path == "/agent/prototype" and method == "POST":
            if not self.env.AI:
                return _json_response({"error": "AI binding missing"}, status=503)
            body = await request.json()
            goal = str(body.get("goal") or body.get("prompt") or "").strip()
            page_id = str(body.get("page_id") or "").strip()
            project = str(body.get("project_slug") or body.get("project") or "").strip()
            if not goal:
                return _json_response({"error": "goal required"}, status=400)
            page = body.get("page") or {}
            sections = body.get("sections")
            if sections is None and page_id and self.env.DB:
                sections = await fetch_page_sections(self.env.DB, page_id)
            if sections is None:
                sections = []
            if not page and page_id and self.env.DB:
                page = (
                    await self.env.DB.prepare(
                        "SELECT id, slug, title, route_path, status FROM cms_pages WHERE id = ? LIMIT 1"
                    )
                    .bind(page_id)
                    .first()
                    or {}
                )
            proposal = await propose_sections(
                self.env.AI,
                goal=goal,
                page=dict(page) if page else {"project_slug": project},
                sections=list(sections),
            )
            return _json_response(proposal)

        if path == "/pipeline/studio-bootstrap-html" and method == "POST":
            body = await request.json()
            shell = str(body.get("shell_html") or "")
            project = str(body.get("project_slug") or "")
            page_id = str(body.get("page_id") or "") or None
            bootstrap = body.get("bootstrap")
            if bootstrap is None and project and self.env.DB:
                bootstrap = await build_bootstrap(self.env.DB, project)
            payload = studio_bootstrap_payload(
                project_slug=project,
                page_id=page_id,
                bootstrap=bootstrap or {},
                preview_urls=body.get("preview_urls") or {},
            )
            html = inject_bootstrap_script(shell, payload)
            return Response(html, headers={"Content-Type": "text/html; charset=utf-8"})

        if path == "/pipeline/theme-audit" and method == "POST":
            body = await request.json()
            manifest = body.get("manifest") if isinstance(body.get("manifest"), dict) else {}
            sections = body.get("sections") if isinstance(body.get("sections"), list) else []
            templates = body.get("templates") if isinstance(body.get("templates"), list) else None
            categories = body.get("categories") if isinstance(body.get("categories"), dict) else None
            audit = audit_theme_package(
                manifest=manifest,
                sections=sections,
                templates=templates,
                categories=categories,
            )
            return _json_response(audit)

        if path == "/pipeline/theme-scaffold-plan" and method == "POST":
            body = await request.json()
            manifest = body.get("manifest") if isinstance(body.get("manifest"), dict) else {}
            audit = body.get("audit") if isinstance(body.get("audit"), dict) else None
            if audit is None:
                sections = body.get("sections") if isinstance(body.get("sections"), list) else []
                audit = audit_theme_package(manifest=manifest, sections=sections)
            scaffold = build_proposed_scaffold(
                manifest=manifest,
                audit=audit,
                project_slug=str(body.get("project_slug") or body.get("project") or "site"),
                workspace_id=str(body.get("workspace_id") or ""),
            )
            return _json_response({"audit": audit, "proposed_scaffold": scaffold})

        if path == "/pipeline/liquid-to-html" and method == "POST":
            body = await request.json()
            section_key = str(body.get("section_key") or body.get("sectionKey") or "").strip()
            liquid = str(body.get("liquid_source") or body.get("liquid") or "")
            if not section_key and not liquid:
                return _json_response({"error": "section_key or liquid_source required"}, status=400)
            schema = body.get("schema")
            if schema is None and liquid:
                schema = parse_liquid_schema(liquid)
            settings = body.get("settings") if isinstance(body.get("settings"), dict) else None
            html = liquid_to_cms_html(section_key or "section", liquid, schema=schema, settings=settings)
            return _json_response(
                {
                    "ok": True,
                    "section_key": section_key,
                    "html_fragment": html,
                    "schema": schema,
                }
            )

        if path == "/pipeline/liquid-to-html-batch" and method == "POST":
            body = await request.json()
            sections = body.get("sections") if isinstance(body.get("sections"), list) else []
            keys = body.get("section_keys") if isinstance(body.get("section_keys"), list) else None
            out = convert_sections_batch(sections, section_keys=keys)
            return _json_response(out)

        return _json_response({"error": "not_found", "path": path}, status=404)
