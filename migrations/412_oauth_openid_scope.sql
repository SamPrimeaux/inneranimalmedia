-- 412: Allow openid scope on canonical MCP OAuth client (OIDC id_token at token endpoint).

UPDATE oauth_clients
SET allowed_scopes = '["openid","iam:profile","iam:workspaces","iam:agent","mcp:tools","mcp:userinfo"]',
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia';
