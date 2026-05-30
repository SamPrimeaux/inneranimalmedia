-- 468: Browser trust user_id repair + remove stale MCP hop on browser_navigate mirror
-- Fixes "Browser origin not trusted" for assets.inneranimalmedia.com ({USER_ID} placeholder rows)
-- and prevents agentsam_mcp_tools mirror from HTTP 401 via mcp.inneranimalmedia.com.

-- Reassign legacy / placeholder trusted-origin rows to workspace owner user_id
UPDATE agentsam_browser_trusted_origin AS t
SET user_id = (
  SELECT wm.user_id
  FROM workspace_members wm
  WHERE wm.workspace_id = t.workspace_id
    AND wm.role IN ('owner', 'admin')
  ORDER BY CASE wm.role WHEN 'owner' THEN 0 ELSE 1 END, wm.created_at ASC
  LIMIT 1
),
updated_at = datetime('now')
WHERE t.user_id IN ('{USER_ID}', 'sam_primeaux')
  AND EXISTS (
    SELECT 1
    FROM workspace_members wm
    WHERE wm.workspace_id = t.workspace_id
      AND wm.role IN ('owner', 'admin')
  );

-- browser_navigate executes in-worker (handler_type=mybrowser) — no remote MCP invoke
UPDATE agentsam_mcp_tools
SET mcp_service_url = NULL,
    updated_at = unixepoch()
WHERE tool_key = 'browser_navigate'
  AND COALESCE(mcp_service_url, '') != '';
