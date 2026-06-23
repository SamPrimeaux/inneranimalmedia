-- Remaining portfolio case study detail pages for /work/{slug}
-- Seeds cms_pages + cms_page_sections for gallery cards without detail pages yet.
-- Worker hydrates pages/work/detail.html at request time from D1.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/687_work_portfolio_case_studies_remaining.sql

-- ── Case study: MeauxChess ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_meauxchess', project_id, project_slug, tenant_id, workspace_id,
  'meauxchess', '/work/meauxchess', '/work/meauxchess',
  'case_study', 'MeauxChess', 'MeauxChess real-time 3D chess case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_meauxchess_hero', 'page_work_meauxchess', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"MeauxChess","title_accent":"Multiplayer","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","feature_image_alt":"MeauxChess 3D board preview"}', 10, 1),
('sec_meauxchess_overview', 'page_work_meauxchess', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Real-time 3D chess at the edge","intro":"Private rooms, live move sync, and a polished 3D board — all on Cloudflare Durable Objects.","body":"MeauxChess demonstrates how IAM builds multiplayer experiences without a traditional game server. Each room runs as a Durable Object with WebSocket fan-out, move validation, and session persistence. Players get instant feedback while the architecture stays simple to operate and scale."}', 20, 1),
('sec_meauxchess_gallery', 'page_work_meauxchess', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","alt":"3D chess board"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","alt":"Private room lobby"}]}', 30, 1),
('sec_meauxchess_included', 'page_work_meauxchess', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"3D board viewport with piece animation"},{"text":"Private room creation & invite links"},{"text":"Real-time move sync via WebSockets"},{"text":"Durable Object game state"},{"text":"Move history & replay hooks"},{"text":"CMS-managed landing & rules pages"}]}', 40, 1),
('sec_meauxchess_services', 'page_work_meauxchess', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Game architecture","description":"Room lifecycle, move validation, and reconnect handling on Durable Objects."},{"title":"3D client","description":"Interactive board rendering with responsive layout for desktop and mobile."},{"title":"Edge infrastructure","description":"Workers, Durable Objects, and D1 for profiles and match records."}]}', 50, 1),
('sec_meauxchess_why', 'page_work_meauxchess', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"Multiplayer does not require a dedicated game server farm. We design for low latency, clean state management, and operator-friendly deployment on Cloudflare."}', 60, 1),
('sec_meauxchess_cta', 'page_work_meauxchess', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your real-time app?","body":"Whether it is games, collaboration, or live dashboards — we will architect the edge stack around your sync requirements.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);

-- ── Case study: Companions CPAs ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_companionscpas', project_id, project_slug, tenant_id, workspace_id,
  'companionscpas', '/work/companionscpas', '/work/companionscpas',
  'case_study', 'Companions CPAs', 'Companions CPAs professional services site case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_companionscpas_hero', 'page_work_companionscpas', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"Companions CPAs","title_accent":"Professional","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","feature_image_alt":"Companions CPAs site preview"}', 10, 1),
('sec_companionscpas_overview', 'page_work_companionscpas', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Professional services with CMS control","intro":"A trustworthy public presence, editable content workspace, and donation flows — without sacrificing compliance-minded design.","body":"Companions CPAs needed a site that reads credible to clients and stays maintainable by the team. We built a CMS-backed marketing site with clear service pages, team bios, and integrated donation paths — all editable from the PrimeTech workspace without redeploying HTML."}', 20, 1),
('sec_companionscpas_gallery', 'page_work_companionscpas', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","alt":"Homepage layout"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/public","alt":"Services page"}]}', 30, 1),
('sec_companionscpas_included', 'page_work_companionscpas', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"Responsive marketing site template"},{"text":"CMS workspace for page editing"},{"text":"Service & team bio sections"},{"text":"Donation flow integration"},{"text":"Contact & intake forms"},{"text":"SEO-ready meta and sitemap hooks"}]}', 40, 1),
('sec_companionscpas_services', 'page_work_companionscpas', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Brand-forward design","description":"Typography, layout, and trust signals suited to professional services."},{"title":"CMS setup","description":"Section schemas, editable blocks, and publish workflow in D1."},{"title":"Donation integration","description":"Secure payment paths wired to the client''s preferred processor."}]}', 50, 1),
('sec_companionscpas_why', 'page_work_companionscpas', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"Professional firms need sites that look polished on day one and stay easy to update for years. We deliver both — design credibility and a CMS your team actually uses."}', 60, 1),
('sec_companionscpas_cta', 'page_work_companionscpas', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your firm''s site?","body":"Tell us about your practice and we will map content, CMS, and conversion paths in one launch plan.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);

-- ── Case study: MeauxCLOUD ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_meauxcloud', project_id, project_slug, tenant_id, workspace_id,
  'meauxcloud', '/work/meauxcloud', '/work/meauxcloud',
  'case_study', 'MeauxCLOUD', 'MeauxCLOUD unified cloud ops dashboard case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_meauxcloud_hero', 'page_work_meauxcloud', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"MeauxCLOUD","title_accent":"Infrastructure","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","feature_image_alt":"MeauxCLOUD ops dashboard"}', 10, 1),
