-- 672: Archive misleading platform D1 fuel CMS seed (content SSOT = fuelnfreetime D1).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/672_archive_platform_fuel_pages.sql

UPDATE cms_pages
SET
  status = 'archived',
  updated_at = unixepoch()
WHERE project_slug = 'fuelnfreetime'
  AND status != 'archived';

UPDATE cms_page_sections
SET is_visible = 0, updated_at = datetime('now')
WHERE page_id IN (
  SELECT id FROM cms_pages WHERE project_slug = 'fuelnfreetime' AND status = 'archived'
);
