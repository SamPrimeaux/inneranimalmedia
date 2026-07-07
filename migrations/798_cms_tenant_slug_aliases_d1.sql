-- 798: CMS tenant slug aliases in D1 — replaces hardcoded CMS_TENANT_SLUG_ALIASES in app code.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/798_cms_tenant_slug_aliases_d1.sql

UPDATE cms_tenants
SET
  settings = json_patch(
    CASE
      WHEN settings IS NULL OR trim(settings) = '' THEN '{}'
      WHEN json_valid(settings) THEN settings
      ELSE '{}'
    END,
    '{"slug_aliases":["nicoc"]}'
  ),
  updated_at = datetime('now')
WHERE slug = 'newiberiachurchofchrist';

UPDATE agentsam_project_context
SET
  notes = CASE
    WHEN notes IS NULL OR trim(notes) = '' THEN
      '{"canonical_tenant_slug":"newiberiachurchofchrist"}'
    WHEN json_valid(notes) THEN
      json_patch(notes, '{"canonical_tenant_slug":"newiberiachurchofchrist"}')
    ELSE
      json_object('legacy_note', notes, 'canonical_tenant_slug', 'newiberiachurchofchrist')
  END,
  updated_at = unixepoch()
WHERE project_key = 'nicoc'
  AND project_type = 'cms_site';
