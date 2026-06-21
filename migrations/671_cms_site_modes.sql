-- 671: CMS site modes — ctx_cms_companionscpas + fuel registry metadata refresh.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/671_cms_site_modes.sql

PRAGMA foreign_keys = OFF;

INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, primary_tables, related_routes,
  workers_involved, r2_buckets_involved, notes, created_at, updated_at
) VALUES (
  'ctx_cms_companionscpas',
  'tenant_companionscpas',
  'ws_companionscpas',
  'companionscpas',
  'CMS · Companions of CPAS',
  'cms_site',
  'active',
  85,
  'Companions CPAS client-worker CMS. IAM dashboard embeds client studio via bridge — content SSOT on companionscpas D1.',
  '["cms_pages","cms_page_sections","cms_publish_jobs"]',
  '["cms_edit","/dashboard/cms/website","/api/cms/*","/api/cms/bridge/*"]',
  'companionscpas',
  'companionscpas',
  'Migration 671 — client_worker cms_site registry. Never write platform D1 for CPAS content.',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_workspace
SET metadata_json = json_set(
  COALESCE(metadata_json, '{}'),
  '$.cms_mode', 'client_worker',
  '$.api_profile', 'fuel_admin',
  '$.studio_path', '/admin/cms',
  '$.worker_base_url', 'https://fuelnfreetime.meauxbility.workers.dev',
  '$.public_domain', 'fuelnfreetime.com',
  '$.deploy_hook_scope', 'code_deploy_only',
  '$.bridge_key_secret', 'AGENTSAM_BRIDGE_KEY'
),
updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

UPDATE agentsam_project_context
SET
  notes = COALESCE(notes, '') || ' cms_mode=client_worker api_profile=fuel_admin studio=/admin/cms.',
  updated_at = unixepoch()
WHERE id = 'ctx_cms_fuelnfreetime'
  AND COALESCE(notes, '') NOT LIKE '%api_profile=fuel_admin%';

UPDATE agentsam_workspace
SET metadata_json = json_set(
  COALESCE(metadata_json, '{}'),
  '$.cms_mode', 'platform_hosted',
  '$.api_profile', 'primetch',
  '$.deploy_hook_scope', 'code_deploy_only'
),
updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

PRAGMA foreign_keys = ON;
