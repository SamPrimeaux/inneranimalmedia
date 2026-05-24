-- 409: Official IA logo on IAM MCP OAuth client (consent UI client block).
-- Use CF Images avatar (200×200) — sharper than thumbnail at 44px CSS display.

UPDATE oauth_clients
SET logo_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e323ffb-4338-41dc-1f71-9c7bdc57bb00/avatar',
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND COALESCE(logo_url, '') != 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e323ffb-4338-41dc-1f71-9c7bdc57bb00/avatar';
