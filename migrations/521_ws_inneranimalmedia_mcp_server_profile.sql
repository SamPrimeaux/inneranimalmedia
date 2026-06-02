-- 521: ws_inneranimalmedia_mcp — company-wide MCP worker repo profile (parallel to ws_inneranimalmedia main SaaS).
-- Repo: SamPrimeaux/inneranimalmedia-mcp-server · clone: /Users/samprimeaux/inneranimalmedia-mcp-server
-- Worker: inneranimalmedia-mcp-server @ mcp.inneranimalmedia.com
-- Tenant: tenant_sam_primeaux (operator workspace; not a Wrangler var)
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/521_ws_inneranimalmedia_mcp_server_profile.sql

PRAGMA foreign_keys = OFF;

-- ── Clarify main SaaS workspace labels ─────────────────────────────────────────
UPDATE workspaces
SET
  name = 'Inner Animal Media — Main SaaS',
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

UPDATE agentsam_workspace
SET
  name = 'Inner Animal Media — Main SaaS',
  display_name = 'IAM Main SaaS',
  workspace_slug = COALESCE(NULLIF(trim(workspace_slug), ''), 'inneranimalmedia'),
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'main_saas',
    '$.paired_workspace_id', 'ws_inneranimalmedia_mcp',
    '$.label', 'Parent IAM platform app (SamPrimeaux/inneranimalmedia)'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia';

-- ── workspaces anchor (minimal insert + full update — prod schema varies) ───────
INSERT OR IGNORE INTO workspaces (id, name, status, created_at, updated_at)
VALUES (
  'ws_inneranimalmedia_mcp',
  'Inner Animal Media — MCP Server',
  'active',
  datetime('now'),
  datetime('now')
);

UPDATE workspaces
SET
  name = 'Inner Animal Media — MCP Server',
  domain = 'https://mcp.inneranimalmedia.com',
  tenant_id = 'tenant_sam_primeaux',
  github_repo = 'SamPrimeaux/inneranimalmedia-mcp-server',
  r2_prefix = COALESCE(NULLIF(trim(r2_prefix), ''), 'iam-platform'),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia_mcp';

-- ── agentsam_workspace execution profile ───────────────────────────────────────
INSERT OR IGNORE INTO agentsam_workspace (
  id,
  workspace_slug,
  tenant_id,
  name,
  display_name,
  status
) VALUES (
  'ws_inneranimalmedia_mcp',
  'inneranimalmedia-mcp',
  'tenant_sam_primeaux',
  'Inner Animal Media — MCP Server',
  'IAM MCP Server',
  'active'
);

UPDATE agentsam_workspace
SET
  workspace_slug = 'inneranimalmedia-mcp',
  tenant_id = 'tenant_sam_primeaux',
  name = 'Inner Animal Media — MCP Server',
  display_name = 'IAM MCP Server',
  root_path = '/Users/samprimeaux/inneranimalmedia-mcp-server',
  github_repo = 'SamPrimeaux/inneranimalmedia-mcp-server',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  worker_name = 'inneranimalmedia-mcp-server',
  r2_bucket = 'iam-platform',
  r2_prefix = 'iam-platform',
  workspace_ref_id = 'ws_inneranimalmedia_mcp',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'mcp_server',
    '$.paired_workspace_id', 'ws_inneranimalmedia',
    '$.label', 'Company-wide MCP worker (SamPrimeaux/inneranimalmedia-mcp-server)',
    '$.repo.local_path', '/Users/samprimeaux/inneranimalmedia-mcp-server',
    '$.repo.remote', 'https://github.com/SamPrimeaux/inneranimalmedia-mcp-server',
    '$.repo.branch', 'main',
    '$.github.remotes."SamPrimeaux/inneranimalmedia-mcp-server"',
    'git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git',
    '$.deploy_patterns.full', 'npm run deploy:full',
    '$.deploy_patterns.worker_only', 'npm run deploy',
    '$.deploy_patterns.validate_worker', 'node --check src/index.js'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_inneranimalmedia_mcp';

-- ── workspace_settings (terminal cwd + deploy) ───────────────────────────────
INSERT OR REPLACE INTO workspace_settings (
  workspace_id,
  theme_id,
  timezone,
  locale,
  settings_json,
  updated_at
) VALUES (
  'ws_inneranimalmedia_mcp',
  'theme-solarized-dark',
  'America/Chicago',
  'en-US',
  json_object(
    'workspace_root', '/Users/samprimeaux/inneranimalmedia-mcp-server',
    'workspace_cd_command', 'cd /Users/samprimeaux/inneranimalmedia-mcp-server',
    'github_repo', 'SamPrimeaux/inneranimalmedia-mcp-server',
    'deploy_command', 'npm run deploy:full',
    'deploy_worker_command', 'npm run deploy:full',
    'validate_worker_command', 'node --check src/index.js',
    'terminal_hints', json_object(
      'git_clone_mcp_repo', 'git clone git@github.com-inneranimal-mcp:SamPrimeaux/inneranimalmedia-mcp-server.git',
      'wrangler_tail', 'npx wrangler tail inneranimalmedia-mcp-server',
      'wrangler_deployments', 'npx wrangler deployments list'
    )
  ),
  unixepoch()
);

-- ── Mirror active members from main SaaS workspace ───────────────────────────
INSERT OR IGNORE INTO workspace_members (
  id,
  workspace_id,
  user_id,
  tenant_id,
  role,
  is_active,
  created_at,
  updated_at
)
SELECT
  'wm_mcp_' || substr(replace(lower(wm.user_id), 'au_', ''), 1, 24),
  'ws_inneranimalmedia_mcp',
  wm.user_id,
  'tenant_sam_primeaux',
  wm.role,
  1,
  unixepoch(),
  unixepoch()
FROM workspace_members wm
WHERE wm.workspace_id = 'ws_inneranimalmedia'
  AND COALESCE(wm.is_active, 1) = 1;

PRAGMA foreign_keys = ON;
