-- meauxbilityorg runtime CMS schema (client D1 — live pages only).
-- Does NOT create cms_liquid_imports (package registry stays on IAM platform D1).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute meauxbilityorg \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/client-runtime/meauxbilityorg_001_cms_runtime.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cms_pages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_nonprofit_organization',
  workspace_id TEXT NOT NULL DEFAULT 'ws_meauxbility',
  worker_id TEXT DEFAULT 'meauxbility',
  person_uuid TEXT,

  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  route_path TEXT NOT NULL,
  page_type TEXT NOT NULL DEFAULT 'custom' CHECK (page_type IN (
    'home','about','services','work','case_study','contact','pricing',
    'privacy','terms','faq','product','collection','blog','post',
    'landing','portal','dashboard','auth','sitemap','custom','error','search','cart','collection_list'
  )),

  title TEXT NOT NULL,
  meta_description TEXT,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','published','archived','scheduled')),

  seo_title TEXT,
  canonical_url TEXT,
  robots TEXT DEFAULT 'index,follow',

  r2_bucket TEXT DEFAULT 'meauxbilityv2',
  r2_key TEXT,
  content_type TEXT DEFAULT 'text/html',
  content_size_bytes INTEGER DEFAULT 0,

  config_json TEXT DEFAULT '{}',
  seo_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',

  is_homepage INTEGER DEFAULT 0,
  is_system_page INTEGER DEFAULT 0,
  requires_auth INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,

  created_by TEXT,
  updated_by TEXT,
  published_by TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER,
  archived_at INTEGER,

  UNIQUE(project_id, slug),
  UNIQUE(project_id, route_path)
);

CREATE TABLE IF NOT EXISTS cms_page_sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  section_type TEXT NOT NULL,
  section_name TEXT NOT NULL,
  section_data TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  css_classes TEXT,
  custom_css TEXT,
  liquid_section_id TEXT,
  created_at_unix INTEGER DEFAULT (unixepoch()),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_nonprofit_organization',
  workspace_id TEXT NOT NULL DEFAULT 'ws_meauxbility',
  project_slug TEXT NOT NULL DEFAULT 'meauxbility',
  file_name TEXT NOT NULL,
  r2_bucket TEXT NOT NULL DEFAULT 'meauxbilityv2',
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER DEFAULT 0,
  alt_text TEXT,
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_project ON cms_pages(project_slug, status);
CREATE INDEX IF NOT EXISTS idx_cms_pages_workspace ON cms_pages(workspace_id, project_slug);
CREATE INDEX IF NOT EXISTS idx_cms_page_sections_page ON cms_page_sections(page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_assets_project ON cms_assets(project_slug, workspace_id);

-- Idempotent site registry row (runtime metadata — not IAM control plane)
CREATE TABLE IF NOT EXISTS cms_site_registry (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  site_name TEXT NOT NULL,
  public_domain TEXT,
  r2_bucket TEXT,
  worker_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(workspace_id, project_slug)
);

INSERT OR IGNORE INTO cms_site_registry (
  id, workspace_id, project_slug, site_name, public_domain, r2_bucket, worker_name, metadata_json
)
VALUES (
  'site_meauxbility',
  'ws_meauxbility',
  'meauxbility',
  'Meauxbility Foundation',
  'meauxbility.org',
  'meauxbilityv2',
  'meauxbility',
  '{"cms_mode":"byo_runtime","package_registry":"platform","iam_workspace_id":"ws_meauxbility"}'
);
