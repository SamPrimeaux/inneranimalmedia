-- 753: Align wp_inneranimalmedia ↔ projects.inneranimalmedia (company focus project).
-- Mirrors 683_fuelnfreetime_project_preset pattern for IAM main workspace.
--
-- Apply:
--   node scripts/d1-apply-pending.mjs --apply --from 753 --to 753

PRAGMA foreign_keys = OFF;

UPDATE projects
SET
  name = 'Inner Animal Media',
  client_name = COALESCE(NULLIF(TRIM(client_name), ''), 'Inner Animal Media'),
  description = 'Primary IAM platform — Agent Sam dashboard, Cloudflare Worker, D1, MCP, Design Studio, and client delivery.',
  workspace_id = 'ws_inneranimalmedia',
  tenant_id = COALESCE(NULLIF(TRIM(tenant_id), ''), 'tenant_sam_primeaux'),
  status = 'production',
  priority = 95,
  project_type = COALESCE(NULLIF(TRIM(project_type), ''), 'saas-product'),
  tags_json = '["starred","platform","primary"]',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"github_repo":"SamPrimeaux/inneranimalmedia","primaryDomain":"inneranimalmedia.com","mcp_repo":"SamPrimeaux/inneranimalmedia-mcp-server","company_focus":true}'
  ),
  updated_at = datetime('now')
WHERE id = 'inneranimalmedia';

UPDATE workspace_projects
SET
  name = 'Inner Animal Media',
  slug = 'inneranimalmedia',
  description = 'Primary IAM platform — Agent Sam dashboard, worker, MCP, and company delivery lane.',
  client_company = 'Inner Animal Media',
  project_type = 'internal',
  status = 'active',
  metadata_json = json_patch(
    COALESCE(metadata_json, '{}'),
    '{"projects_table_id":"inneranimalmedia","primaryDomain":"inneranimalmedia.com","github_repo":"SamPrimeaux/inneranimalmedia","company_focus":true}'
  ),
  updated_at = unixepoch()
WHERE id = 'wp_inneranimalmedia';

-- Archive sandbox/demo cards from the main workspace grid.
UPDATE projects
SET status = 'archived', updated_at = datetime('now')
WHERE id IN ('proj_dora_test_project', 'proj_mr1a1ude_pf7udk')
  AND workspace_id = 'ws_inneranimalmedia';

PRAGMA foreign_keys = ON;
