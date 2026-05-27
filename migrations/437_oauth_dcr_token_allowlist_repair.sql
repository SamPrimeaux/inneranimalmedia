-- 437: Repair OAuth tokens minted for DCR clients (ChatGPT) with allowed_tools='[]'.
-- Root cause: iam_dcr_* clients had zero rows in agentsam_mcp_oauth_tool_allowlist at token issue.

UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT tool_key
    FROM agentsam_mcp_oauth_tool_allowlist
    WHERE client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(is_active, 1) = 1
    ORDER BY sort_order ASC, tool_key ASC
  )
)
WHERE token_type = 'oauth'
  AND COALESCE(is_active, 1) = 1
  AND (
    allowed_tools IS NULL
    OR trim(allowed_tools) IN ('', '[]', 'null')
  );
