-- 761: Backfill tenant_id on legacy projects so Supabase mirror cannot skip rows.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=migrations/761_projects_backfill_tenant_id.sql

UPDATE projects
SET tenant_id = (
  SELECT COALESCE(w.owner_tenant_id, w.default_tenant_id)
  FROM workspaces w
  WHERE w.id = projects.workspace_id
  LIMIT 1
),
updated_at = datetime('now')
WHERE tenant_id IS NULL OR TRIM(COALESCE(tenant_id, '')) = '';
