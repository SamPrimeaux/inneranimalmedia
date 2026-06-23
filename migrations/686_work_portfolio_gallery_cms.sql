-- Portfolio gallery CMS for /work + case study detail pages at /work/{slug}
-- Worker hydrates pages/work/index.html and pages/work/detail.html at request time.

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
  status,
  r2_bucket,
  r2_key,
  is_active,
  created_at,
  updated_at,
  published_at
)
SELECT
  'page_work',
  project_id,
  project_slug,
  tenant_id,
  workspace_id,
  'work',
  '/work',
  '/work',
  'work',
  'Work',
  'Selected work with a point of view — Inner Animal Media portfolio.',
  'published',
  'inneranimalmedia',
  'pages/work/index.html',
  1,
  unixepoch(),
  unixepoch(),
  unixepoch()
FROM cms_pages
WHERE id = 'page_home'
LIMIT 1;

UPDATE cms_pages
SET
  title = 'Work',
  meta_description = 'Selected work with a point of view — Inner Animal Media portfolio.',
  page_type = 'work',
  status = 'published',
  r2_bucket = 'inneranimalmedia',
  r2_key = 'pages/work/index.html',
  is_active = 1,
  updated_at = unixepoch(),
  published_at = COALESCE(published_at, unixepoch())
WHERE id = 'page_work';

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_work_portfolio_gallery',
  'page_work',
  'portfolio_gallery',
  'work_portfolio',
  '{"eyebrow":"Portfolio","heading":"Sites & apps we have shipped","cards":[{"slug":"workslayr","title":"Workslayr","category":"Apps","tags":["Platform","Workforce","Dashboard"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","logo_url":"","accent_color":"#2f7bff","excerpt":"Workforce ops platform with scheduling, payroll hooks, and team dashboards.","detail_route":"/work/workslayr"},{"slug":"sitesnapps","title":"SitesNApps","category":"Sites","tags":["Portfolio","CMS","Marketing"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","logo_url":"","accent_color":"#67e8ff","excerpt":"Agency-style portfolio gallery with filter tabs and CMS-driven case studies.","detail_route":"/work/sitesnapps"},{"slug":"trickcel","title":"Trickcel","category":"Apps","tags":["Mobile","Automation","Integrations"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","logo_url":"","accent_color":"#8b5cf6","excerpt":"Automation-first app shell with webhook routing and operator dashboards.","detail_route":"/work/trickcel"},{"slug":"meauxchess","title":"MeauxChess","category":"Apps","tags":["3D","Multiplayer","Games"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","logo_url":"","accent_color":"#25c878","excerpt":"Real-time 3D chess on Cloudflare Durable Objects with private rooms.","detail_route":"/work/meauxchess"},{"slug":"companionscpas","title":"Companions CPAs","category":"Sites","tags":["Professional","CMS","Donations"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","logo_url":"","accent_color":"#2f7bff","excerpt":"Professional services site with CMS workspace and donation flows.","detail_route":"/work/companionscpas"},{"slug":"meauxcloud","title":"MeauxCLOUD","category":"Apps","tags":["SaaS","Infrastructure","Dashboard"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","logo_url":"","accent_color":"#ff8a3d","excerpt":"Unified cloud ops dashboard for IAM client workspaces and deploy hooks.","detail_route":"/work/meauxcloud"},{"slug":"fuelnfreetime","title":"Fuel N Free Time","category":"Apps","tags":["Kanban","Projects","Ops"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","logo_url":"","accent_color":"#ef4444","excerpt":"Project ops board with build lanes, identity fixes, and agent tooling.","detail_route":"/work/fuelnfreetime"},{"slug":"designstudio","title":"Design Studio","category":"Sites","tags":["CAD","3D","Blueprint"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/public","logo_url":"","accent_color":"#67e8ff","excerpt":"Blueprint-to-GLB pipeline with OpenSCAD generation and voxel viewport.","detail_route":"/work/designstudio"},{"slug":"inneranimalmedia","title":"Inner Animal Media","category":"Sites","tags":["Brand","Platform","CMS"],"image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","logo_url":"","accent_color":"#2f7bff","excerpt":"Production platform site with edge CMS hydration and agent runtime.","detail_route":"/work/inneranimalmedia"}]}',
  15,
  1
);

-- ── Case study: Workslayr ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_workslayr', project_id, project_slug, tenant_id, workspace_id,
  'workslayr', '/work/workslayr', '/work/workslayr',
  'case_study', 'Workslayr', 'Workslayr workforce platform case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_workslayr_hero', 'page_work_workslayr', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"Workslayr","title_accent":"Platform","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","feature_image_alt":"Workslayr dashboard preview"}', 10, 1),
