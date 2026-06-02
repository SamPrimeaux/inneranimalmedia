-- 522: workspaces anchor row for ws_inneranimalmedia_mcp (521 agentsam row existed; workspaces INSERT missed NOT NULL category).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/522_ws_inneranimalmedia_mcp_workspaces_anchor.sql

PRAGMA foreign_keys = OFF;

INSERT INTO workspaces (
  id,
  name,
  domain,
  category,
  status,
  cloudflare_plan,
  dns_records_count,
  workers_pages_count,
  handle,
  is_system,
  is_archived,
  owner_tenant_id,
  default_tenant_id,
  tenant_id,
  github_repo,
  r2_prefix,
  slug,
  workspace_id,
  worker_id,
  project_id,
  user_id,
  display_name,
  workspace_type,
  org_id,
  description,
  created_at,
  updated_at
)
SELECT
  'ws_inneranimalmedia_mcp',
  'Inner Animal Media — MCP Server',
  'mcp.inneranimalmedia.com',
  category,
  status,
  cloudflare_plan,
  0,
  0,
  'inneranimalmedia-mcp',
  1,
  0,
  owner_tenant_id,
  default_tenant_id,
  'tenant_sam_primeaux',
  'SamPrimeaux/inneranimalmedia-mcp-server',
  'iam-platform',
  'inneranimalmedia-mcp',
  'ws_inneranimalmedia_mcp',
  'inneranimalmedia-mcp-server',
  'inneranimalmedia-mcp-server',
  user_id,
  'IAM MCP Server',
  workspace_type,
  org_id,
  'Company-wide MCP worker — SamPrimeaux/inneranimalmedia-mcp-server @ mcp.inneranimalmedia.com',
  datetime('now'),
  unixepoch()
FROM workspaces
WHERE id = 'ws_inneranimalmedia';

PRAGMA foreign_keys = ON;
