#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from textwrap import dedent

DB_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"[write] {path}")

def run(cmd: list[str], cwd: Path) -> int:
    print("$ " + " ".join(cmd))
    p = subprocess.run(cmd, cwd=str(cwd), text=True)
    return p.returncode

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", required=True)
    ap.add_argument("--db-name", default="inneranimalmedia-business")
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--port", default="8789")
    args = ap.parse_args()

    app = Path.cwd()
    repo = Path(args.repo_root).expanduser().resolve()

    print("=" * 88)
    print("Bootstrap isolated CMS editor as D1-backed Wrangler app")
    print("=" * 88)
    print(f"app={app}")
    print(f"repo={repo}")
    print(f"db={args.db_name}")

    html_candidates = [
        app / "DesignStudioCMS.html",
        app / "Design Studio.html",
        app / "DesignStudio.html",
        app / "index.html",
    ]
    html = next((p for p in html_candidates if p.exists()), None)
    if not html:
        raise SystemExit("No DesignStudioCMS.html / Design Studio.html / index.html found in this folder.")

    if html.name != "index.html":
        target = app / "index.html"
        target.write_text(html.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        print(f"[copy] {html.name} -> index.html")

    write(app / "package.json", json.dumps({
        "name": "inneranimalmedia-cms-editor",
        "version": "0.0.1",
        "private": True,
        "type": "module",
        "scripts": {
            "dev:d1": f"wrangler pages dev . --compatibility-date=2025-12-01 --port {args.port} --d1 DB={args.db_name}",
            "smoke": "python3 ./bootstrap_cms_pages_d1_app.py --repo-root /Users/samprimeaux/inneranimalmedia --db-name inneranimalmedia-business --smoke",
            "check": "python3 -m py_compile ./bootstrap_cms_pages_d1_app.py"
        },
        "devDependencies": {
            "wrangler": "^4.90.1"
        }
    }, indent=2))

    write(app / "wrangler.toml", dedent(f"""
    name = "inneranimalmedia-cms-editor"
    compatibility_date = "2025-12-01"
    pages_build_output_dir = "."

    [[d1_databases]]
    binding = "DB"
    database_name = "{args.db_name}"
    database_id = "{DB_ID}"
    """))

    write(app / "functions" / "api" / "cms" / "health.js", dedent("""
    export async function onRequestGet(context) {
      const { env } = context;
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS cms_tables FROM sqlite_master WHERE name LIKE 'cms_%' AND type IN ('table','view')"
      ).first();
      return Response.json({ ok: true, app: "inneranimalmedia-cms-editor", ...row });
    }
    """))

    write(app / "functions" / "api" / "cms" / "editor-contract.js", dedent("""
    const TABLES = [
      "cms_pages",
      "cms_page_sections",
      "cms_section_components",
      "cms_component_templates",
      "cms_liquid_sections",
      "cms_themes",
      "cms_page_drafts",
      "cms_page_overrides",
      "cms_override_versions",
      "cms_live_edit_sessions",
      "cms_live_rollbacks"
    ];

    export async function onRequestGet(context) {
      const { env } = context;
      const out = {};
      for (const table of TABLES) {
        const cols = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
        out[table] = cols.results || [];
      }
      return Response.json({ ok: true, tables: TABLES, schema: out });
    }
    """))

    write(app / "functions" / "api" / "cms" / "pages.js", dedent("""
    export async function onRequestGet(context) {
      const { env } = context;
      const rows = await env.DB.prepare(`
        SELECT id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
               page_type, title, status, is_homepage, is_system_page, sort_order,
               updated_at, published_at
        FROM cms_pages
        WHERE COALESCE(is_active, 1) = 1
        ORDER BY is_homepage DESC, sort_order ASC, updated_at DESC
        LIMIT 100
      `).all();
      return Response.json({ ok: true, count: rows.results?.length || 0, pages: rows.results || [] });
    }
    """))

    write(app / "functions" / "api" / "cms" / "themes.js", dedent("""
    export async function onRequestGet(context) {
      const { env } = context;
      const rows = await env.DB.prepare(`
        SELECT id, tenant_id, name, slug, theme_family, status, visibility, sort_order,
               css_url, css_r2_key, compiled_css_hash, preview_image_url, updated_at
        FROM cms_themes
        WHERE COALESCE(status, 'active') = 'active'
        ORDER BY sort_order ASC, updated_at DESC
        LIMIT 100
      `).all();
      return Response.json({ ok: true, count: rows.results?.length || 0, themes: rows.results || [] });
    }
    """))

    write(app / "functions" / "api" / "cms" / "page" / "[id].js", dedent("""
    export async function onRequestGet(context) {
      const { env, params } = context;
      const page = await env.DB.prepare("SELECT * FROM cms_pages WHERE id = ? LIMIT 1").bind(params.id).first();
      if (!page) return Response.json({ ok: false, error: "page_not_found" }, { status: 404 });

      const sections = await env.DB.prepare(`
        SELECT * FROM cms_page_sections
        WHERE page_id = ?
        ORDER BY sort_order ASC
      `).bind(params.id).all();

      const sectionIds = (sections.results || []).map(s => s.id);
      let components = [];
      if (sectionIds.length) {
        const placeholders = sectionIds.map(() => "?").join(",");
        const q = `
          SELECT * FROM cms_section_components
          WHERE section_id IN (${placeholders})
          ORDER BY section_id ASC, sort_order ASC
        `;
        const c = await env.DB.prepare(q).bind(...sectionIds).all();
        components = c.results || [];
      }

      return Response.json({
        ok: true,
        page,
        sections: sections.results || [],
        components
      });
    }
    """))

    write(app / "functions" / "api" / "cms" / "templates.js", dedent("""
    export async function onRequestGet(context) {
      const { env } = context;
      const rows = await env.DB.prepare(`
        SELECT id, template_name, template_type, category, preview_image_url, is_system,
               tenant_id, shopify_section_key, source_liquid_file, liquid_import_id, updated_at
        FROM cms_component_templates
        ORDER BY category ASC, template_name ASC
        LIMIT 200
      `).all();
      return Response.json({ ok: true, count: rows.results?.length || 0, templates: rows.results || [] });
    }
    """))

    write(app / "README.local.md", dedent(f"""
    # InnerAnimalMedia CMS Editor Prototype

    Isolated prototype folder wired to Cloudflare Pages Functions + D1.

    ## Run

    ```bash
    cd {app}
    npm install
    npm run dev:d1
    ```

    ## Smoke

    ```bash
    curl -sS http://localhost:{args.port}/api/cms/health | jq
    curl -sS http://localhost:{args.port}/api/cms/editor-contract | jq '.tables'
    curl -sS http://localhost:{args.port}/api/cms/pages | jq '.count'
    curl -sS http://localhost:{args.port}/api/cms/themes | jq '.count'
    ```

    This folder is local-first. R2/static preview comes after the API smoke passes.
    """))

    print("[ok] bootstrap files written")
    print("[ok] now run: npm install && npm run dev:d1")

    if args.smoke:
        rc = run(["python3", "-m", "py_compile", "./bootstrap_cms_pages_d1_app.py"], app)
        if rc != 0:
            return rc
        print("[ok] python syntax smoke passed")
        print("[note] start server with: npm run dev:d1")
        print(f"[note] then test: curl -sS http://localhost:{args.port}/api/cms/health | jq")

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
