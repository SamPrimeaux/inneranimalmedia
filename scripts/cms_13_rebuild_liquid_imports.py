#!/usr/bin/env python3

import subprocess
from pathlib import Path

REPO = Path(".").resolve()
DB = "inneranimalmedia-business"
CONFIG = "wrangler.production.toml"

OUT = REPO / "artifacts" / "cms_homepage_section_audit" / "selected_work_replacement" / "stage" / "rebuild_liquid_imports"
OUT.mkdir(parents=True, exist_ok=True)

SQL_FILE = OUT / "rebuild_cms_liquid_imports.sql"


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
-- Rebuild cms_liquid_imports correctly while it is still empty/near-empty.
-- Purpose:
--   cms_liquid_imports = import/run ledger
--   cms_liquid_sections = registered parsed/mapped sections from that import
--
-- This table should track source artifacts, R2 pointers, import status,
-- mapping counts, workflow/audit metadata, and timestamps.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS cms_liquid_imports_old;
ALTER TABLE cms_liquid_imports RENAME TO cms_liquid_imports_old;

CREATE TABLE cms_liquid_imports (
  id TEXT PRIMARY KEY DEFAULT ('liq_' || lower(hex(randomblob(8)))),

  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  project_id TEXT,
  worker_id TEXT,

  import_key TEXT,
  import_name TEXT,
  theme_name TEXT,

  source_type TEXT NOT NULL CHECK(source_type IN (
    'local_file',
    'repo_file',
    'r2_object',
    'r2_html_section',
    'shopify_theme',
    'shopify_section',
    'html_snapshot',
    'manual_seed',
    'generated'
  )),

  source_path TEXT NOT NULL,
  source_url TEXT,

  r2_bucket TEXT,
  r2_key TEXT,
  r2_url TEXT,

  file_name TEXT,
  content_type TEXT DEFAULT 'text/html',
  content_size_bytes INTEGER DEFAULT 0,
  content_sha256 TEXT,

  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending',
    'extracting',
    'parsing',
    'mapping',
    'registering',
    'validating',
    'complete',
    'failed',
    'archived'
  )),

  sections_found INTEGER NOT NULL DEFAULT 0,
  snippets_found INTEGER NOT NULL DEFAULT 0,
  templates_found INTEGER NOT NULL DEFAULT 0,
  sections_mapped INTEGER NOT NULL DEFAULT 0,
  pages_created INTEGER NOT NULL DEFAULT 0,
  assets_registered INTEGER NOT NULL DEFAULT 0,

  metadata_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  error_log TEXT,

  workflow_run_id TEXT,
  created_by TEXT,
  updated_by TEXT,

  started_at INTEGER DEFAULT (unixepoch()),
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE(tenant_id, source_type, source_path)
);

-- Copy any old rows if they existed.
INSERT OR IGNORE INTO cms_liquid_imports (
  id,
  tenant_id,
  workspace_id,
  source_type,
  source_path,
  theme_name,
  status,
  sections_found,
  snippets_found,
  templates_found,
  sections_mapped,
  pages_created,
  error_log,
  workflow_run_id,
  started_at,
  completed_at,
  created_at,
  updated_at
)
SELECT
  id,
  tenant_id,
  workspace_id,
  CASE
    WHEN source_type IN (
      'local_file',
      'repo_file',
      'r2_object',
      'r2_html_section',
      'shopify_theme',
      'shopify_section',
      'html_snapshot',
      'manual_seed',
      'generated'
    ) THEN source_type
    ELSE 'manual_seed'
  END AS source_type,
  source_path,
  theme_name,
  CASE
    WHEN status = 'completed' THEN 'complete'
    WHEN status IN (
      'pending',
      'extracting',
      'parsing',
      'mapping',
      'registering',
      'validating',
      'complete',
      'failed',
      'archived'
    ) THEN status
    ELSE 'pending'
  END AS status,
  COALESCE(sections_found, 0),
  COALESCE(snippets_found, 0),
  COALESCE(templates_found, 0),
  COALESCE(sections_mapped, 0),
  COALESCE(pages_created, 0),
  error_log,
  workflow_run_id,
  started_at,
  completed_at,
  created_at,
  unixepoch()
FROM cms_liquid_imports_old;

CREATE INDEX IF NOT EXISTS idx_cms_liquid_imports_tenant_status
  ON cms_liquid_imports(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_imports_tenant_source
  ON cms_liquid_imports(tenant_id, source_type, source_path);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_imports_workspace
  ON cms_liquid_imports(workspace_id);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_imports_project
  ON cms_liquid_imports(project_id);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_imports_r2
  ON cms_liquid_imports(r2_bucket, r2_key);

CREATE INDEX IF NOT EXISTS idx_cms_liquid_imports_created
  ON cms_liquid_imports(created_at);

PRAGMA foreign_keys = ON;

PRAGMA table_info(cms_liquid_imports);
SELECT COUNT(*) AS cms_liquid_imports_rows FROM cms_liquid_imports;
"""
    SQL_FILE.write_text(sql, encoding="utf-8")
    print("WROTE:", SQL_FILE)

    run([
        "npx", "wrangler", "d1", "execute", DB,
        "--remote",
        "-c", CONFIG,
        "--file", str(SQL_FILE),
    ])


if __name__ == "__main__":
    main()