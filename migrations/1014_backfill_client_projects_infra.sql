-- 1014: Backfill client_projects worker/github from curated workspace infra.
-- Does NOT touch payments_received / total_invoiced.
-- Also align client_projects.tenant_id to the real client tenant (was wrongly Sam for several).

-- Anything Floors
UPDATE client_projects SET
  tenant_id = 'tenant_anything_floors_2026',
  cloudflare_worker_name = COALESCE(NULLIF(TRIM(cloudflare_worker_name), ''), 'anything-floors-and-more'),
  cloudflare_d1_database_id = COALESCE(NULLIF(TRIM(cloudflare_d1_database_id), ''), '0a48e8da-61e9-427d-a6e2-231743b20e60'),
  cloudflare_worker_url = COALESCE(NULLIF(TRIM(cloudflare_worker_url), ''), 'https://anything-floors-and-more.sam-primeaux.workers.dev'),
  updated_at = unixepoch()
WHERE id = 'anything-floors-and-more-2026';

-- Shinshu (github lives on workspaces.ws_shinshusolutions)
UPDATE client_projects SET
  tenant_id = 'tenant_jake_waalk',
  github_repo = COALESCE(NULLIF(TRIM(github_repo), ''), 'https://github.com/SamPrimeaux/shinshusolutions'),
  cloudflare_worker_name = COALESCE(NULLIF(TRIM(cloudflare_worker_name), ''), 'shinshusolutions'),
  updated_at = unixepoch()
WHERE id = 'shinshu-solutions-2026';

-- New Iberia Church
UPDATE client_projects SET
  tenant_id = 'tenant_newiberia_20260110',
  cloudflare_worker_name = COALESCE(NULLIF(TRIM(cloudflare_worker_name), ''), 'new-iberia-church'),
  cloudflare_d1_database_id = COALESCE(NULLIF(TRIM(cloudflare_d1_database_id), ''), 'f9922d1f-79ce-4b85-95f1-b423bbe6413a'),
  updated_at = unixepoch()
WHERE id = 'new-iberia-church-of-christ-2026';

-- Paw Love
UPDATE client_projects SET
  tenant_id = 'tenant_pawlove',
  cloudflare_worker_name = COALESCE(NULLIF(TRIM(cloudflare_worker_name), ''), 'pawlove'),
  cloudflare_d1_database_id = COALESCE(NULLIF(TRIM(cloudflare_d1_database_id), ''), '83edd823-98b9-485b-9ef9-8d34dffe8927'),
  updated_at = unixepoch()
WHERE id = 'paw-love-rescue-2026';

-- Pelican Peptides
UPDATE client_projects SET
  tenant_id = 'tenant_pelican_peptides',
  cloudflare_worker_name = COALESCE(NULLIF(TRIM(cloudflare_worker_name), ''), 'pelicanpeptides'),
  cloudflare_d1_database_id = COALESCE(NULLIF(TRIM(cloudflare_d1_database_id), ''), '7c917568-399a-4b53-85e5-a1430c24edbf'),
  updated_at = unixepoch()
WHERE id = 'pelican-peptides-2026';

-- New Creation Health (ncnh)
UPDATE client_projects SET
  tenant_id = 'tenant_kearn_dooley_ncnh',
  updated_at = unixepoch()
WHERE id = 'new-creation-health-2026';

-- Normalize fuel/companions github to owner/repo form when already present
UPDATE client_projects SET
  github_repo = 'https://github.com/SamPrimeaux/fuelnfreetime',
  updated_at = unixepoch()
WHERE id = 'cp_fuelnfreetime'
  AND (github_repo IS NULL OR github_repo NOT LIKE '%fuelnfreetime%');

UPDATE client_projects SET
  github_repo = 'https://github.com/SamPrimeaux/companionscpas',
  updated_at = unixepoch()
WHERE id = 'cp_companionscpas'
  AND (github_repo IS NULL OR github_repo NOT LIKE '%companionscpas%');

-- Orphans without curated workspace infra: detach from tenant_sam_primeaux so
-- JOIN workspaces ON tenant_id does not false-match platform github_repo rows.
UPDATE client_projects SET
  tenant_id = 'tenant_swampblood',
  updated_at = unixepoch()
WHERE id = 'swampblood-gator-guides-2026';

UPDATE client_projects SET
  tenant_id = 'tenant_ace_medical',
  updated_at = unixepoch()
WHERE id = 'ace-medical-2026';
