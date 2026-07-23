-- 1009: Delete pointless shell workspaces ws_platform and ws_system.
-- No D1 bindings, no workers, no members. Platform authority is ws_inneranimalmedia.
-- Do not recreate.

DELETE FROM tenant_workspaces WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_members WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_settings WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_limits WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_domains WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_projects WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_notes WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_usage_metrics WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_connectivity_status WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM workspace_audit_log WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM agentsam_workspace_blocklist WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM agentsam_workspace_state WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM mcp_workspace_tokens WHERE workspace_id IN ('ws_platform', 'ws_system');
DELETE FROM agentsam_workspace WHERE id IN ('ws_platform', 'ws_system');
DELETE FROM workspaces WHERE id IN ('ws_platform', 'ws_system');
