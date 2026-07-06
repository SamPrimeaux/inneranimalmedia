-- 777: Fuel N Free Time — client + project spine alignment (Justin Molaison).
-- Canonical: client_fuelnfreetime · proj_fuelnfreetime · ws_fuelnfreetime · wp_fuelnfreetime
-- Site: fuelnfreetime.com · Worker: fuelnfreetime · Repo: SamPrimeaux/fuelnfreetime
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/777_fuelnfreetime_client_align.sql

PRAGMA foreign_keys = OFF;

-- ── clients (collaborate filter + billing lane) ───────────────────────────────
INSERT OR IGNORE INTO clients (
  id,
  name,
  email,
  domain,
  status,
  contact_name,
  contact_email,
  display_name,
  slug,
  worker_name,
  d1_database_id,
  r2_bucket,
  project_status,
  notes,
  created_at,
  updated_at
) VALUES (
  'client_fuelnfreetime',
  'Fuel & Free Time',
  'jmoeee21@yahoo.com',
  'fuelnfreetime.com',
  'active',
  'Justin Molaison',
  'jmoeee21@yahoo.com',
  'Fuel & Free Time',
  'fuelnfreetime',
  'fuelnfreetime',
  '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
  'fuelnfreetime',
  'development',
  'Client: Justin Molaison (Lafayette, LA). Commerce brand + Workers app. Sam platform lane + Connor Stripe lane. Stripe integration pending.',
  unixepoch(),
  unixepoch()
);

UPDATE clients
SET
  name = 'Fuel & Free Time',
  email = 'jmoeee21@yahoo.com',
  domain = 'fuelnfreetime.com',
  status = 'active',
  contact_name = 'Justin Molaison',
  contact_email = 'jmoeee21@yahoo.com',
  display_name = 'Fuel & Free Time',
  slug = 'fuelnfreetime',
  worker_name = 'fuelnfreetime',
  d1_database_id = '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
  r2_bucket = 'fuelnfreetime',
  project_status = 'development',
  notes = 'Client: Justin Molaison (Lafayette, LA). Commerce brand + Workers app. Sam platform lane + Connor Stripe lane. Stripe integration pending.',
  updated_at = unixepoch()
WHERE id = 'client_fuelnfreetime';

-- ── projects (canonical build id for todos, time, agent scope) ─────────────────
UPDATE projects
SET
  name = 'Fuel N Free Time',
  client_name = 'Fuel & Free Time',
  client_id = 'client_fuelnfreetime',
  domain = 'fuelnfreetime.com',
  worker_id = 'fuelnfreetime',
  workspace_id = 'ws_fuelnfreetime',
  tenant_id = 'tenant_sam_primeaux',
  status = 'development',
  project_type = COALESCE(NULLIF(TRIM(project_type), ''), 'ecommerce'),
  description = COALESCE(
    NULLIF(TRIM(description), ''),
    'Fuel & Free Time commerce site + Workers app (fuelnfreetime.com). Justin Molaison client. Sam = platform/CMS; Connor = Stripe lane.'
  ),
  tags_json = '["client","fuelnfreetime","ecommerce","mcp","collab"]',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{
      "canonical_project": true,
      "client_id": "client_fuelnfreetime",
      "site": "fuelnfreetime.com",
      "contact_name": "Justin Molaison",
      "contact_email": "jmoeee21@yahoo.com",
      "brief_status": "queued_after_companions",
      "github_repo": "SamPrimeaux/fuelnfreetime",
      "target_domain": "fuelnfreetime.com",
      "workspace_id": "ws_fuelnfreetime",
      "workspace_project_id": "wp_fuelnfreetime"
    }'
  ),
  updated_at = datetime('now')
WHERE id = 'proj_fuelnfreetime';

-- ── client_projects (collaborate ?client= filter + payment ledger) ───────────
INSERT OR IGNORE INTO client_projects (
  id,
  client_name,
  project_name,
  status,
  client_id,
  project_id,
  worker_id,
  tenant_id,
  cloudflare_d1_database_name,
  cloudflare_d1_database_id,
  cloudflare_d1_binding,
  cloudflare_worker_name,
  cloudflare_worker_url,
  github_repo,
  payment_notes,
  created_at,
  updated_at
) VALUES (
  'cp_fuelnfreetime',
  'Fuel & Free Time',
  'Fuel N Free Time — Commerce Platform',
  'active',
  'client_fuelnfreetime',
  'proj_fuelnfreetime',
  'fuelnfreetime',
  'tenant_sam_primeaux',
  'fuelnfreetime',
  '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
  'DB',
  'fuelnfreetime',
  'https://fuelnfreetime.com',
  'https://github.com/SamPrimeaux/fuelnfreetime',
  'Client: Justin Molaison (jmoeee21@yahoo.com). Build queued after Companions site updates. Commerce live without Stripe; Connor lane for payments.',
  datetime('now'),
  datetime('now')
);

