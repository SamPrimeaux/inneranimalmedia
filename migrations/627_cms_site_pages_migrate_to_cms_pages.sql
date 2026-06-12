-- Migration 627: cms_site_pages → cms_pages (legacy flat registry → canonical CMS pages)
-- Idempotent inserts for site-only rows; non-destructive R2/metadata enrich on overlaps;
-- repoint cms_live_edit_sessions FK; drop cms_site_pages.

-- ── 1) Insert site_pages rows missing from cms_pages (match project_slug + path) ──
INSERT INTO cms_pages (
  id,
  project_id,
  project_slug,
  tenant_id,
  workspace_id,
  worker_id,
  person_uuid,
  slug,
  path,
  route_path,
  page_type,
  title,
  meta_description,
  description,
  status,
  seo_title,
  canonical_url,
  robots,
  r2_bucket,
  r2_key,
  r2_url,
  content_type,
  content_size_bytes,
  config_json,
  seo_json,
  analytics_json,
  metadata_json,
  is_homepage,
  is_system_page,
  requires_auth,
  is_active,
  sort_order,
  created_at,
  updated_at,
  published_at
)
SELECT
  'sp_' || sp.id,
  COALESCE(CAST(sp.project_id AS TEXT), sp.project_slug),
  sp.project_slug,
  COALESCE(
    sp.tenant_id,
    ct.tenant_ref_id,
    CASE
      WHEN ct.id IS NOT NULL AND ct.id LIKE 'tenant_%' THEN ct.id
      WHEN ct.id IS NOT NULL THEN 'tenant_' || ct.id
      ELSE NULL
    END,
    'tenant_' || replace(replace(sp.project_slug, '-', '_'), ' ', '_')
  ),
  sp.workspace_id,
  sp.worker_id,
  sp.person_uuid,
  CASE
    WHEN sp.path IS NULL OR trim(sp.path) = '' OR sp.path = '/' THEN 'home'
    ELSE replace(trim(trim(sp.path, '/')), '/', '-')
  END,
  sp.path,
  sp.path,
  CASE
    WHEN COALESCE(sp.page_type, 'page') = 'page' THEN 'custom'
    WHEN COALESCE(sp.page_type, 'page') IN (
      'home','about','services','work','case_study','contact','pricing',
      'privacy','terms','faq','product','collection','blog','post',
      'landing','portal','dashboard','auth','sitemap','custom'
    ) THEN sp.page_type
    ELSE 'custom'
  END,
  sp.title,
  sp.description,
  sp.description,
  CASE
    WHEN COALESCE(sp.status, '') = 'archived' OR COALESCE(sp.is_active, 1) = 0 THEN 'archived'
    WHEN COALESCE(sp.status, '') IN ('published', 'live') THEN 'published'
    ELSE COALESCE(NULLIF(trim(sp.status), ''), 'published')
  END,
  sp.seo_title,
  sp.canonical_url,
  COALESCE(sp.robots, 'index,follow'),
  sp.r2_bucket,
  sp.r2_key,
  sp.r2_url,
  COALESCE(sp.content_type, 'text/html'),
  0,
  '{}',
  '{}',
  '{}',
  json_object(
    'migrated_from', 'cms_site_pages',
    'legacy_site_page_id', sp.id,
    'legacy_project_id', sp.project_id
  ),
  CASE WHEN sp.path = '/' THEN 1 ELSE 0 END,
  0,
  0,
  COALESCE(sp.is_active, 1),
  COALESCE(sp.sort_order, 0),
  COALESCE(
    CASE
      WHEN sp.created_at GLOB '[0-9]*' AND length(sp.created_at) BETWEEN 10 AND 12
        THEN CAST(sp.created_at AS INTEGER)
      ELSE NULL
    END,
    CAST(strftime('%s', substr(replace(replace(sp.created_at, 'T', ' '), 'Z', ''), 1, 19)) AS INTEGER),
    CAST(strftime('%s', 'now') AS INTEGER)
  ),
  COALESCE(
    CASE
      WHEN sp.updated_at GLOB '[0-9]*' AND length(sp.updated_at) BETWEEN 10 AND 12
        THEN CAST(sp.updated_at AS INTEGER)
      ELSE NULL
    END,
    CAST(strftime('%s', substr(replace(replace(sp.updated_at, 'T', ' '), 'Z', ''), 1, 19)) AS INTEGER),
    CAST(strftime('%s', 'now') AS INTEGER)
  ),
  CASE
    WHEN sp.published_at IS NULL OR trim(sp.published_at) = '' THEN NULL
    WHEN sp.published_at GLOB '[0-9]*' AND length(sp.published_at) BETWEEN 10 AND 12
      THEN CAST(sp.published_at AS INTEGER)
    ELSE CAST(strftime('%s', substr(replace(replace(sp.published_at, 'T', ' '), 'Z', ''), 1, 19)) AS INTEGER)
  END
FROM cms_site_pages sp
LEFT JOIN cms_tenants ct ON ct.slug = sp.project_slug AND COALESCE(ct.is_active, 1) = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM cms_pages p
  WHERE p.project_slug = sp.project_slug
    AND (p.route_path = sp.path OR p.path = sp.path)
);

-- ── 2) Enrich overlapping cms_pages from site_pages (fill null R2 + legacy metadata) ──
UPDATE cms_pages
SET
  r2_bucket = COALESCE(
    cms_pages.r2_bucket,
    (SELECT sp.r2_bucket FROM cms_site_pages sp
      WHERE sp.project_slug = cms_pages.project_slug AND sp.path = cms_pages.route_path LIMIT 1)
  ),
  r2_key = COALESCE(
    cms_pages.r2_key,
    (SELECT sp.r2_key FROM cms_site_pages sp
      WHERE sp.project_slug = cms_pages.project_slug AND sp.path = cms_pages.route_path LIMIT 1)
  ),
  r2_url = COALESCE(
    cms_pages.r2_url,
    (SELECT sp.r2_url FROM cms_site_pages sp
      WHERE sp.project_slug = cms_pages.project_slug AND sp.path = cms_pages.route_path LIMIT 1)
  ),
  metadata_json = json_set(
    COALESCE(NULLIF(trim(cms_pages.metadata_json), ''), '{}'),
    '$.legacy_site_page_id',
    (SELECT sp.id FROM cms_site_pages sp
      WHERE sp.project_slug = cms_pages.project_slug AND sp.path = cms_pages.route_path LIMIT 1),
    '$.migrated_from',
    'cms_site_pages_overlap'
  )
WHERE EXISTS (
  SELECT 1 FROM cms_site_pages sp
  WHERE sp.project_slug = cms_pages.project_slug AND sp.path = cms_pages.route_path
);

-- ── 3) Repoint live-edit sessions FK (table empty; safe recreate) ──
DROP TABLE IF EXISTS cms_live_edit_sessions;

CREATE TABLE IF NOT EXISTS cms_live_edit_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  page_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  is_active INTEGER DEFAULT 1,
  last_activity TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE
);

-- ── 4) Drop legacy registry ──
DROP TABLE IF EXISTS cms_site_pages;
