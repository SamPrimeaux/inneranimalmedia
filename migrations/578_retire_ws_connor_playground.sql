-- Retire ws_connor_playground — Connor uses ws_connor_mcneely only.
-- Hard DELETE on workspaces fails: workspace_tool_access FK references dropped agent_commands.
-- Archive + strip membership so the picker never lists it (workspace-access filters is_archived).

DELETE FROM agentsam_user_policy WHERE workspace_id = 'ws_connor_playground';
DELETE FROM workspace_limits WHERE workspace_id = 'ws_connor_playground';
DELETE FROM workspace_members WHERE workspace_id = 'ws_connor_playground';
DELETE FROM agentsam_workspace WHERE id = 'ws_connor_playground';
DELETE FROM user_workspace_settings WHERE workspace_id = 'ws_connor_playground';

UPDATE workspaces
SET status = 'archived',
    is_archived = 1,
    name = 'Connor Playground (retired)',
    display_name = 'Connor Playground (retired)',
    slug = 'connor-playground-retired',
    description = 'Retired 2026-06-05 — use ws_connor_mcneely',
    updated_at = datetime('now')
WHERE id = 'ws_connor_playground';
