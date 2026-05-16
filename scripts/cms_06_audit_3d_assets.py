#!/usr/bin/env python3

import json
import re
from pathlib import Path

REPO = Path(".").resolve()

D1_PULL = REPO / "artifacts" / "cms_d1_pull"
OUT = REPO / "artifacts" / "cms_ollama_gameplan" / "3d_assets_audit"

TABLES = [
    "cms_3d_assets",
    "cms_assets",
    "cms_collections",
    "cms_collection_assets",
    "cms_pages",
    "cms_page_sections",
    "cms_liquid_sections",
    "cms_component_templates",
]

KEYWORDS = [
    "chess",
    "board",
    "game",
    "games",
    "glb",
    "gltf",
    "3d",
    "model",
    "scene",
    "inneranimalmedia.com/games",
    "/games",
]


def read_json(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("WROTE:", path)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("WROTE:", path)


def stringify(value):
    try:
        return json.dumps(value, ensure_ascii=False).lower()
    except Exception:
        return str(value).lower()


def row_score(row):
    text = stringify(row)
    score = 0

    for keyword in KEYWORDS:
        if keyword.lower() in text:
            score += 1

    if ".glb" in text:
        score += 5

    if ".gltf" in text:
        score += 5

    if "chess" in text:
        score += 5

    if "board" in text:
        score += 2

    if "/games" in text:
        score += 3

    return score


def find_urls(value):
    text = stringify(value)

    urls = set()

    for match in re.finditer(r"https?://[^\"'\s<>]+", text):
        urls.add(match.group(0).rstrip(".,)"))

    for match in re.finditer(r"[^\"'\s<>]+(?:\.glb|\.gltf|\.hdr|\.usdz|\.png|\.jpg|\.jpeg|\.webp|\.svg|\.mp4)", text):
        urls.add(match.group(0).rstrip(".,)"))

    return sorted(urls)


def table_dir(table_name):
    return D1_PULL / "tables" / table_name


def load_table(table_name):
    base = table_dir(table_name)
    table_pull = read_json(base / "table_pull.json")

    if not table_pull:
        return {
            "name": table_name,
            "exists": False,
            "row_count": None,
            "columns": [],
            "indexes": [],
            "foreign_keys": [],
            "sample_rows": [],
            "create_sql": None,
        }

    return {
        "name": table_name,
        "exists": True,
        "row_count": table_pull.get("row_count"),
        "columns": table_pull.get("columns") or [],
        "indexes": table_pull.get("indexes") or [],
        "foreign_keys": table_pull.get("foreign_keys") or [],
        "sample_rows": table_pull.get("sample_rows") or [],
        "create_sql": table_pull.get("create_sql") or table_pull.get("sql"),
    }


def column_names(table):
    names = []
    for col in table.get("columns", []):
        if isinstance(col, dict):
            names.append(str(col.get("name")))
    return names


def guess_asset_fields(table):
    names = set(column_names(table))

    fields = {
        "id": None,
        "title": None,
        "name": None,
        "slug": None,
        "url": None,
        "r2_key": None,
        "mime_type": None,
        "asset_type": None,
        "metadata": None,
        "tenant_id": None,
        "workspace_id": None,
    }

    for candidate in ["id", "asset_id"]:
        if candidate in names:
            fields["id"] = candidate
            break

    for candidate in ["title", "display_name", "label"]:
        if candidate in names:
            fields["title"] = candidate
            break

    for candidate in ["name", "filename", "file_name"]:
        if candidate in names:
            fields["name"] = candidate
            break

    for candidate in ["slug", "key"]:
        if candidate in names:
            fields["slug"] = candidate
            break

    for candidate in ["url", "public_url", "asset_url", "src", "href"]:
        if candidate in names:
            fields["url"] = candidate
            break

    for candidate in ["r2_key", "object_key", "storage_key", "path", "file_path"]:
        if candidate in names:
            fields["r2_key"] = candidate
            break

    for candidate in ["mime_type", "content_type", "type"]:
        if candidate in names:
            fields["mime_type"] = candidate
            break

    for candidate in ["asset_type", "kind", "type", "category"]:
        if candidate in names:
            fields["asset_type"] = candidate
            break

    for candidate in ["metadata_json", "metadata", "settings_json", "config_json"]:
        if candidate in names:
            fields["metadata"] = candidate
            break

    if "tenant_id" in names:
        fields["tenant_id"] = "tenant_id"

    if "workspace_id" in names:
        fields["workspace_id"] = "workspace_id"

    return fields


def markdown_table_schema(table):
    lines = []
    lines.append("## `" + table["name"] + "`")
    lines.append("")
    lines.append("Exists: `" + str(table["exists"]) + "`")
    lines.append("Rows from pull: `" + str(table["row_count"]) + "`")
    lines.append("")
    lines.append("### Columns")
    lines.append("")

    for col in table.get("columns", []):
        if not isinstance(col, dict):
            continue
        name = str(col.get("name"))
        typ = str(col.get("type"))
        notnull = str(col.get("notnull"))
        default = str(col.get("dflt_value"))
        pk = str(col.get("pk"))
        lines.append("- `" + name + "` type=`" + typ + "` notnull=`" + notnull + "` default=`" + default + "` pk=`" + pk + "`")

    lines.append("")
    lines.append("### Guessed Asset Fields")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(guess_asset_fields(table), indent=2, ensure_ascii=False))
    lines.append("```")
    lines.append("")

    lines.append("### Create SQL")
    lines.append("")
    lines.append("```sql")
    lines.append(str(table.get("create_sql") or ""))
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def markdown_candidate_rows(candidates):
    lines = []
    lines.append("# 3D / Chess Asset Candidates")
    lines.append("")

    if not candidates:
        lines.append("No chess/glb/game candidates were found in the pulled sample rows.")
        lines.append("")
        lines.append("That may only mean the prior D1 pull sampled too few rows. Next step is a direct filtered D1 query against `cms_3d_assets` and `cms_assets`.")
        return "\n".join(lines)

    for item in candidates:
        lines.append("## `" + item["table"] + "` score `" + str(item["score"]) + "`")
        lines.append("")
        lines.append("URLs / asset refs:")
        lines.append("")
        for url in item["urls"]:
            lines.append("- `" + url + "`")
        lines.append("")
        lines.append("Row:")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(item["row"], indent=2, ensure_ascii=False))
        lines.append("```")
        lines.append("")

    return "\n".join(lines)