('sec_meauxcloud_overview', 'page_work_meauxcloud', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Unified cloud ops for client workspaces","intro":"One dashboard for deploy hooks, bindings, secrets, and workspace health across IAM client projects.","body":"MeauxCLOUD is IAM''s internal SaaS shell for managing client workspaces at scale. Operators see deploy status, binding drift, and environment alignment in one view — with hooks into Wrangler, GitHub, and Cloudflare APIs. The goal is fewer context switches and faster incident response."}', 20, 1),
('sec_meauxcloud_gallery', 'page_work_meauxcloud', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","alt":"Workspace overview"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","alt":"Deploy hooks panel"}]}', 30, 1),
('sec_meauxcloud_included', 'page_work_meauxcloud', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"Multi-workspace dashboard shell"},{"text":"Deploy hook triggers & status"},{"text":"Binding & secret drift alerts"},{"text":"GitHub repo linkage per workspace"},{"text":"Role-based operator access"},{"text":"CMS-managed product pages"}]}', 40, 1),
('sec_meauxcloud_services', 'page_work_meauxcloud', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Platform UX","description":"Information architecture for ops teams managing dozens of client environments."},{"title":"API integration","description":"Cloudflare, GitHub, and Wrangler orchestration from a single control plane."},{"title":"SaaS foundation","description":"Auth, tenancy, billing hooks, and extensible workspace model in D1."}]}', 50, 1),
('sec_meauxcloud_why', 'page_work_meauxcloud', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"We build the platforms we use ourselves. MeauxCLOUD reflects how IAM thinks about multi-tenant ops — observable, editable, and deployable at the edge."}', 60, 1),
('sec_meauxcloud_cta', 'page_work_meauxcloud', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your ops dashboard?","body":"If your team juggles too many dashboards, we will consolidate the workflows that matter into one IAM-grade shell.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);

-- ── Case study: Fuel N Free Time ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_fuelnfreetime', project_id, project_slug, tenant_id, workspace_id,
  'fuelnfreetime', '/work/fuelnfreetime', '/work/fuelnfreetime',
  'case_study', 'Fuel N Free Time', 'Fuel N Free Time project ops board case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_fuelnfreetime_hero', 'page_work_fuelnfreetime', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"Fuel N Free Time","title_accent":"Project Ops","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","feature_image_alt":"Fuel N Free Time kanban board"}', 10, 1),
('sec_fuelnfreetime_overview', 'page_work_fuelnfreetime', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Kanban ops with build lanes and agent tooling","intro":"Project boards, identity-scoped tasks, and agent-ready workflows for cross-team delivery.","body":"Fuel N Free Time is a client workspace where platform and commerce lanes share one kanban board. IAM wired build-lane columns, assignee identity fixes, and agent tooling so operators and collaborators see the right tasks without superadmin access to the full platform database."}', 20, 1),
('sec_fuelnfreetime_gallery', 'page_work_fuelnfreetime', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","alt":"Kanban board view"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","alt":"Task detail panel"}]}', 30, 1),
('sec_fuelnfreetime_included', 'page_work_fuelnfreetime', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"Multi-lane kanban board"},{"text":"Build, platform & commerce columns"},{"text":"Workspace-scoped D1 access"},{"text":"Assignee identity & metadata fixes"},{"text":"Agent chat integration hooks"},{"text":"CMS live-edit smoke-test paths"}]}', 40, 1),
('sec_fuelnfreetime_services', 'page_work_fuelnfreetime', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Workspace architecture","description":"Scoped database access, R2 buckets, and GitHub repo alignment per client."},{"title":"Ops board design","description":"Column schemas, task metadata, and lane-based ownership models."},{"title":"Agent enablement","description":"OAuth, MCP, and chat tooling scoped to the client workspace."}]}', 50, 1),
('sec_fuelnfreetime_why', 'page_work_fuelnfreetime', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"Client projects need isolation without friction. We build workspace lanes that keep collaborators productive while protecting platform boundaries."}', 60, 1),
('sec_fuelnfreetime_cta', 'page_work_fuelnfreetime', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your project ops board?","body":"Share your team lanes and access model — we will wire the board, workspace, and agent tooling together.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);

-- ── Case study: Design Studio ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_designstudio', project_id, project_slug, tenant_id, workspace_id,
  'designstudio', '/work/designstudio', '/work/designstudio',
  'case_study', 'Design Studio', 'Design Studio blueprint-to-GLB pipeline case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_designstudio_hero', 'page_work_designstudio', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"Design Studio","title_accent":"Blueprint","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/public","feature_image_alt":"Design Studio 3D viewport"}', 10, 1),
