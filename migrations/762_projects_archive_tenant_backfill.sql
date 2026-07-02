-- 762: Archive-lane projects without workspace registry rows — inherit platform workspace tenant.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/762_projects_archive_tenant_backfill.sql

UPDATE projects
SET tenant_id = (
  SELECT COALESCE(w.owner_tenant_id, w.default_tenant_id)
  FROM workspaces w
  WHERE w.id = 'ws_inneranimalmedia'
  LIMIT 1
),
updated_at = datetime('now')
WHERE (tenant_id IS NULL OR TRIM(COALESCE(tenant_id, '')) = '')
  AND workspace_id = 'ws_archive_legacy';
