#!/usr/bin/env python3

import json
import subprocess
from pathlib import Path

REPO = Path(".").resolve()
DB = "inneranimalmedia-business"
CONFIG = "wrangler.production.toml"

OUT_DIR = REPO / "artifacts" / "cms_homepage_section_audit" / "selected_work_replacement" / "stage" / "fk_fix_seed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SQL_FILE = OUT_DIR / "fix_fk_and_seed_agentsam.sql"

PAGE_ID = "page_home"
OLD_SECTION_ID = "sec_home_work"
NEW_SECTION_ID = "sec_home_agent_sam_platform_services"
IMPORT_ID = "limp_agent_sam_platform_services"
LIQUID_ID = "lsec_agent_sam_platform_services"

R2_BUCKET = "inneranimalmedia"
R2_KEY = "cms/sections/homepage/agent_sam_platform_services/3d5a37ecdd71/agentsam_platform_services.html"
R2_URL = "https://assets.inneranimalmedia.com/" + R2_KEY


def run(cmd):
    print("RUN:", " ".join(cmd))
    p = subprocess.run(
        cmd,
        cwd=str(REPO),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    print(p.stdout)
    if p.returncode != 0:
        print(p.stderr)
        raise SystemExit(p.returncode)
    return p.stdout


def run_json(sql):
    raw = run([
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--json",
        "--command", sql,
    ])

    raw = raw.strip()
    if not raw:
        return []

    starts = [x for x in [raw.find("["), raw.find("{")] if x >= 0]
    if not starts:
        return []

    payload = json.loads(raw[min(starts):])
    rows = []

    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                rows.extend(item.get("results", []))
    elif isinstance(payload, dict):
        rows.extend(payload.get("results", []))

    return rows


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    fk_rows = run_json("PRAGMA foreign_key_list(cms_liquid_sections);")
    print("cms_liquid_sections FK rows:")
    print(json.dumps(fk_rows, indent=2))

    fk_tables = {row.get("table") for row in fk_rows}

    needs_rebuild = False

    if "cms_liquid_imports" not in fk_tables:
        needs_rebuild = True

    if "cms_liquid_imports_old" in fk_tables:
        needs_rebuild = True

    section_data = {
        "eyebrow": {
            "text": "Agent Sam Platform",
            "status_dot": True
        },
        "headline": "The all-in-one command center for intelligent agents",
        "subheadline": "Build, deploy, and optimize production-ready AI workflows with connected tools, live data, model routing, CMS components, and real execution proof.",
        "cta_primary": {
            "label": "Explore Agent Sam",
            "href": "/dashboard/agent"
        },
        "cta_secondary": {
            "label": "View capabilities",
            "href": "/dashboard/analytics/overview"
        },
        "feature_cards": [
            {
                "key": "build",
                "title": "Build",
                "description": "Design agents, workflows, prompts, tools, commands, and CMS sections from a visual-first or code-first system."
            },
            {
                "key": "deploy",
                "title": "Deploy",
                "description": "Connect Agent Sam to real infrastructure: Cloudflare Workers, D1, R2, GitHub, Supabase, Gmail, Calendar, and public pages."
            },
            {
                "key": "optimize",
                "title": "Optimize",
                "description": "Track evals, traces, model costs, routing quality, workflow success, and tool reliability from one analytics layer."
            }
        ],
        "seo": {
            "section_role": "homepage_platform_services",
            "summary": "Agent Sam platform services for building, deploying, and optimizing intelligent agent workflows.",
            "keywords": [
                "Agent Sam",
                "AI workflows",
                "model routing",
                "CMS components",
                "Cloudflare Workers",
                "D1",
                "R2"
            ]
        },
        "template_artifact": {
            "repo_path": "cms/sections/homepage/agentsam_platform_services.html",
            "r2_bucket": R2_BUCKET,
            "r2_key": R2_KEY,
            "public_url_guess": R2_URL,
            "liquid_section_id": LIQUID_ID
        }
    }

    schema_json = {
        "name": "Agent Sam Platform Services",
        "section_key": "agent_sam_platform_services",
        "replacement_for": "selected_work",
        "settings": [
            {"id": "eyebrow", "type": "text"},
            {"id": "headline", "type": "text"},
            {"id": "subheadline", "type": "textarea"},
            {"id": "cta_primary", "type": "link"},
            {"id": "cta_secondary", "type": "link"},
            {"id": "feature_cards", "type": "list"},
            {"id": "seo", "type": "object"}
        ]
    }

    settings_map_json = {
        "source": "cms_page_sections.section_data",
        "template_artifact": {
            "repo_path": "cms/sections/homepage/agentsam_platform_services.html",
            "r2_bucket": R2_BUCKET,
            "r2_key": R2_KEY,
            "public_url_guess": R2_URL
        }
    }

    render_deps = [
        {
            "type": "r2_html_artifact",
            "bucket": R2_BUCKET,
            "key": R2_KEY
        }
    ]

    sql = []

    sql.append("-- Auto fix FK + seed Agent Sam section.")
    sql.append("-- This script avoids the FK cycle by inserting page section first with liquid_section_id NULL.")
    sql.append("")

    if needs_rebuild:
        sql.append("-- Rebuild cms_liquid_sections because FK target is wrong or missing.")
        sql.append("PRAGMA foreign_keys = OFF;")
        sql.append("DROP TABLE IF EXISTS cms_liquid_sections_old_fkfix;")
        sql.append("ALTER TABLE cms_liquid_sections RENAME TO cms_liquid_sections_old_fkfix;")
        sql.append("""
CREATE TABLE cms_liquid_sections (
  id TEXT PRIMARY KEY DEFAULT ('lsec_' || lower(hex(randomblob(8)))),
  import_id TEXT NOT NULL REFERENCES cms_liquid_imports(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  section_key TEXT NOT NULL,
  section_type TEXT,
  liquid_source TEXT,
  schema_json TEXT DEFAULT '{}',
  settings_map_json TEXT DEFAULT '{}',
  render_deps TEXT DEFAULT '[]',
  mapped_template_id TEXT REFERENCES cms_component_templates(id) ON DELETE SET NULL,
  mapped_section_id TEXT REFERENCES cms_page_sections(id) ON DELETE SET NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(parse_status IN ('pending','parsed','mapped','registered','failed')),
  parse_error TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
""")
        sql.append("""
INSERT OR IGNORE INTO cms_liquid_sections (
  id, import_id, tenant_id, file_name, section_key, section_type,
  liquid_source, schema_json, settings_map_json, render_deps,
  mapped_template_id, mapped_section_id, parse_status, parse_error, created_at
)
SELECT
  id, import_id, tenant_id, file_name, section_key, section_type,
  liquid_source, schema_json, settings_map_json, render_deps,
  mapped_template_id, mapped_section_id,
  CASE
    WHEN parse_status IN ('pending','parsed','mapped','registered','failed') THEN parse_status
    ELSE 'pending'
  END,
  parse_error,
  created_at
FROM cms_liquid_sections_old_fkfix
WHERE import_id IN (SELECT id FROM cms_liquid_imports)
  AND (mapped_section_id IS NULL OR mapped_section_id IN (SELECT id FROM cms_page_sections));
""")
        sql.append("CREATE INDEX IF NOT EXISTS idx_cms_liquid_sections_import_id ON cms_liquid_sections(import_id);")
        sql.append("CREATE INDEX IF NOT EXISTS idx_cms_liquid_sections_key ON cms_liquid_sections(tenant_id, section_key);")
        sql.append("CREATE INDEX IF NOT EXISTS idx_cms_liquid_sections_mapped_section ON cms_liquid_sections(mapped_section_id);")
        sql.append("PRAGMA foreign_keys = ON;")
        sql.append("")

    sql.append("-- Remove broken partial liquid row if present.")
    sql.append("DELETE FROM cms_liquid_sections WHERE id = " + q(LIQUID_ID) + ";")
    sql.append("")

    sql.append("-- Ensure import ledger row exists.")
    sql.append("""
INSERT INTO cms_liquid_imports (
  id,
  tenant_id,
  workspace_id,
  project_id,
  import_key,
  import_name,
  theme_name,
  source_type,
  source_path,
  source_url,
  r2_bucket,
  r2_key,
  r2_url,
  file_name,
  content_type,
  status,
  sections_found,
  sections_mapped,
  metadata_json,
  result_json,
  started_at,
  completed_at,
  created_at,
  updated_at
) VALUES (
  'limp_agent_sam_platform_services',
  COALESCE((SELECT tenant_id FROM cms_pages WHERE id = 'page_home'), 'inneranimalmedia'),
  (SELECT workspace_id FROM cms_pages WHERE id = 'page_home'),
  (SELECT project_id FROM cms_pages WHERE id = 'page_home'),
  'agent_sam_platform_services',
  'Agent Sam Platform Services',
  'inneranimalmedia-home',
  'r2_html_section',
  'cms/sections/homepage/agent_sam_platform_services/3d5a37ecdd71/agentsam_platform_services.html',
  'https://assets.inneranimalmedia.com/cms/sections/homepage/agent_sam_platform_services/3d5a37ecdd71/agentsam_platform_services.html',
  'inneranimalmedia',
  'cms/sections/homepage/agent_sam_platform_services/3d5a37ecdd71/agentsam_platform_services.html',
  'https://assets.inneranimalmedia.com/cms/sections/homepage/agent_sam_platform_services/3d5a37ecdd71/agentsam_platform_services.html',
  'agentsam_platform_services.html',
  'text/html',
  'complete',
  1,
  1,
  '{"section_key":"agent_sam_platform_services","replacement_for":"selected_work","repo_path":"cms/sections/homepage/agentsam_platform_services.html","r2_bucket":"inneranimalmedia","r2_key":"cms/sections/homepage/agent_sam_platform_services/3d5a37ecdd71/agentsam_platform_services.html","shopify_liquid_concept":true}',
  '{"registered_section_id":"lsec_agent_sam_platform_services","mapped_section_id":"sec_home_agent_sam_platform_services"}',
  unixepoch(),
  unixepoch(),
  unixepoch(),
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  status = 'complete',
  sections_found = 1,
  sections_mapped = 1,
  r2_bucket = excluded.r2_bucket,
  r2_key = excluded.r2_key,
  r2_url = excluded.r2_url,
  source_url = excluded.source_url,
  metadata_json = excluded.metadata_json,
  result_json = excluded.result_json,
  completed_at = unixepoch(),
  updated_at = unixepoch();
""")
    sql.append("")

    sql.append("-- Hide old Selected Work row.")
    sql.append("""
UPDATE cms_page_sections
SET is_visible = 0,
    updated_at = datetime('now')
WHERE id = 'sec_home_work'
   OR (page_id = 'page_home' AND sort_order = 30);
""")
    sql.append("")

    sql.append("-- Insert replacement page section first with liquid_section_id NULL.")
    sql.append("""
INSERT INTO cms_page_sections (
  id,
  page_id,
  section_type,
  section_name,
  section_data,
  sort_order,
  is_visible,
  css_classes,
  custom_css,
  created_at,
  updated_at,
  liquid_section_id,
  created_at_unix
) VALUES (
  'sec_home_agent_sam_platform_services',
  'page_home',
  'agent_sam_platform_services',
  'Agent Sam Platform Services',
  """ + q(json.dumps(section_data, separators=(",", ":"), ensure_ascii=False)) + """,
  30,
  1,
  'section section-agent-sam-platform-services',
  NULL,
  datetime('now'),
  datetime('now'),
  NULL,
  unixepoch()
)
ON CONFLICT(id) DO UPDATE SET
  page_id = excluded.page_id,
  section_type = excluded.section_type,
  section_name = excluded.section_name,
  section_data = excluded.section_data,
  sort_order = excluded.sort_order,
  is_visible = 1,
  css_classes = excluded.css_classes,
  updated_at = datetime('now'),
  liquid_section_id = NULL;
""")
    sql.append("")

    sql.append("-- Insert liquid section after both parents exist.")
    sql.append("""
INSERT INTO cms_liquid_sections (
  id,
  import_id,
  tenant_id,
  file_name,
  section_key,
  section_type,
  liquid_source,
  schema_json,
  settings_map_json,
  render_deps,
  mapped_template_id,
  mapped_section_id,
  parse_status,
  parse_error,
  created_at
) VALUES (
  'lsec_agent_sam_platform_services',
  'limp_agent_sam_platform_services',
  COALESCE((SELECT tenant_id FROM cms_pages WHERE id = 'page_home'), 'inneranimalmedia'),
  'agentsam_platform_services.html',
  'agent_sam_platform_services',
  'agent_sam_platform_services',
  '',
  """ + q(json.dumps(schema_json, separators=(",", ":"), ensure_ascii=False)) + """,
  """ + q(json.dumps(settings_map_json, separators=(",", ":"), ensure_ascii=False)) + """,
  """ + q(json.dumps(render_deps, separators=(",", ":"), ensure_ascii=False)) + """,
  NULL,
  'sec_home_agent_sam_platform_services',
  'registered',
  NULL,
  unixepoch()
);
""")
    sql.append("")

    sql.append("-- Link page section back to liquid section.")
    sql.append("""
UPDATE cms_page_sections
SET liquid_section_id = 'lsec_agent_sam_platform_services',
    updated_at = datetime('now')
WHERE id = 'sec_home_agent_sam_platform_services';
""")
    sql.append("")

    sql.append("-- Verify.")
    sql.append("PRAGMA foreign_key_check;")
    sql.append("""
SELECT id, page_id, section_type, section_name, sort_order, is_visible, liquid_section_id
FROM cms_page_sections
WHERE page_id = 'page_home'
ORDER BY sort_order;
""")
    sql.append("""
SELECT id, tenant_id, source_type, source_path, r2_bucket, r2_key, status, sections_found, sections_mapped
FROM cms_liquid_imports
WHERE id = 'limp_agent_sam_platform_services';
""")
    sql.append("""
SELECT id, import_id, tenant_id, file_name, section_key, section_type, mapped_section_id, parse_status
FROM cms_liquid_sections
WHERE id = 'lsec_agent_sam_platform_services';
""")

    SQL_FILE.write_text("\n".join(sql), encoding="utf-8")
    print("WROTE:", SQL_FILE)

    run([
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--file", str(SQL_FILE),
    ])


if __name__ == "__main__":
    main()