-- 693: Meauxbility Foundation — IAM workspace registry (operator nonprofit).
-- Does NOT modify meauxbilityorg D1 or the meauxbility Worker.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/693_meauxbility_iam_workspace.sql

PRAGMA foreign_keys = OFF;

UPDATE workspaces
SET
  name = 'Meauxbility Foundation',
  status = 'active',
  tenant_id = 'tenant_nonprofit_organization',
  github_repo = 'SamPrimeaux/meauxbility',
  updated_at = unixepoch()
WHERE id = 'ws_meauxbility';

INSERT OR IGNORE INTO workspaces (id, name, status, tenant_id, github_repo, created_at, updated_at)
VALUES (
  'ws_meauxbility',
  'Meauxbility Foundation',
  'active',
  'tenant_nonprofit_organization',
  'SamPrimeaux/meauxbility',
  datetime('now'),
  datetime('now')
);

UPDATE agentsam_workspace
SET
  workspace_slug = 'meauxbility',
  tenant_id = 'tenant_nonprofit_organization',
  name = 'Meauxbility Foundation',
  display_name = 'Meauxbility Foundation',
  status = 'active',
  worker_name = 'meauxbility',
  r2_bucket = 'meauxbilityorgfinal',
  r2_prefix = 'meauxbility',
  github_repo = 'SamPrimeaux/meauxbility',
  root_path = '/Users/samprimeaux/meauxbility',
  d1_database_id = '011d1629-b5c8-49e7-8f6d-ca311ba936fe',
  d1_binding = 'DB',
  cloudflare_account_id = 'ede6590ac0d2fb7daf155b35653457b2',
  workspace_ref_id = 'ws_meauxbility',
  metadata_json = json_set(
    json_set(
      json_set(
        json_set(
          json_set(
            json_set(
              json_set(
                json_set(
                  COALESCE(NULLIF(metadata_json, ''), '{}'),
                  '$.cf_account_id', 'ede6590ac0d2fb7daf155b35653457b2'
                ),
                '$.worker', 'meauxbility'
              ),
              '$.worker_base_url', 'https://meauxbility.meauxbility.workers.dev'
            ),
            '$.public_domain', 'meauxbility.org'
          ),
          '$.d1_database_id', '011d1629-b5c8-49e7-8f6d-ca311ba936fe'
        ),
        '$.d1_database_name', 'meauxbilityorg'
      ),
      '$.r2_assets_bucket', 'meauxbilityorgfinal'
    ),
    '$.workspace_kind', 'operator_nonprofit'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_meauxbility';

INSERT OR IGNORE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, workers_involved, r2_buckets_involved,
  domains_involved, notes, created_at, updated_at
)
VALUES (
  'ctx_meauxbility',
  'tenant_nonprofit_organization',
  'ws_meauxbility',
  'meauxbility',
  'Meauxbility Foundation',
  'nonprofit_platform',
  'active',
  88,
  '501(c)(3) nonprofit platform — meauxbility Worker, D1 meauxbilityorg, meauxbility.org. Repo SamPrimeaux/meauxbility. Runbook: docs/clients/meauxbility/runbook.md',
  'meauxbility',
  'meauxbilityorgfinal,allinfrastructure',
  'meauxbility.org,www.meauxbility.org',
  'Migration 693 — operator workspace ws_meauxbility. Reconcile git wrangler with live Worker bindings.',
  unixepoch(),
  unixepoch()
);

UPDATE agentsam_project_context
SET
  workspace_id = 'ws_meauxbility',
  project_key = 'meauxbility',
  project_name = 'Meauxbility Foundation',
  project_type = 'nonprofit_platform',
  description = '501(c)(3) nonprofit — meauxbility Worker, D1 meauxbilityorg, domain meauxbility.org. Git SamPrimeaux/meauxbility. Runbook: docs/clients/meauxbility/runbook.md',
  workers_involved = 'meauxbility',
  r2_buckets_involved = 'meauxbilityorgfinal,allinfrastructure',
  domains_involved = 'meauxbility.org,www.meauxbility.org',
  status = 'active',
  priority = 88,
  notes = 'Migration 693 — operator workspace ws_meauxbility.',
  updated_at = unixepoch()
WHERE id = 'ctx_meauxbility';

PRAGMA foreign_keys = ON;
