-- 778: CMS operator hub — brand tiles for inneranimalmedia + top client builds on /dashboard/cms.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/778_cms_hub_brand_tiles.sql

PRAGMA foreign_keys = OFF;

-- ── Tenant branding (logo_url editable later via brand_assets / cms_tenants) ──
INSERT OR IGNORE INTO cms_tenants (
  id, name, slug, logo_url, primary_color, secondary_color, theme,
  domain, is_active, tenant_ref_id, created_at, updated_at
) VALUES (
  'inneranimalmedia',
  'Inner Animal Media',
  'inneranimalmedia',
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/avatar',
  '#007AFF',
  '#050508',
  'dark',
  'inneranimalmedia.com',
  1,
  'tenant_sam_primeaux',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO cms_tenants (
  id, name, slug, logo_url, primary_color, secondary_color, theme,
  domain, is_active, tenant_ref_id, created_at, updated_at
) VALUES (
  'companionscpas',
  'Companions of Caddo',
  'companionscpas',
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar',
  '#2f7bff',
  '#1a1a2e',
  'light',
  'companionsofcaddo.org',
  1,
  'tenant_companionscpas',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO cms_tenants (
  id, name, slug, logo_url, primary_color, secondary_color, theme,
  domain, is_active, tenant_ref_id, created_at, updated_at
) VALUES (
  'meauxbility',
  'Meauxbility',
  'meauxbility',
  NULL,
  '#10B981',
  '#0f172a',
  'dark',
  'meauxbility.org',
  1,
  'tenant_sam_primeaux',
  datetime('now'),
  datetime('now')
);

UPDATE cms_tenants SET
  name = 'Inner Animal Media',
  logo_url = COALESCE(NULLIF(TRIM(logo_url), ''), 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/avatar'),
  primary_color = '#007AFF',
  domain = COALESCE(NULLIF(TRIM(domain), ''), 'inneranimalmedia.com'),
  is_active = 1,
  updated_at = datetime('now')
WHERE slug = 'inneranimalmedia';

UPDATE cms_tenants SET
  name = 'Companions of Caddo',
  logo_url = COALESCE(NULLIF(TRIM(logo_url), ''), 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar'),
  primary_color = '#2f7bff',
  domain = COALESCE(NULLIF(TRIM(domain), ''), 'companionsofcaddo.org'),
  is_active = 1,
  updated_at = datetime('now')
WHERE slug = 'companionscpas';

UPDATE cms_tenants SET
  name = 'Fuel N Free Time',
  primary_color = COALESCE(NULLIF(TRIM(primary_color), ''), '#c45c26'),
  domain = COALESCE(NULLIF(TRIM(domain), ''), 'fuelnfreetime.com'),
  is_active = 1,
  updated_at = datetime('now')
WHERE slug = 'fuelnfreetime';

UPDATE cms_tenants SET
  name = 'Meauxbility',
  primary_color = COALESCE(NULLIF(TRIM(primary_color), ''), '#10B981'),
  domain = COALESCE(NULLIF(TRIM(domain), ''), 'meauxbility.org'),
  is_active = 1,
  updated_at = datetime('now')
WHERE slug = 'meauxbility';

-- ── Hub launcher rows on ws_inneranimalmedia (operator CMS setup grid) ────────
INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, notes, created_at, updated_at
) VALUES (
  'ctx_cms_hub_companionscpas',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'companionscpas',
  'Companions of Caddo',
  'cms_site',
  'active',
  92,
  'Client worker CMS — companionsofcaddo.org. Hub launcher from IAM operator workspace.',
  '{"hub_launcher":true,"target_workspace_id":"ws_companionscpas","cms_hosting":"client_worker"}',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, notes, created_at, updated_at
) VALUES (
  'ctx_cms_hub_fuelnfreetime',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'fuelnfreetime',
  'Fuel N Free Time',
  'cms_site',
  'active',
  91,
  'Client worker CMS — fuelnfreetime.com. Hub launcher from IAM operator workspace.',
  '{"hub_launcher":true,"target_workspace_id":"ws_fuelnfreetime","cms_hosting":"client_worker"}',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, notes, created_at, updated_at
) VALUES (
  'ctx_cms_hub_meauxbility',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'meauxbility',
  'Meauxbility',
  'cms_site',
  'active',
  90,
  'BYO runtime CMS — meauxbility.org. Hub launcher from IAM operator workspace.',
  '{"hub_launcher":true,"target_workspace_id":"ws_meauxbility","cms_hosting":"client_worker"}',
  unixepoch(),
  unixepoch()
);

INSERT OR REPLACE INTO agentsam_project_context (
  id, tenant_id, workspace_id, project_key, project_name, project_type,
  status, priority, description, notes, created_at, updated_at
) VALUES (
  'ctx_cms_hub_inneranimalmedia',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia',
  'inneranimalmedia',
  'Inner Animal Media',
  'cms_site',
  'active',
  95,
  'Platform CMS — inneranimalmedia.com. Primary operator site.',
  '{"hub_launcher":true,"target_workspace_id":"ws_inneranimalmedia","cms_hosting":"platform"}',
  unixepoch(),
  unixepoch()
);

PRAGMA foreign_keys = ON;
