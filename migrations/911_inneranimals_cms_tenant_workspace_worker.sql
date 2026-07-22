-- ============================================================
-- Migration 911: inneranimals.com — cms_tenant + workspace + worker
-- Worker: inneranimals (renamed from agentsam-cms-python)
-- Worker URL: inneranimals.meauxbility.workers.dev
-- Custom domain: inneranimals.com (Production)
-- Zone ID: 5b12f720efb2baaa47a96cd7977de25b
-- D1: inneranimal (5a83c57d-945d-4e09-81f1-f5cd8e72e32e)
-- R2: cms bucket
-- KV: production-KV_SESSIONS (dc87920b0a9247979a213c09df9a0234)
-- Hyperdrive: inneranimalmedia-supabase-hyperdrive (08183bb9d2914e87ac8395d7e4ecff60)
-- Git: SamPrimeaux/studio-cms-editor (CF Builds connected)
-- Account: ede6590ac0d2fb7daf155b35653457b2
-- ============================================================

-- ── 1. cms_tenants entry ─────────────────────────────────────────────────────
-- inneranimals.com = ecommerce / clothing brand / inspiration site
-- Scaffolding is fresh — studio-cms-editor repo is the build source
-- cf_zone_id and domain_mode columns added in migration 910

INSERT OR IGNORE INTO cms_tenants (
  id,
  name,
  slug,
  domain,
  primary_color,
  secondary_color,
  theme,
  is_active,
  settings,
  cf_zone_id,
  domain_mode,
  created_at,
  updated_at
) VALUES (
  'inneranimals',
  'Inner Animals',
  'inneranimals',
  'inneranimals.com',
  '#6358ff',
  '#09090b',
  'dark',
  1,
  json_object(
    'description',      'Ecommerce, clothing brand, and inspiration site',
    'worker_name',      'inneranimals',
    'git_repo',         'SamPrimeaux/studio-cms-editor',
    'cf_builds',        true,
    'd1_database_id',   '5a83c57d-945d-4e09-81f1-f5cd8e72e32e',
    'd1_binding',       'DB',
    'r2_bucket',        'cms',
    'r2_binding',       'ASSETS_BUCKET',
    'kv_namespace_id',  'dc87920b0a9247979a213c09df9a0234',
    'kv_binding',       'SESSION_CACHE',
    'hyperdrive_id',    '08183bb9d2914e87ac8395d7e4ecff60',
    'hyperdrive_binding','HYPERDRIVE',
    'worker_url',       'inneranimals.meauxbility.workers.dev',
    'scaffold_status',  'fresh'
  ),
  '5b12f720efb2baaa47a96cd7977de25b',
  'owned_zone',
  unixepoch(),
  unixepoch()
);

-- ── 2. worker_registry entry ──────────────────────────────────────────────────

INSERT OR IGNORE INTO worker_registry (
  id,
  worker_name,
  worker_type,
  script_name,
  routes,
  bindings_count,
  bindings_detail,
  deployment_status,
  git_repo,
  priority,
  d1_databases,
  r2_buckets,
  hyperdrive_id,
  account_id,
  workers_dev_subdomain,
  zone_id,
  tenant_id,
  entity_status,
  notes,
  created_at,
  updated_at
) VALUES (
  'worker_inneranimals',
  'inneranimals',
  'production',
  'inneranimals',
  json_array('inneranimals.com/*'),
  5,
  json_object(
    'ASSETS',         json_object('type', 'assets',     'binding', 'ASSETS'),
    'ASSETS_BUCKET',  json_object('type', 'r2',         'bucket', 'cms'),
    'DB',             json_object('type', 'd1',         'database_id', '5a83c57d-945d-4e09-81f1-f5cd8e72e32e', 'database_name', 'inneranimal'),
    'SESSION_CACHE',  json_object('type', 'kv',         'namespace_id', 'dc87920b0a9247979a213c09df9a0234', 'namespace_name', 'production-KV_SESSIONS'),
    'HYPERDRIVE',     json_object('type', 'hyperdrive',  'config_id', '08183bb9d2914e87ac8395d7e4ecff60', 'config_name', 'inneranimalmedia-supabase-hyperdrive'),
    'MYBROWSER',      json_object('type', 'browser_run', 'binding', 'MYBROWSER')
  ),
  'active',
  'SamPrimeaux/studio-cms-editor',
  'high',
  json_array(json_object(
    'binding', 'DB',
    'database_name', 'inneranimal',
    'database_id', '5a83c57d-945d-4e09-81f1-f5cd8e72e32e'
  )),
  json_array(json_object(
    'binding', 'ASSETS_BUCKET',
    'bucket_name', 'cms'
  )),
  '08183bb9d2914e87ac8395d7e4ecff60',
  'ede6590ac0d2fb7daf155b35653457b2',
  'inneranimals.meauxbility.workers.dev',
  '5b12f720efb2baaa47a96cd7977de25b',
  'tenant_sam_primeaux',
  'active',
  'Renamed from agentsam-cms-python. CF Builds connected to SamPrimeaux/studio-cms-editor. Fresh scaffold — inneranimals.com ecommerce/clothing/inspiration brand.',
  unixepoch(),
  unixepoch()
);

-- ── 3. agentsam_workspace entry ───────────────────────────────────────────────

INSERT OR IGNORE INTO agentsam_workspace (
  id,
  workspace_slug,
  tenant_id,
  project_slug,
  name,
  description,
  r2_bucket,
  r2_prefix,
  github_repo,
  worker_name,
  d1_database_id,
  d1_binding,
  kv_namespace_id,
  cloudflare_account_id,
  deploy_url,
  status,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'ws_inneranimals',
  'ws_inneranimals',
  'tenant_sam_primeaux',
  'inneranimals',
  'Inner Animals',
  'Ecommerce, clothing brand, and inspiration site. Worker: inneranimals. Fresh scaffold on studio-cms-editor repo.',
  'cms',
  'inneranimals/',
  'SamPrimeaux/studio-cms-editor',
  'inneranimals',
  '5a83c57d-945d-4e09-81f1-f5cd8e72e32e',
  'DB',
  'dc87920b0a9247979a213c09df9a0234',
  'ede6590ac0d2fb7daf155b35653457b2',
  'https://inneranimals.com',
  'active',
  json_object(
    'cf_zone_id',       '5b12f720efb2baaa47a96cd7977de25b',
    'hyperdrive_id',    '08183bb9d2914e87ac8395d7e4ecff60',
    'hyperdrive_name',  'inneranimalmedia-supabase-hyperdrive',
    'r2_binding',       'ASSETS_BUCKET',
    'kv_binding',       'SESSION_CACHE',
    'hyperdrive_binding','HYPERDRIVE',
    'browser_binding',  'MYBROWSER',
    'workers_dev_url',  'inneranimals.meauxbility.workers.dev',
    'scaffold_status',  'fresh',
    'site_type',        'ecommerce',
    'brand_tags',       json_array('clothing', 'ecommerce', 'inspiration')
  ),
  unixepoch(),
  unixepoch()
);

-- ── 4. cloudflare_zones — inneranimals.com was inserted in migration 910 ──────
-- Zone ID 5b12f720efb2baaa47a96cd7977de25b already present.
-- Just update the plan metadata now that we know it's Free tier.
UPDATE cloudflare_zones
SET
  plan_type  = 'free',
  status     = 'active',
  updated_at = unixepoch()
WHERE cloudflare_zone_id = '5b12f720efb2baaa47a96cd7977de25b';
