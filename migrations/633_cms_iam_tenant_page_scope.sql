-- Normalize inneranimalmedia CMS page tenant_id so studio/API scoping is consistent.
-- Root cause: page_home used tenant_inneranimalmedia while work/about used tenant_sam_primeaux,
-- so GET /api/cms/pages/page_home 404'd for ws_inneranimalmedia owners.

UPDATE cms_pages
SET tenant_id = 'tenant_sam_primeaux',
    updated_at = unixepoch()
WHERE project_slug = 'inneranimalmedia'
  AND tenant_id != 'tenant_sam_primeaux';
