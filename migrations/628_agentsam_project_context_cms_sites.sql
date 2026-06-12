-- 628: Active agentsam_project_context row per distinct cms_pages.project_slug.
-- Documents D1 + R2 (ASSETS) + KV (SESSION_CACHE) + DO (IAM_COLLAB) lanes.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/628_agentsam_project_context_cms_sites.sql

INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, primary_tables, related_routes,
  workers_involved, r2_buckets_involved, notes, created_at, updated_at
)
SELECT
  'ctx_cms_' || replace(replace(trim(p.project_slug), '-', '_'), ' ', '_'),
  COALESCE(ct.tenant_ref_id, p.tenant_id, 'tenant_sam_primeaux'),
  COALESCE(NULLIF(trim(p.workspace_id), ''), 'ws_inneranimalmedia'),
  trim(p.project_slug),
  'CMS · ' || trim(p.project_slug),
  'cms_site',
  'active',
  75,
  'CMS site `' || trim(p.project_slug) || '`. D1 cms_pages/sections/themes/drafts. R2 ASSETS published+draft HTML + theme CSS. KV SESSION_CACHE: cms:bootstrap:{ws}:{slug}, cms:live-session, cms:draft, cms:publish-lock. DO IAM_COLLAB room cms:{page_id}.',
  '["cms_pages","cms_page_sections","cms_section_components","cms_themes","cms_component_templates","cms_page_drafts","cms_page_overrides","cms_live_edit_sessions"]',
  '["cms_edit","cms_live_editor.*","/dashboard/cms/*","/api/cms/bootstrap","/api/cms/live-session/join"]',
  'inneranimalmedia',
  'inneranimalmedia',
  'Seeded migration 628 — per-site CMS context with KV+DO binding names.',
  unixepoch(),
  unixepoch()
FROM (
  SELECT project_slug, tenant_id, workspace_id, COUNT(*) AS page_count
  FROM cms_pages
  WHERE status != 'archived' AND trim(COALESCE(project_slug, '')) != ''
  GROUP BY project_slug
) p
LEFT JOIN cms_tenants ct ON ct.slug = p.project_slug AND COALESCE(ct.is_active, 1) = 1;
