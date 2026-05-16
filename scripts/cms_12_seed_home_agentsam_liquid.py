#!/usr/bin/env python3

import json
import subprocess
import time
from pathlib import Path

REPO = Path(".").resolve()

DB = "inneranimalmedia-business"
CONFIG = "wrangler.production.toml"

PAGE_ID = "page_home"
OLD_SECTION_ID = "sec_home_work"
NEW_SECTION_ID = "sec_home_agent_sam_platform_services"
LIQUID_IMPORT_ID = "limp_agent_sam_platform_services"
LIQUID_SECTION_ID = "lsec_agent_sam_platform_services"

STAGE = REPO / "artifacts" / "cms_homepage_section_audit" / "selected_work_replacement" / "stage"
SOURCE_HTML = REPO / "cms" / "sections" / "homepage" / "agentsam_platform_services.html"

OUT_DIR = STAGE / "seed_liquid"
OUT_SQL = OUT_DIR / "seed_home_agentsam_liquid.sql"
OUT_MANIFEST = OUT_DIR / "seed_home_agentsam_liquid_manifest.json"


def run_json(sql):
    cmd = [
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--json",
        "--command", sql,
    ]

    p = subprocess.run(
        cmd,
        cwd=str(REPO),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if p.returncode != 0:
        print(p.stderr)
        raise SystemExit(p.returncode)

    raw = p.stdout.strip()
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


def run_sql_file(path):
    cmd = [
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--file", str(path),
    ]

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


def q(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def jq(value):
    return q(json.dumps(value, separators=(",", ":"), ensure_ascii=False))


def table_info(table):
    return run_json("PRAGMA table_info(" + table + ");")


def table_cols(table):
    return [row["name"] for row in table_info(table)]


def table_col_types(table):
    out = {}
    for row in table_info(table):
        out[row["name"]] = str(row.get("type") or "").upper()
    return out


def get_one(sql):
    rows = run_json(sql)
    if not rows:
        return None
    return rows[0]


def safe_json(value):
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        return {}


def read_required_files():
    manifest_path = STAGE / "stage_manifest.json"
    section_data_path = STAGE / "section_data_seed.json"

    if not manifest_path.exists():
        raise SystemExit("Missing " + str(manifest_path))

    if not section_data_path.exists():
        raise SystemExit("Missing " + str(section_data_path))

    if not SOURCE_HTML.exists():
        raise SystemExit("Missing repo HTML copy " + str(SOURCE_HTML))

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    section_data = json.loads(section_data_path.read_text(encoding="utf-8"))
    html_source = SOURCE_HTML.read_text(encoding="utf-8", errors="ignore")

    return manifest, section_data, html_source


def build_insert_or_replace(table, values):
    cols = table_cols(table)
    actual = []
    vals = []

    for col in cols:
        if col in values:
            actual.append(col)
            vals.append(values[col])

    if not actual:
        raise SystemExit("No matching columns for " + table)

    sql = []
    sql.append("INSERT OR REPLACE INTO " + table + " (")
    sql.append("  " + ", ".join(actual))
    sql.append(") VALUES (")
    sql.append("  " + ", ".join(vals))
    sql.append(");")
    return "\n".join(sql)


def build_import_values(page, manifest):
    cols = table_cols("cms_liquid_imports")
    types = table_col_types("cms_liquid_imports")

    tenant_id = page.get("tenant_id") or "inneranimalmedia"
    project_id = page.get("project_id") or "inneranimalmedia"
    workspace_id = page.get("workspace_id")

    values = {}

    candidate_values = {
        "id": q(LIQUID_IMPORT_ID),
        "tenant_id": q(tenant_id),
        "project_id": q(project_id),
        "workspace_id": q(workspace_id),
        "import_id": q(LIQUID_IMPORT_ID),
        "import_key": q("agent_sam_platform_services"),
        "import_name": q("Agent Sam Platform Services"),
        "name": q("Agent Sam Platform Services"),
        "title": q("Agent Sam Platform Services"),
        "file_name": q("agentsam_platform_services.html"),
        "source_file": q("agentsam_platform_services.html"),
        "source_path": q("cms/sections/homepage/agentsam_platform_services.html"),
        "file_path": q("cms/sections/homepage/agentsam_platform_services.html"),
        "r2_bucket": q(manifest["r2_bucket"]),
        "r2_key": q(manifest["r2_key"]),
        "r2_url": q(manifest.get("public_url_guess")),
        "source_url": q(manifest.get("public_url_guess")),
        "public_url": q(manifest.get("public_url_guess")),
        "status": q("completed"),
        "parse_status": q("registered"),
        "import_status": q("completed"),
        "source_type": q("r2"),
        "import_type": q("section"),
        "metadata_json": jq({
            "section_key": "agent_sam_platform_services",
            "replacement_for": "selected_work",
            "r2_bucket": manifest["r2_bucket"],
            "r2_key": manifest["r2_key"],
            "repo_path": "cms/sections/homepage/agentsam_platform_services.html",
            "sha256": manifest.get("sha256"),
            "bytes": manifest.get("bytes"),
        }),
        "created_at": "unixepoch()",
        "updated_at": "unixepoch()",
        "created_at_unix": "unixepoch()",
        "updated_at_unix": "unixepoch()",
    }

    for col in cols:
        if col in candidate_values:
            values[col] = candidate_values[col]

    for info in table_info("cms_liquid_imports"):
        col = info["name"]
        if col in values:
            continue

        notnull = int(info.get("notnull") or 0)
        default = info.get("dflt_value")

        if notnull and default is None:
            col_type = types.get(col, "")

            if "INT" in col_type:
                values[col] = "0"
            elif "REAL" in col_type or "NUM" in col_type:
                values[col] = "0"
            else:
                values[col] = q("agent_sam_platform_services")

    return values


def build_liquid_section_values(page, manifest, section_data, html_source):
    tenant_id = page.get("tenant_id") or "inneranimalmedia"

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
        ],
    }

    settings_map = {
        "source": "cms_page_sections.section_data",
        "section_data": section_data,
        "template_artifact": {
            "repo_path": "cms/sections/homepage/agentsam_platform_services.html",
            "r2_bucket": manifest["r2_bucket"],
            "r2_key": manifest["r2_key"],
            "public_url_guess": manifest.get("public_url_guess"),
            "sha256": manifest.get("sha256"),
            "bytes": manifest.get("bytes"),
        },
    }

    values = {
        "id": q(LIQUID_SECTION_ID),
        "import_id": q(LIQUID_IMPORT_ID),
        "tenant_id": q(tenant_id),
        "file_name": q("agentsam_platform_services.html"),
        "section_key": q("agent_sam_platform_services"),
        "section_type": q("agent_sam_platform_services"),
        "liquid_source": q(html_source),
        "schema_json": jq(schema_json),
        "settings_map_json": jq(settings_map),
        "render_deps": jq([
            {
                "type": "r2_html_artifact",
                "bucket": manifest["r2_bucket"],
                "key": manifest["r2_key"],
            }
        ]),
        "mapped_template_id": "NULL",
        "mapped_section_id": q(NEW_SECTION_ID),
        "parse_status": q("registered"),
        "parse_error": "NULL",
        "created_at": "unixepoch()",
    }

    return values


