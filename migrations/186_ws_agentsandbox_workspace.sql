-- 186: ws_agentsandbox — workspaces row (FK parent), workspace_settings, workspace_projects.
-- IAM workspace shell; TOOLS public origin https://tools.inneranimalmedia.com
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/186_ws_agentsandbox_workspace.sql

INSERT OR IGNORE INTO workspaces (
  id,
  name,
  domain,
  category,
  status,
  cloudflare_plan,
  dns_records_count,
  workers_pages_count,
  logo_url,
  accent_color,
  created_at,
  handle,
  is_system,
  is_archived,
  owner_tenant_id,
  default_tenant_id,
  updated_at,
  theme_id,
  app_id
) VALUES (
  'ws_agentsandbox',
  'IAM Agent sandbox workspace',
  'https://tools.inneranimalmedia.com',
  'entity',
  'active',
  NULL,
  0,
  0,
  NULL,
  NULL,
  datetime('now'),
  'iam_agentsandbox',
  0,
  0,
  'tenant_sam_primeaux',
  'tenant_sam_primeaux',
  datetime('now'),
  'theme-solarized-dark',
  NULL
);

INSERT OR REPLACE INTO workspace_settings (
  workspace_id,
  theme_id,
  accent_color,
  timezone,
  locale,
  settings_json,
  updated_at
) VALUES (
  'ws_agentsandbox',
  'theme-solarized-dark',
  NULL,
  'America/Chicago',
  'en-US',
  '{"toolsPublicOrigin":"https://tools.inneranimalmedia.com","toolsR2Bucket":"tools","iamWorkspaceShellR2Key":"code/iam-workspace-shell.html","iamWorkspaceShellPublicUrl":"https://tools.inneranimalmedia.com/code/iam-workspace-shell.html"}',
  unixepoch()
);

INSERT OR IGNORE INTO workspace_projects (
  id,
  workspace_id,
  tenant_id,
  owner_user_id,
  agent_ai_id,
  name,
  slug,
  description,
  client_company,
  project_type,
  status,
  budget_usd,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'wp_agentsandbox_iam_shell',
  'ws_agentsandbox',
  'tenant_sam_primeaux',
  'usr_sam_primeaux',
  'ai_sam_v1',
  'IAM workspace shell',
  'iam-workspace-shell',
  'Single-file workspace chrome: Explorer, editor tabs, agent column; TOOLS R2 public origin.',
  'Inner Animal Media',
  'internal',
  'active',
  0,
  '{"toolsPublicOrigin":"https://tools.inneranimalmedia.com","r2Bucket":"tools","r2Key":"code/iam-workspace-shell.html"}',
  unixepoch(),
  unixepoch()
);
