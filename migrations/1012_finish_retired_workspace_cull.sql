-- 1012: Finish cull from 1011 — delete FK children that blocked workspaces DELETE.
-- 1011 rolled back as a batch; ad-hoc deletes already removed most registry rows.
-- This migration is idempotent and clears remaining ws_swampblood / ws_sandbox shells.

DELETE FROM dashboard_assets WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM quality_runs WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM image_generation_variants WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM image_generation_jobs WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM image_metadata WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM images WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM cicd_runs WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM cicd_events WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM pipelines WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM events WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);
DELETE FROM decisions WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);

-- tenants.workspace_id soft pointer (blocks workspaces DELETE when set)
UPDATE tenants
SET workspace_id = NULL
WHERE workspace_id IN (
  'ws_swampblood','ws_swampblood_worker','ws_natashacloteaux','ws_justinmolaison',
  'ws_dylanhollier','ws_agentsam_sandbox_build','ws_aitestsandbox','ws_aitestsuite',
  'ws_sandbox','ws_demoworkspace','ws_inneranimal_mcp'
);

-- Known child tables from 1011 (idempotent)
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
