-- 476: GitHub + R2 tools fully available for Agent Sam dashboard + OAuth MCP (owner path).
-- GitHub catalog dispatch uses github-worker handlers (operation: get_file|update_file|…).
-- R2 agent surface: object get/put/delete only (Wrangler parity — no bucket create/list in agent tools).

-- Clear stale approval flags (runtime gates already disabled).
UPDATE agentsam_tools
SET requires_approval = 0, updated_at = unixepoch()
WHERE tool_name IN ('r2_write', 'r2_delete', 'github_update_file', 'github_create_file', 'agentsam_r2_write', 'agentsam_r2_upload')
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_mcp_tools
SET requires_approval = 0, updated_at = unixepoch()
WHERE tool_key IN ('r2_write', 'r2_delete', 'github_update_file', 'github_create_file', 'agentsam_r2_write', 'agentsam_r2_upload')
  AND COALESCE(is_active, 1) = 1;

-- OAuth MCP allowlist: R2 delete + confirm write aliases.
INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (client_id, tool_key, access_class, sort_order, notes) VALUES
  ('iam_mcp_inneranimalmedia', 'r2_delete', 'write', 121, 'Delete R2 object (explicit bucket+key)'),
  ('iam_mcp_inneranimalmedia', 'agentsam_r2_delete', 'write', 122, 'MCP alias: r2_delete');

UPDATE agentsam_tools
SET description = COALESCE(description, '') || ' [Agent: r2 object get — pass bucket+key; maps to Wrangler r2 object get.]',
    updated_at = unixepoch()
WHERE tool_key IN ('r2_read', 'agentsam_r2_read')
  AND COALESCE(description, '') NOT LIKE '%r2 object get%';

UPDATE agentsam_tools
SET description = COALESCE(description, '') || ' [Agent: r2 object put — pass bucket+key+content; maps to Wrangler r2 object put.]',
    updated_at = unixepoch()
WHERE tool_key IN ('r2_write', 'agentsam_r2_write', 'agentsam_r2_upload')
  AND COALESCE(description, '') NOT LIKE '%r2 object put%';
