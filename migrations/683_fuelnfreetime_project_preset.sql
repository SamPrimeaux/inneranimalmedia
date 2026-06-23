-- 683: Fuel N Free Time — workspace_projects preset + correct portfolio name.
-- proj_fuelnfreetime existed but workspace_projects row was missing (IAM has wp_inneranimalmedia).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/683_fuelnfreetime_project_preset.sql

PRAGMA foreign_keys = OFF;

UPDATE projects
SET
  name = 'Fuel N Free Time',
  client_name = COALESCE(NULLIF(TRIM(client_name), ''), 'Fuel N Free Time'),
  updated_at = datetime('now')
WHERE id = 'proj_fuelnfreetime';

INSERT OR IGNORE INTO workspace_projects (
  id,
  workspace_id,
  tenant_id,
  owner_user_id,
  agent_ai_id,
  name,
  slug,
  description,
  client_company,
  project_type,
  status,
  budget_usd,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'wp_fuelnfreetime',
  'ws_fuelnfreetime',
  'tenant_sam_primeaux',
  'usr_sam_primeaux',
  'ai_sam_v1',
  'Fuel N Free Time',
  'fuelnfreetime',
  'Fuel N Free Time Shopify + Workers app — Sam + Connor collab lane.',
  'Fuel N Free Time',
  'ecommerce',
  'active',
  0,
  '{"projects_table_id":"proj_fuelnfreetime","primaryDomain":"fuelnfreetime.com","github_repo":"SamPrimeaux/fuelnfreetime","r2_bucket":"fuelnfreetime"}',
  unixepoch(),
  unixepoch()
);

UPDATE workspace_projects
SET
  name = 'Fuel N Free Time',
  slug = 'fuelnfreetime',
  description = 'Fuel N Free Time Shopify + Workers app — Sam + Connor collab lane.',
  client_company = 'Fuel N Free Time',
  project_type = 'ecommerce',
  status = 'active',
  metadata_json = '{"projects_table_id":"proj_fuelnfreetime","primaryDomain":"fuelnfreetime.com","github_repo":"SamPrimeaux/fuelnfreetime","r2_bucket":"fuelnfreetime"}',
  updated_at = unixepoch()
WHERE id = 'wp_fuelnfreetime';

PRAGMA foreign_keys = ON;
