-- 1011: Delete retired / pointless workspace registry rows (operator cull 2026-07-22).
-- Does NOT drop Cloudflare D1 databases — only workspace identity rows + children.
-- Keep live MCP transport ws_inneranimalmedia_mcp; this removes legacy ws_inneranimal_mcp only.

-- Child rows first
DELETE FROM workspace_members WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM tenant_workspaces WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_settings WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_limits WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_domains WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_projects WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_notes WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_usage_metrics WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_connectivity_status WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspace_audit_log WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM agentsam_workspace_blocklist WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM agentsam_workspace_state WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM mcp_workspace_tokens WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);

DELETE FROM agentsam_workspace WHERE id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM workspaces WHERE id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