def build_gameplan(tables, candidates):
    lines = []

    lines.append("# Chess / GLB Game Asset Rebuild Plan")
    lines.append("")
    lines.append("Goal: replace the current weak chess/game implementation with the real GLB chess set/board stored in CMS assets and drive traffic toward `https://inneranimalmedia.com/games`.")
    lines.append("")

    lines.append("## Intended UX")
    lines.append("")
    lines.append("- No forced auto-scroll.")
    lines.append("- The chess board should feel like an intentional interactive object, not a background gimmick.")
    lines.append("- Desktop: interactive 3D preview with orbit/drag controls, subtle idle animation, and clear call-to-action to `/games`.")
    lines.append("- Mobile: lightweight preview image or simplified GLB load with tap-to-activate controls.")
    lines.append("- Accessibility: visible non-3D fallback, reduced-motion mode, keyboard-safe CTA.")
    lines.append("")

    lines.append("## CMS Tables To Use")
    lines.append("")
    lines.append("- `cms_3d_assets`: canonical place for GLB/GLTF/HDR/scene-level asset records.")
    lines.append("- `cms_assets`: canonical media registry for thumbnails, preview images, fallback images, videos, and raw GLB URLs if `cms_3d_assets` is incomplete.")
    lines.append("- `cms_collections` and `cms_collection_assets`: group the chess board, pieces, environment map, preview poster, and fallback media into one reusable `games_chess_set` collection.")
    lines.append("- `cms_pages`: define `/games` and any homepage teaser route.")
    lines.append("- `cms_page_sections`: place the interactive chess teaser section on the homepage or selected public route.")
    lines.append("- `cms_liquid_sections` or `cms_component_templates`: store the render contract for the 3D chess teaser section.")
    lines.append("- `cms_themes`: drive colors, glass panels, buttons, loading state, and dark-mode scene shell.")
    lines.append("")

    lines.append("## Recommended CMS Records")
    lines.append("")
    lines.append("### Collection")
    lines.append("")
    lines.append("- collection key: `games_chess_set`")
    lines.append("- title: `Interactive Chess Set`")
    lines.append("- purpose: reusable asset group for `/games` and homepage teaser")
    lines.append("")
    lines.append("### 3D Assets")
    lines.append("")
    lines.append("- `chess_board_glb`")
    lines.append("- `chess_pieces_glb` or combined `chess_set_glb`")
    lines.append("- `chess_environment_hdr` if available")
    lines.append("- `chess_poster_image` fallback/poster")
    lines.append("")
    lines.append("### Section Template")
    lines.append("")
    lines.append("- section key: `interactive_chess_teaser`")
    lines.append("- section type: `threejs_glb_showcase`")
    lines.append("- CTA href: `/games`")
    lines.append("- autoplay: `false`")
    lines.append("- auto_scroll: `false`")
    lines.append("- interaction: `orbit_on_drag`")
    lines.append("- reduced_motion_fallback: `poster_image`")
    lines.append("")

    lines.append("## Runtime Behavior")
    lines.append("")
    lines.append("1. Route loads page from `cms_pages`.")
    lines.append("2. Page loads ordered sections from `cms_page_sections`.")
    lines.append("3. Chess section resolves template from `cms_component_templates` or `cms_liquid_sections`.")
    lines.append("4. Section settings reference `games_chess_set` collection.")
    lines.append("5. Collection resolves GLB/poster/assets from `cms_3d_assets` and/or `cms_assets`.")
    lines.append("6. Frontend renders a lazy-loaded 3D component only when section enters viewport or user taps activate.")
    lines.append("7. CTA routes users to `/games`.")
    lines.append("")

    lines.append("## What To Fix In Current Version")
    lines.append("")
    lines.append("- Remove auto-scroll behavior.")
    lines.append("- Stop hardcoding GLB URLs in components if CMS already stores them.")
    lines.append("- Add a clear data contract: `model_url`, `poster_url`, `environment_url`, `cta_href`, `cta_label`, `interaction_mode`, `fallback_mode`.")
    lines.append("- Add a no-WebGL fallback.")
    lines.append("- Avoid loading the GLB above the fold unless it is truly needed.")
    lines.append("")

    lines.append("## Direct D1 Follow-up Needed")
    lines.append("")
    lines.append("The current audit used the existing pulled JSON. If sample rows do not include the chess assets, run direct D1 filtered pulls:")
    lines.append("")
    lines.append("```sql")
    lines.append("SELECT * FROM cms_3d_assets")
    lines.append("WHERE lower(json_object()) LIKE '%chess%'")
    lines.append("   OR lower(json_object()) LIKE '%.glb%'")
    lines.append("LIMIT 50;")
    lines.append("```")
    lines.append("")
    lines.append("SQLite cannot always stringify full rows cleanly without knowing columns, so the better next script should inspect column names first, then build safe filtered queries across text-like columns.")
    lines.append("")

    lines.append("## OpenAI Remaster Prompt Add-On")
    lines.append("")
    lines.append("Ask OpenAI to produce:")
    lines.append("")
    lines.append("- exact D1 queries to resolve the chess GLB assets")
    lines.append("- data contract for the `interactive_chess_teaser` section")
    lines.append("- React/Three.js component interface")
    lines.append("- no-auto-scroll UX rules")
    lines.append("- `/games` routing and CTA plan")
    lines.append("- validation checklist proving the GLB loads from CMS, not hardcoded local files")
    lines.append("")

    return "\n".join(lines)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    tables = []
    for name in TABLES:
        table = load_table(name)
        tables.append(table)

    candidates = []

    for table in tables:
        for row in table.get("sample_rows", []):
            score = row_score(row)
            if score <= 0:
                continue

            candidates.append(
                {
                    "table": table["name"],
                    "score": score,
                    "urls": find_urls(row),
                    "row": row,
                }
            )

    candidates = sorted(candidates, key=lambda item: item["score"], reverse=True)

    schema_md_parts = ["# CMS 3D / Asset Schema Audit", ""]

    for table in tables:
        schema_md_parts.append(markdown_table_schema(table))

    write_text(OUT / "01_3D_ASSET_SCHEMA_AUDIT.md", "\n\n".join(schema_md_parts))
    write_text(OUT / "02_3D_ASSET_CANDIDATES.md", markdown_candidate_rows(candidates))
    write_text(OUT / "03_CHESS_GLB_REBUILD_PLAN.md", build_gameplan(tables, candidates))

    payload = {
        "tables": tables,
        "candidates": candidates,
    }

    write_json(OUT / "3d_asset_audit.json", payload)

    index = "# 3D Asset Audit Index\n\n"
    index += "- `01_3D_ASSET_SCHEMA_AUDIT.md`\n"
    index += "- `02_3D_ASSET_CANDIDATES.md`\n"
    index += "- `03_CHESS_GLB_REBUILD_PLAN.md`\n"
    index += "- `3d_asset_audit.json`\n"

    write_text(OUT / "INDEX.md", index)

    print("DONE")
    print("OPEN:", OUT)


if __name__ == "__main__":
    main()