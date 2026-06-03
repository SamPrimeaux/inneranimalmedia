-- Platform i-am-master bearer used stale legacy tool names (d1_query, r2_get, …).
-- agentsam_tools SSOT uses agentsam_* tool_key; restricted legacy JSON → empty tools/list.
UPDATE mcp_workspace_tokens
SET allowed_tools = NULL
WHERE label = 'i-am-master'
  AND workspace_id = 'ws_inneranimalmedia'
  AND COALESCE(is_active, 0) = 1
  AND allowed_tools IS NOT NULL
  AND allowed_tools LIKE '%d1_query%';
