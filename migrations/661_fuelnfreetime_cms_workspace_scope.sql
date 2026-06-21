-- 661: Fuel CMS — workspace-scoped site registry (no tenant catalog impersonation).
-- Authorization is workspace_id + cms_site project_context, not cross-tenant identity routing.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/661_fuelnfreetime_cms_workspace_scope.sql

UPDATE cms_tenants
SET
  tenant_ref_id = NULL,
  updated_at = datetime('now')
WHERE slug = 'fuelnfreetime';

UPDATE agentsam_project_context
SET
  notes = COALESCE(notes, '') || ' Auth: workspace_members + cms_site registry only — never substitute another user tenant_id.',
  updated_at = unixepoch()
WHERE id = 'ctx_cms_fuelnfreetime'
  AND COALESCE(notes, '') NOT LIKE '%never substitute another user tenant_id%';