('sec_designstudio_overview', 'page_work_designstudio', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Blueprint-to-GLB in the browser","intro":"OpenSCAD generation, voxel viewport, and export-ready 3D assets from parametric design inputs.","body":"Design Studio is IAM''s CAD-adjacent tooling inside the dashboard — turn blueprint parameters into OpenSCAD, preview in a voxel viewport, and export GLB for downstream use. The pipeline connects chat-assisted design, file storage in R2, and a React viewport for interactive review."}', 20, 1),
('sec_designstudio_gallery', 'page_work_designstudio', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/public","alt":"Voxel viewport"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","alt":"Blueprint parameter panel"}]}', 30, 1),
('sec_designstudio_included', 'page_work_designstudio', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"OpenSCAD code generation"},{"text":"Interactive voxel viewport"},{"text":"GLB export pipeline"},{"text":"Chat-assisted design context"},{"text":"R2 artifact storage"},{"text":"Dashboard-integrated UI shell"}]}', 40, 1),
('sec_designstudio_services', 'page_work_designstudio', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"3D tooling UX","description":"Viewport controls, parameter panels, and export workflows in React."},{"title":"Generative pipeline","description":"Blueprint schemas to OpenSCAD to mesh conversion and GLB output."},{"title":"Agent integration","description":"Design Studio context wired into the IAM chat assistant."}]}', 50, 1),
('sec_designstudio_why', 'page_work_designstudio', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"Custom 3D and CAD workflows belong inside your platform — not scattered across desktop tools. We build the pipeline and the UI together."}', 60, 1),
('sec_designstudio_cta', 'page_work_designstudio', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"your 3D design tool?","body":"Describe your parametric model or export requirements and we will architect the generation pipeline.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);

-- ── Case study: Inner Animal Media ──
INSERT OR IGNORE INTO cms_pages (
  id, project_id, project_slug, tenant_id, workspace_id, slug, path, route_path,
  page_type, title, meta_description, status, r2_bucket, r2_key, is_active,
  created_at, updated_at, published_at
)
SELECT
  'page_work_inneranimalmedia', project_id, project_slug, tenant_id, workspace_id,
  'inneranimalmedia', '/work/inneranimalmedia', '/work/inneranimalmedia',
  'case_study', 'Inner Animal Media', 'Inner Animal Media platform site case study.',
  'published', 'inneranimalmedia', 'pages/work/detail.html', 1,
  unixepoch(), unixepoch(), unixepoch()
FROM cms_pages WHERE id = 'page_home' LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (id, page_id, section_type, section_name, section_data, sort_order, is_visible) VALUES
('sec_inneranimalmedia_hero', 'page_work_inneranimalmedia', 'hero', 'case_study_hero', '{"breadcrumb":"Portfolio Details","title":"Inner Animal Media","title_accent":"Platform","feature_image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","feature_image_alt":"Inner Animal Media homepage"}', 10, 1),
('sec_inneranimalmedia_overview', 'page_work_inneranimalmedia', 'overview', 'case_study_overview', '{"label":"Our Expertise","headline":"Production platform with edge CMS hydration","intro":"Marketing pages, portfolio gallery, agent runtime, and dashboard — all on Cloudflare Workers with D1-backed content.","body":"inneranimalmedia.com is the reference implementation for IAM''s stack: static HTML shells in R2, section data in D1, Worker hydration at request time, and a PrimeTech CMS for live editing. The work portfolio you are browsing is itself CMS-driven — gallery cards link to case study pages like this one without redeploying the Worker."}', 20, 1),
('sec_inneranimalmedia_gallery', 'page_work_inneranimalmedia', 'gallery_images', 'case_study_gallery', '{"images":[{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","alt":"Homepage hero"},{"url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","alt":"Work portfolio grid"}]}', 30, 1),
('sec_inneranimalmedia_included', 'page_work_inneranimalmedia', 'whats_included', 'case_study_included', '{"heading":"What''s Included","items":[{"text":"Edge CMS hydration from D1"},{"text":"Portfolio gallery + case study templates"},{"text":"PrimeTech section editor"},{"text":"Agent chat & MCP runtime"},{"text":"Dashboard with workspace model"},{"text":"R2 static asset delivery"}]}', 40, 1),
('sec_inneranimalmedia_services', 'page_work_inneranimalmedia', 'services_provided', 'case_study_services', '{"heading":"Services Provided","items":[{"title":"Platform engineering","description":"Workers, D1, R2, Durable Objects, and observability as one cohesive stack."},{"title":"CMS architecture","description":"Page schemas, section types, and publish workflow for marketing and product content."},{"title":"Agent runtime","description":"Tool loops, MCP servers, and workspace-scoped access for AI-assisted ops."}]}', 50, 1),
('sec_inneranimalmedia_why', 'page_work_inneranimalmedia', 'why_choose', 'case_study_why', '{"heading":"Why Choose Inner Animal Media","body":"We eat our own cooking. Every pattern we ship to clients — edge CMS, portfolio systems, agent tooling — runs in production on this site first."}', 60, 1),
('sec_inneranimalmedia_cta', 'page_work_inneranimalmedia', 'cta', 'case_study_cta', '{"heading":"Ready to build","heading_accent":"on the IAM stack?","body":"From marketing sites to full platform shells — we will map your content model and deploy path on Cloudflare.","cta_label":"Start a project","cta_href":"/contact"}', 70, 1);
