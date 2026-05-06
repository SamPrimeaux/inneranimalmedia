PRAGMA foreign_keys = OFF;

-- ─── Enhance tenants with missing operational fields ──────────────────────────
ALTER TABLE tenants ADD COLUMN domain        TEXT;
ALTER TABLE tenants ADD COLUMN plan          TEXT DEFAULT 'agency';
ALTER TABLE tenants ADD COLUMN contact_email TEXT;
ALTER TABLE tenants ADD COLUMN logo_url      TEXT;
ALTER TABLE tenants ADD COLUMN theme_json    TEXT DEFAULT '{}';

-- Backfill from cms_tenants where matched
UPDATE tenants SET
  domain    = (SELECT domain       FROM cms_tenants WHERE cms_tenants.id = tenants.id),
  logo_url  = (SELECT logo_url     FROM cms_tenants WHERE cms_tenants.id = tenants.id),
  theme_json = (SELECT json_object(
    'primary_color', primary_color,
    'secondary_color', secondary_color,
    'theme', theme
  ) FROM cms_tenants WHERE cms_tenants.id = tenants.id)
WHERE id IN ('tenant_connor_mcneely','tenant_sam_primeaux');

-- NICOC slug match (ids differ)
UPDATE tenants SET
  domain   = 'newiberiachurchofchrist.com',
  logo_url = (SELECT logo_url FROM cms_tenants WHERE id='nicoc-cms-2026'),
  theme_json = (SELECT json_object(
    'primary_color', primary_color,
    'secondary_color', secondary_color,
    'theme', theme
  ) FROM cms_tenants WHERE id='nicoc-cms-2026')
WHERE id = 'tenant_newiberia_20260110';

-- Swamp Blood slug match
UPDATE tenants SET
  domain = 'swampbloodgatorguides.com',
  theme_json = (SELECT json_object(
    'primary_color', primary_color,
    'secondary_color', secondary_color,
    'theme', theme
  ) FROM cms_tenants WHERE id='swampbloodgatorguides')
WHERE id = 'tenant_swampblood';

-- Known domains for tenants not in cms_tenants
UPDATE tenants SET domain='inneranimalmedia.com'     WHERE id='tenant_platform';
UPDATE tenants SET domain='inneranimalmedia.com'     WHERE id='tenant_saas';
UPDATE tenants SET domain='inneranimalmedia.com'     WHERE id='tenant_sam_primeaux' AND domain IS NULL;

-- ─── cms_tenants: add FK back to tenants ─────────────────────────────────────
ALTER TABLE cms_tenants ADD COLUMN tenant_ref_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE cms_tenants SET tenant_ref_id = 'tenant_connor_mcneely'    WHERE id = 'tenant_connor_mcneely';
UPDATE cms_tenants SET tenant_ref_id = 'tenant_sam_primeaux'      WHERE id = 'tenant_sam_primeaux';
UPDATE cms_tenants SET tenant_ref_id = 'tenant_newiberia_20260110' WHERE id = 'nicoc-cms-2026';
UPDATE cms_tenants SET tenant_ref_id = 'tenant_swampblood'        WHERE id = 'swampbloodgatorguides';

-- ─── Fix nicoc-tenant-2026 orphaned kanban data ───────────────────────────────
UPDATE kanban_boards  SET tenant_id = 'tenant_nicoc' WHERE tenant_id = 'nicoc-tenant-2026';
UPDATE kanban_columns SET tenant_id = 'tenant_nicoc' WHERE tenant_id = 'nicoc-tenant-2026';
UPDATE kanban_tasks   SET tenant_id = 'tenant_nicoc' WHERE tenant_id = 'nicoc-tenant-2026';

PRAGMA foreign_keys = ON;
