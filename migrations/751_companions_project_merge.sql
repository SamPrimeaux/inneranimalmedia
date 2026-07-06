-- 751: Collapse Companions projects → proj_companions_cpas_web (canonical).
-- Merge proj_mqaxampl_ri9bkq site-update spine into winner; archive duplicate.
-- Client: client_companions_cpas · Site: companionsofcaddo.org · Worker: companionscpas
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/751_companions_project_merge.sql

UPDATE projects
SET
  name = 'Companions of Caddo',
  client_name = 'Companions of Caddo',
  domain = 'companionsofcaddo.org',
  worker_id = 'companionscpas',
  workspace_id = 'ws_inneranimalmedia',
  tenant_id = 'tenant_sam_primeaux',
  client_id = 'client_companions_cpas',
  status = 'development',
  priority = 85,
  project_type = 'dashboard',
  d1_databases = 'companionscpas',
  description = 'Client worker + public site (companionsofcaddo.org). Lori + Michelle site updates in progress; rescue platform CMS, fosters, donations, Stripe.',
  tags_json = '["client","companionscpas","companionsofcaddo","site-updates"]',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"canonical_project":true,"merged_from":"proj_mqaxampl_ri9bkq","site":"companionsofcaddo.org","client_id":"client_companions_cpas","brief_status":"in_progress"}'
  ),
  updated_at = datetime('now')
WHERE id = 'proj_companions_cpas_web';

UPDATE agentsam_todo
SET project_id = 'proj_companions_cpas_web',
    project_key = 'companionscpas',
    updated_at = datetime('now')
WHERE project_id = 'proj_mqaxampl_ri9bkq'
   OR project_key = 'companionscpas';

UPDATE kanban_boards
SET project_id = 'proj_companions_cpas_web',
    workspace_id = 'ws_inneranimalmedia',
    updated_at = unixepoch()
WHERE project_id = 'proj_mqaxampl_ri9bkq'
   OR id = 'board_companionscpas';

UPDATE client_projects
SET
  project_id = 'proj_companions_cpas_web',
  client_id = 'client_companions_cpas',
  cloudflare_worker_name = 'companionscpas',
  cloudflare_worker_url = 'https://companionsofcaddo.org',
  updated_at = datetime('now')
WHERE id = 'cp_companionscpas'
   OR project_id IN ('proj_mqaxampl_ri9bkq', 'proj_companionscpas');

UPDATE workspace_projects
SET
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"project_id":"proj_companions_cpas_web","projects_table_id":"proj_companions_cpas_web","target_domain":"companionsofcaddo.org","merged_from":"proj_mqaxampl_ri9bkq"}'
  ),
  updated_at = unixepoch()
WHERE id = 'wp_companions_cpas_001';

UPDATE projects
SET
  status = 'archived',
  name = 'ARCHIVED — merged into proj_companions_cpas_web',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"archived_reason":"merged_into_proj_companions_cpas_web","archived_at":"2026-07-06"}'
  ),
  updated_at = datetime('now')
WHERE id = 'proj_mqaxampl_ri9bkq';
