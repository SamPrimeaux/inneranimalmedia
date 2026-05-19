#!/usr/bin/env python3
"""
audit_cms_motion_schema.py

Non-mutating audit for CMS table structure before inserting IAM Motion System v1.

Finds:
- every cms_* table/view
- exact CREATE SQL
- PRAGMA table_info
- PRAGMA index_list + index_info
- triggers touching cms_* tables
- row counts
- sample rows
- likely target tables for:
  - motion assets
  - component templates
  - sections
  - pages
  - themes/settings
  - global settings
  - 3D/game assets

Outputs:
  artifacts/cms_motion_system_schema_audit/
    cms_schema_payload.json
    00_CMS_TABLE_MAP.md
    01_INSERTION_TARGETS.md
    02_TABLE_COLUMNS.md
"""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


DEFAULT_DB = "inneranimalmedia-business"
DEFAULT_CONFIG = "wrangler.production.toml"
DEFAULT_OUT = "artifacts/cms_motion_system_schema_audit"


LIKELY_TARGETS = {
    "motion_assets": [
        "cms_assets",
        "cms_3d_assets",
        "cms_global_assets",
        "cms_asset_registry",
    ],
    "component_templates": [
        "cms_component_templates",
        "cms_components",
        "cms_section_templates",
        "cms_templates",
    ],
    "sections": [
        "cms_sections",
        "cms_page_sections",
        "cms_site_sections",
        "cms_collection_sections",
    ],
    "pages": [
        "cms_pages",
        "cms_site_pages",
        "cms_routes",
    ],
    "themes_settings": [
        "cms_themes",
        "cms_theme_tokens",
        "cms_global_settings",
        "cms_site_settings",
    ],
    "render_pipeline": [
        "cms_layouts",
        "cms_page_layouts",
        "cms_render_cache",
        "cms_artifacts",
        "cms_published_artifacts",
    ],
}


