#!/usr/bin/env python3

import subprocess
from pathlib import Path

REPO = Path(".").resolve()
DB = "inneranimalmedia-business"
CONFIG = "wrangler.production.toml"

OUT = REPO / "artifacts" / "cms_homepage_section_audit" / "selected_work_replacement" / "stage" / "final_fk_fix"
OUT.mkdir(parents=True, exist_ok=True)

SQL = OUT / "final_fix_cms_liquid_sections_fk.sql"


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


def main():
    sql = r"""
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS cms_liquid_sections_rebuild_backup;

ALTER TABLE cms_liquid_sections RENAME TO cms_liquid_sections_rebuild_backup;

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

INSERT OR IGNORE INTO cms_liquid_sections (
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
)
SELECT
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
  CASE
    WHEN mapped_template_id IS NULL THEN NULL
    WHEN mapped_template_id IN (SELECT id FROM cms_component_templates) THEN mapped_template_id
    ELSE NULL
  END AS mapped_template_id,
  CASE
    WHEN id = 'lsec_agent_sam_platform_services' THEN 'sec_home_agent_sam_platform_services'
    WHEN mapped_section_id IS NULL THEN NULL
    WHEN mapped_section_id IN (SELECT id FROM cms_page_sections) THEN mapped_section_id
    ELSE NULL
  END AS mapped_section_id,
  CASE
    WHEN parse_status IN ('pending','parsed','mapped','registered','failed') THEN parse_status
    ELSE 'pending'
  END AS parse_status,
  parse_error,
  created_at
FROM cms_liquid_sections_rebuild_backup
WHERE import_id IN (SELECT id FROM cms_liquid_imports);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_sections_import_id
  ON cms_liquid_sections(import_id);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_sections_key
  ON cms_liquid_sections(tenant_id, section_key);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_sections_mapped_section
  ON cms_liquid_sections(mapped_section_id);

UPDATE cms_liquid_sections
SET mapped_section_id = 'sec_home_agent_sam_platform_services',
    parse_status = 'registered'
WHERE id = 'lsec_agent_sam_platform_services';

UPDATE cms_page_sections
SET liquid_section_id = 'lsec_agent_sam_platform_services',
    updated_at = datetime('now')
WHERE id = 'sec_home_agent_sam_platform_services';

DROP TABLE IF EXISTS cms_liquid_sections_rebuild_backup;
DROP TABLE IF EXISTS cms_page_sections_old_fkfix;
DROP TABLE IF EXISTS cms_liquid_sections_old_fkfix;
DROP TABLE IF EXISTS cms_liquid_imports_old;

PRAGMA foreign_keys = ON;

PRAGMA foreign_key_list(cms_liquid_sections);
PRAGMA foreign_key_check;

SELECT id, page_id, section_type, section_name, sort_order, is_visible, liquid_section_id
FROM cms_page_sections
WHERE page_id = 'page_home'
ORDER BY sort_order;

SELECT id, import_id, section_key, mapped_section_id, parse_status
FROM cms_liquid_sections
WHERE id = 'lsec_agent_sam_platform_services';

SELECT id, status, source_type, r2_bucket, r2_key
FROM cms_liquid_imports
WHERE id = 'limp_agent_sam_platform_services';

SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND (
    name LIKE '%_old'
    OR name LIKE '%_old_%'
    OR name LIKE '%fkfix%'
    OR name LIKE '%rebuild_backup%'
  );
"""
    SQL.write_text(sql, encoding="utf-8")
    print("WROTE:", SQL)

    run([
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--file", str(SQL),
    ])


if __name__ == "__main__":
    main()