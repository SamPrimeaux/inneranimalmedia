-- 902: Align IAM CMS spine inventory + /agentsam pilot for assemble-on-publish.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --file=./migrations/902_iam_cms_spine_agentsam_pilot.sql

-- nav_visible: apply separately if missing (SQLite cannot IF NOT EXISTS column):
--   ALTER TABLE cms_pages ADD COLUMN nav_visible INTEGER NOT NULL DEFAULT 1;

-- Fix IAM client_apps metadata drift (was CPAS-shaped)
UPDATE client_apps
SET
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.cms_mode', 'platform',
    '$.cms_hosting', 'platform',
    '$.api_profile', 'primetch',
    '$.cms_api_profile', 'primetch',
    '$.section_convention', 'pages/{slug}/sections/{section_key}.html',
    '$.page_artifact_convention', 'pages/{slug}/index.html',
    '$.global_header_key', 'src/components/iam-header.html',
    '$.global_footer_key', 'src/components/iam-footer.html',
    '$.shell_mode', 'dynamic_nav',
    '$.page_model', 'section_stack',
    '$.r2_bucket', 'inneranimalmedia',
    '$.r2_binding_name', 'ASSETS',
    '$.d1_database_id', 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
    '$.d1_database_name', 'inneranimalmedia-business',
    '$.public_domain', 'inneranimalmedia.com',
    '$.assemble_pilot_routes', json('["/agentsam"]')
  ),
  instructions = 'Platform storefront: pages/{slug}/index.html + src/components/iam-header|footer. api_profile=primetch. Pilot assemble on /agentsam publish. Nav from iam-site-nav + nav_visible.',
  updated_at = datetime('now')
WHERE app_key = 'inneranimalmedia';

-- Point /agentsam at storefront asset (shell inject + dynamic nav)
UPDATE cms_pages
SET
  r2_key = 'pages/agentsam/index.html',
  r2_bucket = 'inneranimalmedia',
  status = 'published',
  is_active = 1,
  nav_visible = 0,
  title = COALESCE(NULLIF(TRIM(title), ''), 'Agent Sam'),
  seo_title = COALESCE(NULLIF(TRIM(seo_title), ''), 'Agent Sam — Inner Animal Media'),
  meta_description = COALESCE(
    NULLIF(TRIM(meta_description), ''),
    'Agent Sam is Inner Animal Media''s cloud-native operator agent — tools, memory, and site workflows.'
  ),
  updated_at = unixepoch()
WHERE id = '5de91aa0-10cc-45e5-9607-199d5c2f8467'
   OR (route_path = '/agentsam' AND project_slug = 'inneranimalmedia');

-- Seed pilot sections (idempotent by id)
INSERT OR REPLACE INTO cms_page_sections (
  id, page_id, section_name, section_type, section_data, sort_order, is_visible, created_at, updated_at
) VALUES
(
  'sec_agentsam_hero',
  '5de91aa0-10cc-45e5-9607-199d5c2f8467',
  'hero',
  'hero',
  json('{"html_source":"assembled","html":"<div class=\"iam-cms-section-inner\"><div class=\"eyebrow\">Inner Animal Media / Agent Sam</div><h1>Operator agent for real cloud work</h1><p>Agent Sam reads your workspace, edits D1 and R2 against the right site spine, and ships through the same dashboard publish loop your CMS uses.</p><a class=\"cta\" href=\"/contact\">Talk to us about Agent Sam</a></div>"}'),
  10,
  1,
  unixepoch(),
  unixepoch()
),
(
  'sec_agentsam_capabilities',
  '5de91aa0-10cc-45e5-9607-199d5c2f8467',
  'capabilities',
  'feature_cards',
  json('{"html_source":"assembled","html":"<div class=\"iam-cms-section-inner\"><h2>Built for production surfaces</h2><p>Not a toy chat window — scoped tools, site context, and publish contracts that match live Workers.</p><div class=\"grid\"><article class=\"card\"><h3>Site spine aware</h3><p>Knows which R2 bucket, D1, and key conventions apply when you switch Working On.</p></article><article class=\"card\"><h3>CMS + code</h3><p>Section stacks, shell/nav, and worker routes stay aligned so dashboard edits reach the public URL.</p></article><article class=\"card\"><h3>Cloud native</h3><p>Workers, D1, R2, KV, and browser verify — the same lane your storefront already runs on.</p></article></div></div>"}'),
  20,
  1,
  unixepoch(),
  unixepoch()
),
(
  'sec_agentsam_cta',
  '5de91aa0-10cc-45e5-9607-199d5c2f8467',
  'cta',
  'cta_banner',
  json('{"html_source":"assembled","html":"<div class=\"iam-cms-section-inner\"><h2>Ready when you are</h2><p>Use Theme Studio to edit these sections, then Publish — assemble writes the storefront artifact.</p><a class=\"cta\" href=\"/dashboard/cms?site=inneranimalmedia\">Open CMS</a></div>"}'),
  30,
  1,
  unixepoch(),
  unixepoch()
);

-- Ensure primary marketing nav pages are nav-visible when published
UPDATE cms_pages
SET nav_visible = 1
WHERE project_slug = 'inneranimalmedia'
  AND route_path IN ('/', '/work', '/about', '/services', '/contact')
  AND COALESCE(status, '') = 'published';