('sec_workslayr_overview', 'page_work_workslayr', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Workforce ops built for field teams","intro":"Scheduling, payroll hooks, and operator dashboards in one cohesive platform.","body":"Workslayr connects dispatch, time tracking, and reporting into a single system teams actually use in the field. We designed the IA around daily operator workflows — fast entry, clear status, and audit-friendly exports."}', 20, 1),
('sec_workslayr_gallery', 'page_work_workslayr', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","alt":"Dashboard view"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","alt":"Mobile schedule"}]}', 30, 1),
('sec_workslayr_included', 'page_work_workslayr', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"Custom dashboard shell"},{"text":"Role-based access control"},{"text":"Scheduling & dispatch modules"},{"text":"Export-ready reporting"},{"text":"Cloudflare Workers API layer"},{"text":"CMS-editable marketing pages"}]}', 40, 1),
('sec_workslayr_services', 'page_work_workslayr', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Product strategy","description":"Workflow mapping and IA for operator-first UX."},{"title":"Full-stack build","description":"React dashboard + Workers API + D1 data layer."},{"title":"Launch support","description":"Deploy hooks, monitoring, and handoff docs."}]}', 50, 1),
('sec_workslayr_why', 'page_work_workslayr', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"We build ops platforms that survive real-world usage — not demo-day prototypes. Every screen earns its place in the daily workflow."}', 60, 1),
('sec_workslayr_cta', 'page_work_workslayr', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your ops platform?","body":"Tell us about your team workflows and we will map the clearest path to launch.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);

-- ── Case study: SitesNApps ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_sitesnapps', project_id, project_slug, tenant_id, workspace_id,
  'sitesnapps', '/work/sitesnapps', '/work/sitesnapps',
  'case_study', 'SitesNApps', 'SitesNApps portfolio gallery case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_sitesnapps_hero', 'page_work_sitesnapps', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"SitesNApps","title_accent":"Gallery","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","feature_image_alt":"SitesNApps portfolio grid"}', 10, 1),
('sec_sitesnapps_overview', 'page_work_sitesnapps', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Portfolio systems that sell the work","intro":"Filterable project grids, case study detail pages, and CMS-driven content — all on your domain.","body":"SitesNApps-style galleries need fast filtering, strong visual hierarchy, and detail pages that keep visitors on-site. We wire every card to a CMS-backed case study with edge hydration — no external redirects."}', 20, 1),
('sec_sitesnapps_gallery', 'page_work_sitesnapps', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/public","alt":"Gallery index"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","alt":"Detail page"}]}', 30, 1),
('sec_sitesnapps_included', 'page_work_sitesnapps', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"Filter tabs (All / Sites / Apps)"},{"text":"Responsive 3-column card grid"},{"text":"Case study detail template"},{"text":"PrimeTech CMS section editor"},{"text":"Edge hydration at request time"},{"text":"Dark theme with brand accents"}]}', 40, 1),
('sec_sitesnapps_services', 'page_work_sitesnapps', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Visual design","description":"Card layouts, mockup frames, and accent color system."},{"title":"CMS architecture","description":"portfolio_gallery + case_study section schemas in D1."},{"title":"Edge delivery","description":"Worker hydration from cms_page_sections at request time."}]}', 50, 1),
('sec_sitesnapps_why', 'page_work_sitesnapps', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"Your portfolio should live on your domain, load fast at the edge, and stay editable without redeploying HTML."}', 60, 1),
('sec_sitesnapps_cta', 'page_work_sitesnapps', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your portfolio?","body":"We will set up the gallery, detail pages, and CMS editor in one pass.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);

-- ── Case study: Trickcel ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_trickcel', project_id, project_slug, tenant_id, workspace_id,
  'trickcel', '/work/trickcel', '/work/trickcel',
  'case_study', 'Trickcel', 'Trickcel automation app case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_trickcel_hero', 'page_work_trickcel', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"Trickcel","title_accent":"Automation","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","feature_image_alt":"Trickcel automation dashboard"}', 10, 1),
('sec_trickcel_overview', 'page_work_trickcel', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Webhook-first automation shell","intro":"Route events, trigger workflows, and monitor runs from a single operator dashboard.","body":"Trickcel demonstrates how IAM builds app shells around automation — webhook ingress, queue processing, and a clean UI for operators to inspect and retry failed runs."}', 20, 1),
('sec_trickcel_gallery', 'page_work_trickcel', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","alt":"Run inspector"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","alt":"Webhook config"}]}', 30, 1),
('sec_trickcel_included', 'page_work_trickcel', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"Webhook ingress layer"},{"text":"Run history & retry UI"},{"text":"Operator notifications"},{"text":"API key management"},{"text":"Workers + Queues backend"},{"text":"CMS-managed landing pages"}]}', 40, 1),
('sec_trickcel_services', 'page_work_trickcel', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Integration design","description":"Webhook schemas, idempotency, and retry policies."},{"title":"App shell","description":"Dashboard UI with run inspector and config panels."},{"title":"Infrastructure","description":"Cloudflare Workers, Queues, and D1 persistence."}]}', 50, 1),
('sec_trickcel_why', 'page_work_trickcel', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"Automation apps need reliability first. We design for observability, safe retries, and operator clarity from day one."}', 60, 1),
('sec_trickcel_cta', 'page_work_trickcel', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your automation app?","body":"Share your integration map and we will architect the shell around it.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);
