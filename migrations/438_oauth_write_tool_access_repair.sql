-- 438: Repair ChatGPT/DCR OAuth tokens — empty oauth_tool_access + missing iam:agent.
-- Root cause: DCR client_id had 0 allowlist rows at mint → oauth_tool_access {}.
-- tools/list discovery is fixed in MCP 2.6.19+; this repairs stored token snapshots.

-- 1) Grant iam:agent on active OAuth MCP tokens that carry write tools in allowed_tools.
UPDATE mcp_workspace_tokens
SET scopes_json = '["iam:profile","iam:workspaces","mcp:tools","mcp:userinfo","iam:agent"]'
WHERE COALESCE(is_active, 1) = 1
  AND COALESCE(revoked_at, 0) = 0
  AND lower(COALESCE(token_type, '')) = 'oauth'
  AND (
    allowed_tools LIKE '%agentsam_db_write%'
    OR allowed_tools LIKE '%d1_write%'
  )
  AND (scopes_json IS NULL OR scopes_json NOT LIKE '%iam:agent%');

-- 2) Rebuild oauth_tool_access from canonical catalog (all active allowlist tools).
UPDATE mcp_workspace_tokens
SET allowed_domains_json = json_set(
      COALESCE(allowed_domains_json, '{}'),
      '$.oauth_tool_access',
      COALESCE(
        (
          SELECT json_group_object(
            tool_key,
            CASE WHEN lower(access_class) = 'write' THEN 'write' ELSE 'read' END
          )
            FROM agentsam_mcp_oauth_tool_allowlist
           WHERE client_id = 'iam_mcp_inneranimalmedia'
             AND COALESCE(is_active, 1) = 1
        ),
        '{}'
      )
    )
WHERE COALESCE(is_active, 1) = 1
  AND COALESCE(revoked_at, 0) = 0
  AND lower(COALESCE(token_type, '')) = 'oauth'
  AND (
    allowed_domains_json IS NULL
    OR trim(COALESCE(json_extract(allowed_domains_json, '$.oauth_tool_access'), '')) IN ('', '{}')
  );

-- 3) User MCP allowlist — agentsam_db_write alias (d1_write often already present).
INSERT OR IGNORE INTO agentsam_mcp_allowlist (
  id, user_id, workspace_id, tenant_id, tool_key, is_allowed, notes, created_at
)
SELECT
  'mcpal_' || lower(hex(randomblob(8))),
  u.id,
  'ws_inneranimalmedia',
  u.tenant_id,
  'agentsam_db_write',
  1,
  '438: ChatGPT D1 write (approval-gated)',
  unixepoch()
FROM auth_users u
WHERE u.email = 'sam@inneranimalmedia.com'
  AND NOT EXISTS (
    SELECT 1 FROM agentsam_mcp_allowlist a
     WHERE a.user_id = u.id
       AND a.workspace_id = 'ws_inneranimalmedia'
       AND a.tool_key = 'agentsam_db_write'
       AND COALESCE(a.is_allowed, 1) = 1
  );