def run(cmd: list[str], timeout: int = 120) -> dict[str, Any]:
    try:
        p = subprocess.run(
            cmd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
        return {
            "ok": p.returncode == 0,
            "returncode": p.returncode,
            "cmd": " ".join(shlex.quote(x) for x in cmd),
            "stdout": p.stdout,
            "stderr": p.stderr,
        }
    except Exception as e:
        return {
            "ok": False,
            "returncode": 999,
            "cmd": " ".join(shlex.quote(x) for x in cmd),
            "stdout": "",
            "stderr": f"{type(e).__name__}: {e}",
        }


def d1_cmd(db: str, config: str, sql: str, json_mode: bool = True) -> list[str]:
    cmd = ["npx", "wrangler", "d1", "execute", db, "--remote", "-c", config]
    if json_mode:
        cmd.append("--json")
    cmd += ["--command", sql]
    return cmd


def normalize_rows(parsed: Any) -> list[dict[str, Any]]:
    if isinstance(parsed, list):
        if parsed and isinstance(parsed[0], dict) and isinstance(parsed[0].get("results"), list):
            return parsed[0]["results"]
        if all(isinstance(x, dict) for x in parsed):
            return parsed

    if isinstance(parsed, dict):
        if isinstance(parsed.get("results"), list):
            return parsed["results"]
        r = parsed.get("result")
        if isinstance(r, list):
            if r and isinstance(r[0], dict) and isinstance(r[0].get("results"), list):
                return r[0]["results"]
            if all(isinstance(x, dict) for x in r):
                return r

    return []


def d1_rows(db: str, config: str, sql: str, timeout: int = 120) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    res = run(d1_cmd(db, config, sql, True), timeout=timeout)
    if res["ok"]:
        try:
            return normalize_rows(json.loads(res["stdout"])), res
        except Exception:
            pass

    fallback = run(d1_cmd(db, config, sql, False), timeout=timeout)
    return [], fallback


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def sql_lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sample_limit_for_table(table: str) -> int:
    if table in {"cms_assets", "cms_3d_assets", "cms_component_templates", "cms_pages", "cms_sections"}:
        return 12
    return 5


def md_table(headers: list[str], rows: list[list[Any]]) -> str:
    out = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        clean = []
        for x in row:
            s = "" if x is None else str(x)
            s = s.replace("\n", " ").replace("|", "\\|")
            if len(s) > 180:
                s = s[:177] + "..."
            clean.append(s)
        out.append("| " + " | ".join(clean) + " |")
    return "\n".join(out)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def get_all_cms_objects(db: str, config: str) -> list[dict[str, Any]]:
    sql = """
    SELECT name, type, sql
    FROM sqlite_master
    WHERE name LIKE 'cms_%'
      AND type IN ('table','view')
    ORDER BY type, name;
    """
    rows, _ = d1_rows(db, config, sql)
    return rows


def get_triggers(db: str, config: str) -> list[dict[str, Any]]:
    sql = """
    SELECT name, tbl_name, sql
    FROM sqlite_master
    WHERE type = 'trigger'
      AND (tbl_name LIKE 'cms_%' OR sql LIKE '%cms_%')
    ORDER BY tbl_name, name;
    """
    rows, _ = d1_rows(db, config, sql)
    return rows


def audit_table(db: str, config: str, table: str) -> dict[str, Any]:
    q = quote_ident(table)

    columns, _ = d1_rows(db, config, f"PRAGMA table_info({q});")
    indexes, _ = d1_rows(db, config, f"PRAGMA index_list({q});")
    foreign_keys, _ = d1_rows(db, config, f"PRAGMA foreign_key_list({q});")

    index_details = {}
    for idx in indexes:
        name = idx.get("name")
        if name:
            rows, _ = d1_rows(db, config, f"PRAGMA index_info({quote_ident(str(name))});")
            index_details[str(name)] = rows

    count = None
    count_rows, count_cmd = d1_rows(db, config, f"SELECT COUNT(*) AS total FROM {q};")
    if count_rows and "total" in count_rows[0]:
        count = count_rows[0]["total"]

    sample_rows = []
    if count and count > 0:
        sample_rows, _ = d1_rows(db, config, f"SELECT * FROM {q} LIMIT {sample_limit_for_table(table)};")

    return {
        "name": table,
        "columns": columns,
        "indexes": indexes,
        "index_details": index_details,
        "foreign_keys": foreign_keys,
        "row_count": count,
        "sample_rows": sample_rows,
        "count_command": count_cmd,
    }


def classify_targets(tables: list[str]) -> dict[str, list[str]]:
    found = {}
    table_set = set(tables)
    for group, names in LIKELY_TARGETS.items():
        found[group] = [n for n in names if n in table_set]

    # Also add fuzzy matches.
    for t in tables:
        low = t.lower()
        if "asset" in low and t not in found["motion_assets"]:
            found["motion_assets"].append(t)
        if "template" in low and t not in found["component_templates"]:
            found["component_templates"].append(t)
        if "section" in low and t not in found["sections"]:
            found["sections"].append(t)
        if "page" in low and t not in found["pages"]:
            found["pages"].append(t)
        if "theme" in low or "setting" in low:
            if t not in found["themes_settings"]:
                found["themes_settings"].append(t)
    return found


def table_has_columns(audit: dict[str, Any], table: str, cols: list[str]) -> bool:
    got = {c.get("name") for c in audit["tables"].get(table, {}).get("columns", [])}
    return all(c in got for c in cols)


def recommend_insertions(payload: dict[str, Any]) -> list[dict[str, Any]]:
    recs = []
    tables = payload["tables"]

    if "cms_assets" in tables:
        cols = {c.get("name") for c in tables["cms_assets"]["columns"]}
        recs.append({
            "target": "cms_assets",
            "use_for": "Register R2 CSS/JS/HTML/JSON motion artifacts as CMS assets.",
            "confidence": "high" if {"r2_key", "public_url"}.issubset(cols) else "medium",
            "columns_present": sorted(cols),
        })

    if "cms_component_templates" in tables:
        recs.append({
            "target": "cms_component_templates",
            "use_for": "Store reusable motion-enabled section/component templates: fade-up card, stagger grid, skeleton loader, hover card.",
            "confidence": "high",
            "columns_present": [c.get("name") for c in tables["cms_component_templates"]["columns"]],
        })

    for candidate in ["cms_sections", "cms_page_sections", "cms_site_sections"]:
        if candidate in tables:
            recs.append({
                "target": candidate,
                "use_for": "Attach motion-enabled components to pages/sections.",
                "confidence": "high",
                "columns_present": [c.get("name") for c in tables[candidate]["columns"]],
            })

    if "cms_global_settings" in tables:
        recs.append({
            "target": "cms_global_settings",
            "use_for": "Store default motion system slug and R2 paths for global renderer defaults.",
            "confidence": "medium",
            "columns_present": [c.get("name") for c in tables["cms_global_settings"]["columns"]],
        })

    if "cms_themes" in tables:
        recs.append({
            "target": "cms_themes",
            "use_for": "Optionally attach motion tokens to theme metadata/design tokens.",
            "confidence": "medium",
            "columns_present": [c.get("name") for c in tables["cms_themes"]["columns"]],
        })

    return recs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    print("Pulling cms_* object list...")
    objects = get_all_cms_objects(args.db, args.config)
    triggers = get_triggers(args.db, args.config)

    names = [r["name"] for r in objects if r.get("name")]
    print(f"cms objects: {len(names)}")

    table_payload = {}
    for i, name in enumerate(names, 1):
        obj_type = next((r.get("type") for r in objects if r.get("name") == name), "")
        print(f"{i}/{len(names)} {name} ({obj_type})")
        table_payload[name] = audit_table(args.db, args.config, name)

    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "db": args.db,
        "config": args.config,
        "objects": objects,
        "triggers": triggers,
        "tables": table_payload,
        "target_groups": classify_targets(names),
    }
    payload["recommendations"] = recommend_insertions(payload)

    write(out / "cms_schema_payload.json", json.dumps(payload, indent=2))

    object_rows = []
    for obj in objects:
        name = obj.get("name")
        info = table_payload.get(name, {})
        object_rows.append([
            obj.get("type"),
            name,
            info.get("row_count"),
            len(info.get("columns", [])),
            "yes" if obj.get("sql") else "no",
        ])

    write(
        out / "00_CMS_TABLE_MAP.md",
        "# CMS Table Map\n\n"
        f"Generated: `{payload['generated_at']}`\n\n"
        f"Database: `{args.db}`\n\n"
        + md_table(["Type", "Name", "Rows", "Columns", "Has CREATE SQL"], object_rows)
        + "\n\n## Target groups\n\n"
        + json.dumps(payload["target_groups"], indent=2)
    )

    rec_rows = []
    for rec in payload["recommendations"]:
        rec_rows.append([rec["target"], rec["confidence"], rec["use_for"]])

    write(
        out / "01_INSERTION_TARGETS.md",
        "# CMS Motion System Insertion Targets\n\n"
        + md_table(["Table", "Confidence", "Use"], rec_rows)
        + "\n\n## Recommended first pass\n\n"
        + "- Register R2 artifact files in `cms_assets` if its columns support `r2_key` / `public_url`.\n"
        + "- Register reusable motion component templates in `cms_component_templates`.\n"
        + "- Store global default motion slug in `cms_global_settings` or theme metadata after confirming exact JSON shape.\n"
        + "- Do not mutate pages/sections until we inspect page/section relationship columns.\n"
    )

    parts = ["# CMS Table Columns\n"]
    for name in names:
        info = table_payload[name]
        parts.append(f"\n## `{name}`\n")
        parts.append(f"Rows: `{info.get('row_count')}`\n")
        col_rows = []
        for c in info.get("columns", []):
            col_rows.append([
                c.get("cid"),
                c.get("name"),
                c.get("type"),
                c.get("notnull"),
                c.get("dflt_value"),
                c.get("pk"),
            ])
        parts.append(md_table(["cid", "name", "type", "notnull", "default", "pk"], col_rows))
        parts.append("\n\n### CREATE SQL\n\n```sql\n")
        sql = next((o.get("sql") for o in objects if o.get("name") == name), "") or ""
        parts.append(sql)
        parts.append("\n```\n")

        samples = info.get("sample_rows") or []
        if samples:
            parts.append("\n### Sample rows\n\n```json\n")
            parts.append(json.dumps(samples[:3], indent=2))
            parts.append("\n```\n")

    if triggers:
        parts.append("\n# CMS Triggers\n")
        for t in triggers:
            parts.append(f"\n## `{t.get('name')}` on `{t.get('tbl_name')}`\n\n```sql\n{t.get('sql') or ''}\n```\n")

    write(out / "02_TABLE_COLUMNS.md", "\n".join(parts))

    print("")
    print("DONE")
    print("open", out)
    print("main:", out / "01_INSERTION_TARGETS.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())