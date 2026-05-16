#!/usr/bin/env python3

import json
import subprocess
from pathlib import Path

REPO = Path(".").resolve()
PULL = REPO / "artifacts" / "cms_d1_pull" / "cms_d1_pull_all.json"
STAGE = REPO / "artifacts" / "cms_homepage_section_audit" / "selected_work_replacement" / "stage"
OUT = STAGE / "d1_seed_agentsam_section.sql"

DB = "inneranimalmedia-business"
CONFIG = "wrangler.production.toml"

SECTION_KEY = "agent_sam_platform_services"
OLD_KEY = "selected_work"


def load_json(path):
    if not path.exists():
        raise SystemExit("missing: " + str(path))
    return json.loads(path.read_text(encoding="utf-8"))


def sql_string(value):
    return "'" + str(value).replace("'", "''") + "'"


def json_sql(value):
    return sql_string(json.dumps(value, separators=(",", ":"), ensure_ascii=False))


def table_columns(data, table_name):
    for table in data.get("tables", []):
        if table.get("name") == table_name:
            return [c.get("name") for c in table.get("columns", [])]
    return []


def d1(sql):
    cmd = [
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--command", sql,
    ]
    print("RUN:", " ".join(cmd))
    p = subprocess.run(cmd, cwd=str(REPO), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    print(p.stdout)
    if p.returncode != 0:
        print(p.stderr)
        raise SystemExit(p.returncode)


def main():
    data = load_json(PULL)
    section_data = load_json(STAGE / "section_data_seed.json")
    manifest = load_json(STAGE / "stage_manifest.json")

    section_data["template_artifact"]["r2_bucket"] = manifest["r2_bucket"]
    section_data["template_artifact"]["r2_key"] = manifest["r2_key"]
    section_data["template_artifact"]["public_url_guess"] = manifest["public_url_guess"]

    page_cols = table_columns(data, "cms_pages")
    section_cols = table_columns(data, "cms_page_sections")

    if not section_cols:
        raise SystemExit("cms_page_sections columns not found in pull")

    lines = []
    lines.append("-- Agent Sam homepage section seed")
    lines.append("-- Replaces selected_work at homepage sort_order 3.")
    lines.append("-- Review generated columns against real schema before run.")
    lines.append("")

    lines.append("-- Confirm homepage candidates")
    if "path" in page_cols or "route_path" in page_cols or "slug" in page_cols:
        where_parts = []
        if "path" in page_cols:
            where_parts.append("path = '/'")
        if "route_path" in page_cols:
            where_parts.append("route_path = '/'")
        if "slug" in page_cols:
            where_parts.append("slug = 'home'")
        lines.append("SELECT * FROM cms_pages WHERE " + " OR ".join(where_parts) + " LIMIT 10;")
    else:
        lines.append("SELECT * FROM cms_pages LIMIT 10;")
    lines.append("")

    lines.append("-- Confirm current slot 3 / selected work")
    checks = []
    if "section_key" in section_cols:
        checks.append("section_key = 'selected_work'")
    if "section_type" in section_cols:
        checks.append("section_type = 'selected_work'")
    if "section_name" in section_cols:
        checks.append("section_name LIKE '%Selected%'")
    if "sort_order" in section_cols:
        checks.append("sort_order = 3")
    if checks:
        lines.append("SELECT * FROM cms_page_sections WHERE " + " OR ".join(checks) + " LIMIT 20;")
    else:
        lines.append("SELECT * FROM cms_page_sections LIMIT 20;")
    lines.append("")

    set_pairs = []

    if "section_key" in section_cols:
        set_pairs.append("section_key = " + sql_string(SECTION_KEY))
    if "section_type" in section_cols:
        set_pairs.append("section_type = " + sql_string(SECTION_KEY))
    if "section_name" in section_cols:
        set_pairs.append("section_name = 'Agent Sam Platform Services'")
    if "title" in section_cols:
        set_pairs.append("title = 'Agent Sam Platform Services'")
    if "name" in section_cols:
        set_pairs.append("name = 'Agent Sam Platform Services'")
    if "is_visible" in section_cols:
        set_pairs.append("is_visible = 1")
    if "is_active" in section_cols:
        set_pairs.append("is_active = 1")
    if "status" in section_cols:
        set_pairs.append("status = 'published'")
    if "sort_order" in section_cols:
        set_pairs.append("sort_order = 3")
    if "order_index" in section_cols:
        set_pairs.append("order_index = 3")

    for json_col in ["section_data", "section_data_json", "settings_json", "config_json", "metadata_json"]:
        if json_col in section_cols:
            set_pairs.append(json_col + " = " + json_sql(section_data))
            break

    if "updated_at" in section_cols:
        set_pairs.append("updated_at = datetime('now')")
    if "updated_at_unix" in section_cols:
        set_pairs.append("updated_at_unix = unixepoch()")

    where = []
    if "section_key" in section_cols:
        where.append("section_key = 'selected_work'")
    if "section_type" in section_cols:
        where.append("section_type = 'selected_work'")
    if "sort_order" in section_cols:
        where.append("sort_order = 3")

    lines.append("-- Main update: convert existing slot/selected_work row into agent_sam_platform_services")
    lines.append("UPDATE cms_page_sections")
    lines.append("SET")
    lines.append("  " + ",\n  ".join(set_pairs))
    lines.append("WHERE " + " OR ".join(where) + ";")
    lines.append("")

    lines.append("-- Verify replacement")
    verify = []
    if "section_key" in section_cols:
        verify.append("section_key = 'agent_sam_platform_services'")
    if "section_type" in section_cols:
        verify.append("section_type = 'agent_sam_platform_services'")
    if "sort_order" in section_cols:
        verify.append("sort_order = 3")
    lines.append("SELECT * FROM cms_page_sections WHERE " + " OR ".join(verify) + " LIMIT 20;")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("WROTE:", OUT)
    print("")
    print("Run this after reviewing:")
    print("npx wrangler d1 execute " + DB + " --remote -c " + CONFIG + " --file " + str(OUT))


if __name__ == "__main__":
    main()