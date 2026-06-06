-- 596: agentsam_workspace SSOT backfill (9 infra rows) + Mad Apologetics cleanup + retire Connor playground row.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/596_agentsam_workspace_ssot_backfill_mad_apologetics.sql

PRAGMA foreign_keys = OFF;

-- ── Mad Apologetics tenant + workspace hygiene ───────────────────────────────
UPDATE tenants
SET name = 'Mad Apologetics',
    contact_email = 'mad.apologetics@gmail.com',
    updated_at = unixepoch()
WHERE id = 'tenant_mad_apologetics';

DELETE FROM tenant_workspaces WHERE workspace_id = 'ws_madapologetics';

INSERT OR IGNORE INTO tenant_workspaces (
  id, tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at
) VALUES (
  'tws_mad_apologetics_default',
  'tenant_mad_apologetics',
  'ws_mad_apologetics',
  'owner',
  1,
  1,
  unixepoch(),
  unixepoch()
);

UPDATE tenant_workspaces
SET is_default = 1, is_active = 1, role = 'owner', updated_at = unixepoch()
WHERE tenant_id = 'tenant_mad_apologetics' AND workspace_id = 'ws_mad_apologetics';

DELETE FROM workspaces WHERE id = 'ws_madapologetics';

INSERT OR IGNORE INTO agentsam_workspace (
  id, workspace_slug, tenant_id, name, display_name, status, created_at, updated_at
) VALUES (
  'ws_mad_apologetics',
  'mad-apologetics',
  'tenant_mad_apologetics',
  'Mad Apologetics',
  'Mad Apologetics',
  'active',
  unixepoch(),
  unixepoch()
);

INSERT OR IGNORE INTO workspace_limits (workspace_id, limits_json, updated_at)
VALUES ('ws_mad_apologetics', '{}', unixepoch());

-- ── Connor playground — hard remove (578 archived; strip stragglers) ───────────
DELETE FROM agentsam_user_policy WHERE workspace_id = 'ws_connor_playground';
DELETE FROM workspace_limits WHERE workspace_id = 'ws_connor_playground';
DELETE FROM workspace_members WHERE workspace_id = 'ws_connor_playground';
DELETE FROM user_workspace_settings WHERE workspace_id = 'ws_connor_playground';
DELETE FROM workspaces WHERE id = 'ws_connor_playground';

-- ── Backfill: seed from workspaces for rows missing in agentsam_workspace ─────
INSERT OR IGNORE INTO agentsam_workspace (
  id, workspace_slug, tenant_id, name, display_name, description,
  status, r2_prefix, github_repo, default_model_id, primary_subagent_id,
  created_at, updated_at
)
SELECT
  w.id,
  COALESCE(NULLIF(trim(w.slug), ''), NULLIF(trim(w.handle), ''), replace(w.id, 'ws_', '')),
  w.tenant_id,
  w.name,
  COALESCE(NULLIF(trim(w.display_name), ''), w.name),
  w.description,
  COALESCE(NULLIF(trim(w.status), ''), 'active'),
  w.r2_prefix,
  w.github_repo,
  w.default_model_id,
  w.primary_subagent_id,
  COALESCE(w.created_at, unixepoch()),
  COALESCE(w.updated_at, unixepoch())
FROM workspaces w
WHERE w.id IN (
  'ws_iam_mcp', 'ws_iam_tail', 'ws_iam_pty', 'ws_agent', 'ws_pawloverescue',
  'ws_sam_work_cf', 'ws_aitestsandbox', 'ws_agentsandbox', 'ws_aitestsuite'
);

-- ── ws_iam_mcp — MCP server execution profile ────────────────────────────────
UPDATE agentsam_workspace
SET
  workspace_slug = 'iam_mcp',
  tenant_id = 'tenant_sam_primeaux',
  name = 'IAM MCP Server',
  display_name = 'IAM MCP Server',
  root_path = '/Users/samprimeaux/inneranimalmedia-mcp-server',
  github_repo = 'SamPrimeaux/inneranimalmedia-mcp-server',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  worker_name = 'inneranimalmedia-mcp-server',
  r2_prefix = COALESCE(NULLIF(trim(r2_prefix), ''), 'iam-platform'),
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.bindings',
    COALESCE(json_extract((SELECT settings_json FROM workspaces WHERE id = 'ws_iam_mcp'), '$.bindings'), json('{}')),
    '$.workspace_kind', 'mcp_server',
    '$.paired_workspace_id', 'ws_inneranimalmedia'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_iam_mcp';