UPDATE client_projects
SET
  client_name = 'Fuel & Free Time',
  project_name = 'Fuel N Free Time — Commerce Platform',
  status = 'active',
  client_id = 'client_fuelnfreetime',
  project_id = 'proj_fuelnfreetime',
  worker_id = 'fuelnfreetime',
  tenant_id = 'tenant_sam_primeaux',
  cloudflare_d1_database_name = 'fuelnfreetime',
  cloudflare_d1_database_id = '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
  cloudflare_d1_binding = 'DB',
  cloudflare_worker_name = 'fuelnfreetime',
  cloudflare_worker_url = 'https://fuelnfreetime.com',
  github_repo = 'https://github.com/SamPrimeaux/fuelnfreetime',
  payment_notes = 'Client: Justin Molaison (jmoeee21@yahoo.com). Build queued after Companions site updates. Commerce live without Stripe; Connor lane for payments.',
  updated_at = datetime('now')
WHERE id = 'cp_fuelnfreetime';

-- ── agentsam_workspace (CF binding SSOT for agent chat scope) ────────────────
UPDATE agentsam_workspace
SET
  project_id = 'proj_fuelnfreetime',
  kv_namespace_id = 'bc3b4e3f272e4b46b3c92df6dff85bff',
  deploy_url = 'https://fuelnfreetime.com',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{
      "client_id": "client_fuelnfreetime",
      "client_name": "Fuel & Free Time",
      "client_contact": "Justin Molaison",
      "client_contact_email": "jmoeee21@yahoo.com",
      "projects_table_id": "proj_fuelnfreetime",
      "workspace_project_id": "wp_fuelnfreetime"
    }'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_fuelnfreetime';

-- ── workspace_projects (chat/delivery preset) ────────────────────────────────
UPDATE workspace_projects
SET
  client_company = 'Fuel & Free Time',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{
      "project_id": "proj_fuelnfreetime",
      "projects_table_id": "proj_fuelnfreetime",
      "client_id": "client_fuelnfreetime",
      "target_domain": "fuelnfreetime.com",
      "contact_name": "Justin Molaison",
      "github_repo": "SamPrimeaux/fuelnfreetime",
      "r2_bucket": "fuelnfreetime",
      "brief_status": "queued_after_companions"
    }'
  ),
  updated_at = unixepoch()
WHERE id = 'wp_fuelnfreetime';

-- ── agentsam_project_context (brief rows — keep ctx_* ids, link client) ──────
UPDATE agentsam_project_context
SET
  client_id = 'client_fuelnfreetime',
  updated_at = unixepoch()
WHERE workspace_id = 'ws_fuelnfreetime'
  AND status = 'active';

-- ── time_projects (burn / profit rate tracking lane) ─────────────────────────
INSERT OR IGNORE INTO time_projects (
  project_key,
  label,
  tenant_id,
  workspace_id,
  client_name,
  client_id,
  billing_type,
  description,
  projects_id,
  track_burn,
  is_active,
  created_at
) VALUES (
  'fuelnfreetime',
  'Fuel N Free Time',
  'tenant_sam_primeaux',
  'ws_fuelnfreetime',
  'Fuel & Free Time',
  'client_fuelnfreetime',
  'client_build',
  'fuelnfreetime.com commerce build. Track time + token/cost burn per project (Justin Molaison).',
  'proj_fuelnfreetime',
  1,
  1,
  datetime('now')
);

UPDATE time_projects
SET
  label = 'Fuel N Free Time',
  tenant_id = 'tenant_sam_primeaux',
  workspace_id = 'ws_fuelnfreetime',
  client_name = 'Fuel & Free Time',
  client_id = 'client_fuelnfreetime',
  billing_type = 'client_build',
  description = 'fuelnfreetime.com commerce build. Track time + token/cost burn per project (Justin Molaison).',
  projects_id = 'proj_fuelnfreetime',
  track_burn = 1,
  is_active = 1
WHERE project_key = 'fuelnfreetime';

-- Backfill todo client_id where project already points at fuel
UPDATE agentsam_todo
SET client_id = 'client_fuelnfreetime',
    updated_at = datetime('now')
WHERE project_id = 'proj_fuelnfreetime'
  AND (client_id IS NULL OR TRIM(client_id) = '');

PRAGMA foreign_keys = ON;