def build_page_updates(page, manifest):
    config = safe_json(page.get("config_json"))
    metadata = safe_json(page.get("metadata_json"))

    config["homepage_cms_sections"] = {
        "replacement_complete": True,
        "selected_work_replaced_by": "agent_sam_platform_services",
        "replacement_section_id": NEW_SECTION_ID,
        "liquid_section_id": LIQUID_SECTION_ID,
        "sort_order": 30,
    }

    artifacts = metadata.get("section_artifacts")
    if not isinstance(artifacts, list):
        artifacts = []

    new_artifact = {
        "section_key": "agent_sam_platform_services",
        "section_id": NEW_SECTION_ID,
        "liquid_section_id": LIQUID_SECTION_ID,
        "repo_path": "cms/sections/homepage/agentsam_platform_services.html",
        "r2_bucket": manifest["r2_bucket"],
        "r2_key": manifest["r2_key"],
        "public_url_guess": manifest.get("public_url_guess"),
        "sha256": manifest.get("sha256"),
        "bytes": manifest.get("bytes"),
        "created_at": int(time.time()),
    }

    artifacts = [
        item for item in artifacts
        if item.get("section_key") != "agent_sam_platform_services"
    ]
    artifacts.append(new_artifact)

    metadata["section_artifacts"] = artifacts
    metadata["shopify_liquid_concept"] = True

    return config, metadata


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest, section_data, html_source = read_required_files()

    page = get_one("SELECT * FROM cms_pages WHERE id = " + q(PAGE_ID) + " LIMIT 1;")
    if not page:
        raise SystemExit("Missing cms_pages row id=" + PAGE_ID)

    config, metadata = build_page_updates(page, manifest)

    section_data["template_artifact"] = {
        "repo_path": "cms/sections/homepage/agentsam_platform_services.html",
        "r2_bucket": manifest["r2_bucket"],
        "r2_key": manifest["r2_key"],
        "public_url_guess": manifest.get("public_url_guess"),
        "sha256": manifest.get("sha256"),
        "bytes": manifest.get("bytes"),
        "liquid_section_id": LIQUID_SECTION_ID,
    }

    import_values = build_import_values(page, manifest)
    liquid_values = build_liquid_section_values(page, manifest, section_data, html_source)

    sql = []
    sql.append("-- Seed Agent Sam Platform Services as Liquid/CMS replacement for Selected Work.")
    sql.append("-- Generated by scripts/cms_12_seed_home_agentsam_liquid.py")
    sql.append("")

    sql.append("-- Before")
    sql.append("SELECT id, page_id, section_type, section_name, sort_order, is_visible, liquid_section_id")
    sql.append("FROM cms_page_sections")
    sql.append("WHERE page_id = 'page_home'")
    sql.append("ORDER BY sort_order;")
    sql.append("")

    sql.append("-- Update homepage page metadata/config with section artifact trail.")
    sql.append("UPDATE cms_pages")
    sql.append("SET")
    sql.append("  config_json = " + jq(config) + ",")
    sql.append("  metadata_json = " + jq(metadata) + ",")
    sql.append("  updated_at = unixepoch()")
    sql.append("WHERE id = 'page_home';")
    sql.append("")

    sql.append("-- Liquid import ledger row.")
    sql.append(build_insert_or_replace("cms_liquid_imports", import_values))
    sql.append("")

    sql.append("-- Liquid section registry row.")
    sql.append(build_insert_or_replace("cms_liquid_sections", liquid_values))
    sql.append("")

    sql.append("-- Hide old selected work row.")
    sql.append("UPDATE cms_page_sections")
    sql.append("SET is_visible = 0, updated_at = datetime('now')")
    sql.append("WHERE id = 'sec_home_work' OR (page_id = 'page_home' AND sort_order = 30);")
    sql.append("")

    sql.append("-- Insert replacement homepage body section.")
    sql.append("INSERT OR REPLACE INTO cms_page_sections (")
    sql.append("  id, page_id, section_type, section_name, section_data, sort_order,")
    sql.append("  is_visible, css_classes, custom_css, created_at, updated_at, liquid_section_id, created_at_unix")
    sql.append(") VALUES (")
    sql.append("  'sec_home_agent_sam_platform_services',")
    sql.append("  'page_home',")
    sql.append("  'agent_sam_platform_services',")
    sql.append("  'Agent Sam Platform Services',")
    sql.append("  " + jq(section_data) + ",")
    sql.append("  30,")
    sql.append("  1,")
    sql.append("  'section section-agent-sam-platform-services',")
    sql.append("  NULL,")
    sql.append("  datetime('now'),")
    sql.append("  datetime('now'),")
    sql.append("  'lsec_agent_sam_platform_services',")
    sql.append("  unixepoch()")
    sql.append(");")
    sql.append("")

    sql.append("-- Keep liquid section mapped to the replacement row.")
    sql.append("UPDATE cms_liquid_sections")
    sql.append("SET mapped_section_id = 'sec_home_agent_sam_platform_services',")
    sql.append("    parse_status = 'registered'")
    sql.append("WHERE id = 'lsec_agent_sam_platform_services';")
    sql.append("")

    sql.append("-- After")
    sql.append("SELECT id, page_id, section_type, section_name, sort_order, is_visible, liquid_section_id")
    sql.append("FROM cms_page_sections")
    sql.append("WHERE page_id = 'page_home'")
    sql.append("ORDER BY sort_order;")
    sql.append("")

    sql.append("SELECT id, import_id, tenant_id, file_name, section_key, section_type, mapped_section_id, parse_status")
    sql.append("FROM cms_liquid_sections")
    sql.append("WHERE id = 'lsec_agent_sam_platform_services';")
    sql.append("")

    OUT_SQL.write_text("\n".join(sql) + "\n", encoding="utf-8")

    manifest_out = {
        "created_at": int(time.time()),
        "page_id": PAGE_ID,
        "old_section_id": OLD_SECTION_ID,
        "new_section_id": NEW_SECTION_ID,
        "liquid_import_id": LIQUID_IMPORT_ID,
        "liquid_section_id": LIQUID_SECTION_ID,
        "r2_bucket": manifest["r2_bucket"],
        "r2_key": manifest["r2_key"],
        "repo_path": "cms/sections/homepage/agentsam_platform_services.html",
        "sql_file": str(OUT_SQL),
    }

    OUT_MANIFEST.write_text(json.dumps(manifest_out, indent=2), encoding="utf-8")

    print("WROTE:", OUT_SQL)
    print("WROTE:", OUT_MANIFEST)

    run_sql_file(OUT_SQL)


if __name__ == "__main__":
    main()