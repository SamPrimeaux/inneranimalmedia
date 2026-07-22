-- ============================================================
-- Migration 910: cloudflare_zones full sync + cms_tenants CF link
-- Zone IDs confirmed from CF dashboard by operator 2026-07-22
-- Account: ede6590ac0d2fb7daf155b35653457b2 (IAM primary)
-- ============================================================

-- ── 1. INSERT missing domains that were absent from cloudflare_zones ──────────

INSERT OR IGNORE INTO cloudflare_zones
  (domain_name, cloudflare_zone_id, cloudflare_account_id, status, plan_type)
VALUES
  -- Was missing entirely; confirmed active in CF dashboard
  ('companionsofcaddo.org', '1fc12e66840f552578553108ada5e126', 'ede6590ac0d2fb7daf155b35653457b2', 'active', 'free'),
  ('fuelnfreetime.com',     '816a5d2284103e4481987ceeb16c2ca9', 'ede6590ac0d2fb7daf155b35653457b2', 'active', 'free'),
  ('inneranimals.com',      '5b12f720efb2baaa47a96cd7977de25b', 'ede6590ac0d2fb7daf155b35653457b2', 'active', 'free');

-- ── 2. REMOVE placeholder/fake rows ──────────────────────────────────────────

-- domain-08 through domain-14 were seeded test rows with no real zone IDs
DELETE FROM cloudflare_zones
WHERE cloudflare_zone_id LIKE 'PLACEHOLDER_ZONE_ID_%';

-- acemedicalservices.com was a placeholder — not present in CF dashboard
DELETE FROM cloudflare_zones
WHERE domain_name = 'acemedicalservices.com'
  AND cloudflare_zone_id LIKE 'PLACEHOLDER%';

-- ── 3. ADD infrastructure columns to cms_tenants ─────────────────────────────

ALTER TABLE cms_tenants ADD COLUMN cf_zone_id TEXT;
ALTER TABLE cms_tenants ADD COLUMN domain_mode TEXT NOT NULL DEFAULT 'owned_zone'
  CHECK (domain_mode IN ('owned_zone', 'saas_hostname'));

-- ── 4. POPULATE cf_zone_id on cms_tenants ────────────────────────────────────
-- Source: confirmed zone IDs from CF dashboard + cloudflare_zones table
-- Rule: Worker resolves zone ID from D1 by site slug — never from browser

-- IAM platform (Pro zone)
UPDATE cms_tenants
SET cf_zone_id = '0bab48636c1bea4be4ea61c0c7787c3e'
WHERE domain = 'inneranimalmedia.com';

-- Companions of CPAS (companionsofcaddo.org)
UPDATE cms_tenants
SET cf_zone_id = '1fc12e66840f552578553108ada5e126'
WHERE domain = 'companionsofcaddo.org';

-- Fuel N Free Time
UPDATE cms_tenants
SET cf_zone_id = '816a5d2284103e4481987ceeb16c2ca9'
WHERE domain = 'fuelnfreetime.com';

-- Meauxbility Foundation (Pro zone)
UPDATE cms_tenants
SET cf_zone_id = '2f420b6c582e4ba8d7b1f6ebaf91438b'
WHERE domain = 'meauxbility.org';

-- New Iberia Church of Christ (Pro zone)
UPDATE cms_tenants
SET cf_zone_id = 'e75c2160f16a66e66dd22b948751f112'
WHERE domain = 'newiberiachurchofchrist.com';

-- iAutodidact
UPDATE cms_tenants
SET cf_zone_id = 'eb19eae9f3c5c67086815ab6f6d6cabb'
WHERE domain = 'innerautodidact.com';

-- Paw Love Rescue
UPDATE cms_tenants
SET cf_zone_id = '030d0f520c4026c45d187468a7cc8dc2'
WHERE domain = 'pawloverescue.org';

-- New Creation Peptides
UPDATE cms_tenants
SET cf_zone_id = '94bf97c683d642d4a7b6fe8bd4ee991c'
WHERE domain = 'newcreationpeptides.com';

-- Pelican Peptides
UPDATE cms_tenants
SET cf_zone_id = '671ceff6c7fbb6f936ae2afd4a7d46a8'
WHERE domain = 'pelicanpeptides.com';

-- Anything Floors and More
UPDATE cms_tenants
SET cf_zone_id = '7b9f41bf9647d5b1cc3d190b5d694c18'
WHERE domain = 'anythingfloorsandmore.com';

-- Shinshu Solutions (note: different CF account e3b02eefdc01c8bd458e608e6cffccb8)
UPDATE cms_tenants
SET cf_zone_id = 'dfb7e77927dad19809fcdb4f027f626e'
WHERE domain = 'shinshu-solutions.com';

-- ── 5. SPECIAL CASES ─────────────────────────────────────────────────────────

-- Connor McNeely (leadershiplegacydigital.com) — domain is in client's own DNS,
-- not in IAM CF account. Uses saas_hostname mode when connected.
UPDATE cms_tenants
SET domain_mode = 'saas_hostname'
WHERE slug = 'connor-mcneely';

-- swampbloodgatorguides.com — not present in CF dashboard.
-- cf_zone_id stays NULL until domain is added to CF account.

-- inneranimals.com — in CF account but no cms_tenant row maps to it yet.
-- Zone is tracked in cloudflare_zones; tenant link pending.

-- ── 6. INDEX for fast Worker lookup (slug → cf_zone_id) ──────────────────────

CREATE INDEX IF NOT EXISTS idx_cms_tenants_cf_zone_id
  ON cms_tenants(cf_zone_id)
  WHERE cf_zone_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cms_tenants_domain_mode
  ON cms_tenants(domain_mode);
