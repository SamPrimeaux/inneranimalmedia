-- 408: ChatGPT custom connector callback (User-Defined OAuth Client).
-- Connector: Inner Animal Media MCP — copy URL from ChatGPT OAuth advanced settings.

UPDATE oauth_clients
SET redirect_uris = json_insert(
      COALESCE(redirect_uris, '[]'),
      '$[#]',
      'https://chatgpt.com/connector/oauth/Fp4-o8x6PZh_'
    ),
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND COALESCE(redirect_uris, '') NOT LIKE '%Fp4-o8x6PZh_%';
