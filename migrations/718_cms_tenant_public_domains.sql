-- Backfill canonical public domains for CMS tenants (preview URLs, workspace context).
UPDATE cms_tenants SET domain = 'inneranimalmedia.com'
WHERE slug = 'inneranimalmedia' AND (domain IS NULL OR TRIM(domain) = '');

UPDATE cms_tenants SET domain = 'meauxbility.org'
WHERE slug = 'meauxbility' AND (domain IS NULL OR TRIM(domain) = '');

UPDATE cms_tenants SET domain = 'fuelnfreetime.com'
WHERE slug = 'fuelnfreetime' AND (domain IS NULL OR TRIM(domain) = '');

UPDATE cms_tenants SET domain = 'newiberiachurchofchrist.com'
WHERE slug IN ('newiberiachurchofchrist', 'nicoc') AND (domain IS NULL OR TRIM(domain) = '');
