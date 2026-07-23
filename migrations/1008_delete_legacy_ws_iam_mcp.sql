-- 1008: Delete legacy fake MCP workspace id `ws_iam_mcp`.
-- Ground truth: Cloudflare Worker env WORKSPACE_ID = ws_inneranimalmedia_mcp
-- (inneranimalmedia-mcp-server). Platform authority workspace remains ws_inneranimalmedia.
-- Do not recreate ws_iam_mcp.

DELETE FROM workspace_members WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM tenant_workspaces WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_settings WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_limits WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_domains WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_projects WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_notes WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_usage_metrics WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_connectivity_status WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspace_audit_log WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM agentsam_workspace_blocklist WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM agentsam_workspace_state WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM agentsam_workspace WHERE id = 'ws_iam_mcp';
DELETE FROM mcp_workspace_tokens WHERE workspace_id = 'ws_iam_mcp';
DELETE FROM workspaces WHERE id = 'ws_iam_mcp';

-- Re-home the tenant→MCP deploy link that incorrectly lived on ws_iam_mcp.
INSERT INTO tenant_workspaces (
  id, tenant_id, workspace_id, role, is_default, is_active,
  created_at, updated_at, github_repo, github_branch, worker_name, live_url,
  r2_bucket, deploy_type
)
SELECT
  'tws_inneranimalmedia_mcp',
  'tenant_sam_primeaux',
  'ws_inneranimalmedia_mcp',
  'owner',
  0,
  1,
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER),
  'https://github.com/SamPrimeaux/inneranimalmedia-mcp-server',
  'main',
  'inneranimalmedia-mcp-server',
  'https://mcp.inneranimalmedia.com',
  NULL,
  'cloudflare_worker'
WHERE EXISTS (SELECT 1 FROM workspaces WHERE id = 'ws_inneranimalmedia_mcp')
  AND NOT EXISTS (
    SELECT 1 FROM tenant_workspaces WHERE workspace_id = 'ws_inneranimalmedia_mcp'
  );
