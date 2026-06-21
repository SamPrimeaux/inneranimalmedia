-- 660: Fuel N Free Time — PrimeTech CMS site for Sam + Connor on ws_fuelnfreetime.
-- Scoped via agentsam_project_context (cms_site); not Sam's full IAM CMS catalog.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/660_fuelnfreetime_cms_site.sql

PRAGMA foreign_keys = OFF;

-- ── CMS tenant registry ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO cms_tenants (
  id, name, slug, logo_url, primary_color, secondary_color, theme,
  domain, is_active, tenant_ref_id, created_at, updated_at
) VALUES (
  'fuelnfreetime',
  'Fuel N Free Time',
  'fuelnfreetime',
  NULL,
  '#c45c26',
  '#1a1a1a',
  'dark',
  'fuelnfreetime.com',
  1,
  'tenant_sam_primeaux',
  datetime('now'),
  datetime('now')
);

UPDATE cms_tenants
SET
  name = 'Fuel N Free Time',
  primary_color = '#c45c26',
  secondary_color = '#1a1a1a',
  theme = 'dark',
  domain = COALESCE(domain, 'fuelnfreetime.com'),
  is_active = 1,
  tenant_ref_id = 'tenant_sam_primeaux',
  updated_at = datetime('now')
WHERE slug = 'fuelnfreetime';

-- ── Workspace-scoped CMS project context (collab lane) ───────────────────────
INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, primary_tables, related_routes,
  workers_involved, r2_buckets_involved, notes, created_at, updated_at
) VALUES (
  'ctx_cms_fuelnfreetime',
  'tenant_sam_primeaux',
  'ws_fuelnfreetime',
  'fuelnfreetime',
  'CMS · Fuel N Free Time',
  'cms_site',
  'active',
  80,
  'Fuel N Free Time Shopify + adventure brand CMS. Sam + Connor collab on ws_fuelnfreetime only.',
  '["cms_pages","cms_page_sections","cms_section_components","cms_themes","cms_component_templates","cms_page_drafts","cms_page_overrides","cms_live_edit_sessions"]',
  '["cms_edit","cms_live_editor.*","/dashboard/cms/*","/api/cms/bootstrap","/api/cms/live-session/join"]',
  'fuelnfreetime',
  'fuelnfreetime',
  'Migration 660 — PrimeTech CMS Lite collab site. KV cms:bootstrap:{ws}:{slug}. DO IAM_COLLAB cms:{page_id}.',
  unixepoch(),
  unixepoch()
);

-- ── Starter home page ──────────────────────────────────────────────────────────
INSERT OR IGNORE INTO cms_pages (
  id,
  project_id,
  project_slug,
  tenant_id,
  workspace_id,
  slug,
  path,
  route_path,
  page_type,
  title,
  meta_description,
  description,
  status,
  seo_title,
  robots,
  r2_bucket,
  content_type,
  is_homepage,
  is_active,
  sort_order,
  created_at,
  updated_at,
  published_at
) VALUES (
  'page_fuel_home',
  'fuelnfreetime',
  'fuelnfreetime',
  'tenant_sam_primeaux',
  'ws_fuelnfreetime',
  'home',
  '/',
  '/',
  'home',
  'Fuel N Free Time',
  'Fuel your adventure. Live free. Gear and inspiration for every turn of the road.',
  'Fuel your adventure. Live free.',
  'published',
  'Fuel N Free Time — Fuel Your Adventure, Live Free',
  'index,follow',
  'inneranimalmedia',
  'text/html',
  1,
  1,
  10,
  unixepoch(),
  unixepoch(),
  unixepoch()
);

UPDATE cms_pages
SET
  project_id = 'fuelnfreetime',
  project_slug = 'fuelnfreetime',
  tenant_id = 'tenant_sam_primeaux',
  workspace_id = 'ws_fuelnfreetime',
  title = 'Fuel N Free Time',
  meta_description = 'Fuel your adventure. Live free. Gear and inspiration for every turn of the road.',
  status = 'published',
  is_homepage = 1,
  is_active = 1,
  updated_at = unixepoch()
WHERE id = 'page_fuel_home';

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible, created_at, updated_at
) VALUES (
  'sec_fuel_home_hero',
  'page_fuel_home',
  'hero',
  'main-hero',
  '{"kicker":"TIME IS THE","title":"REAL HORSEPOWER","title_html":"Fuel Your<span>Adventure</span>Live Free","subtitle":"For those who''ve earned their freedom — on two wheels, four wheels, water, or in the garage.","cta_label":"Shop the Collection","cta_href":"/shop","scheme":"dark"}',
  10,
  1,
  datetime('now'),
  datetime('now')
);

UPDATE cms_page_sections
SET
  section_data = '{"kicker":"TIME IS THE","title":"REAL HORSEPOWER","title_html":"Fuel Your<span>Adventure</span>Live Free","subtitle":"For those who''ve earned their freedom — on two wheels, four wheels, water, or in the garage.","cta_label":"Shop the Collection","cta_href":"/shop","scheme":"dark"}',
  is_visible = 1,
  updated_at = datetime('now')
WHERE id = 'sec_fuel_home_hero';

PRAGMA foreign_keys = ON;