-- ── ws_iam_tail ───────────────────────────────────────────────────────────────
UPDATE agentsam_workspace
SET
  workspace_slug = 'iam_tail',
  tenant_id = 'tenant_sam_primeaux',
  name = 'IAM Tail Worker',
  display_name = 'IAM Tail Worker',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  worker_name = 'inneranimalmedia-tail',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.bindings',
    COALESCE(json_extract((SELECT settings_json FROM workspaces WHERE id = 'ws_iam_tail'), '$.bindings'), json('{}')),
    '$.workspace_kind', 'tail_worker'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_iam_tail';

-- ── ws_iam_pty ────────────────────────────────────────────────────────────────
UPDATE agentsam_workspace
SET
  workspace_slug = 'iam_pty',
  tenant_id = 'tenant_sam_primeaux',
  name = 'IAM PTY Terminal Server',
  display_name = 'IAM PTY Terminal Server',
  root_path = '/Users/samprimeaux/iam-pty',
  github_repo = 'SamPrimeaux/iam-pty',
  worker_name = 'iam-pty',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'pty_server'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_iam_pty';

-- ── ws_agent — mobile dashboard ───────────────────────────────────────────────
UPDATE agentsam_workspace
SET
  workspace_slug = 'agent',
  tenant_id = 'tenant_sam_primeaux',
  name = 'Agent Mobile Dashboard',
  display_name = 'Agent Mobile Dashboard',
  github_repo = 'SamPrimeaux/mobiledashboard',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.workspace_kind', 'mobile_dashboard'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_agent';

-- ── ws_pawloverescue — client BYO bindings ────────────────────────────────────
UPDATE agentsam_workspace
SET
  workspace_slug = 'pawlove',
  tenant_id = 'tenant_pawlove',
  name = 'Paw Love Rescue',
  display_name = 'Paw Love Rescue',
  r2_prefix = 'pawlove',
  d1_database_id = '83edd823-98b9-485b-9ef9-8d34dffe8927',
  d1_binding = 'DB',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.bindings',
    COALESCE(json_extract((SELECT settings_json FROM workspaces WHERE id = 'ws_pawloverescue'), '$.bindings'), json('{}')),
    '$.workspace_kind', 'client'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_pawloverescue';

-- ── ws_sam_work_cf — secondary CF account ─────────────────────────────────────
UPDATE agentsam_workspace
SET
  workspace_slug = 'sam-work-cf',
  tenant_id = 'tenant_sam_primeaux',
  name = 'Sam Work CF (Secondary Account)',
  display_name = 'samprimeauxwork.workers.dev',
  d1_database_id = '0790e2f0-f113-4f09-8ab0-f8865e55d880',
  d1_binding = 'DB',
  metadata_json = json_set(
    COALESCE(metadata_json, '{}'),
    '$.cf_account_id', 'e8d0359c2ad85845814f446f4dd174ea',
    '$.cloudflare_account_id', 'e8d0359c2ad85845814f446f4dd174ea',
    '$.d1_databases', json('[{"name":"companionscpas","id":"0790e2f0-f113-4f09-8ab0-f8865e55d880"}]'),
    '$.workspace_kind', 'secondary_cf_account'
  ),
  updated_at = unixepoch()
WHERE id = 'ws_sam_work_cf';

-- ── Platform test sandboxes (limits/metrics continuity) ───────────────────────
UPDATE agentsam_workspace
SET
  workspace_slug = COALESCE(NULLIF(trim(workspace_slug), ''), 'iam_aitestsandbox'),
  tenant_id = 'tenant_sam_primeaux',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  worker_name = 'aitesting',
  metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.workspace_kind', 'test_sandbox'),
  updated_at = unixepoch()
WHERE id = 'ws_aitestsandbox';

UPDATE agentsam_workspace
SET
  workspace_slug = COALESCE(NULLIF(trim(workspace_slug), ''), 'iam_agentsandbox'),
  tenant_id = 'tenant_sam_primeaux',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.workspace_kind', 'test_sandbox'),
  updated_at = unixepoch()
WHERE id = 'ws_agentsandbox';

UPDATE agentsam_workspace
SET
  workspace_slug = COALESCE(NULLIF(trim(workspace_slug), ''), 'aitestsuite'),
  tenant_id = 'tenant_sam_primeaux',
  d1_database_id = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49',
  d1_binding = 'DB',
  metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.workspace_kind', 'test_sandbox'),
  updated_at = unixepoch()
WHERE id = 'ws_aitestsuite';

PRAGMA foreign_keys = ON;
