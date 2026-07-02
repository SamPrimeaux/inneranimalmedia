-- 766: MCP server catalog row for home "+" connect picker (OAuth via mcp.inneranimalmedia.com).
-- Resell contract: edit integration_catalog.icon_url + is_active — home grid updates on next load.

INSERT OR IGNORE INTO integration_catalog (
  id, name, slug, category, auth_type, oauth_authorize_url,
  oauth_scopes_default, oauth_scopes_available,
  api_key_label, api_key_placeholder, docs_url, icon_slug, icon_url, description,
  is_active, sort_order, created_at
) VALUES (
  'iam_mcp_remote',
  'Inner Animal MCP Server',
  'inneranimalmedia-mcp',
  'mcp',
  'oauth',
  'https://mcp.inneranimalmedia.com/api/oauth/authorize',
  '[]',
  '[]',
  NULL,
  NULL,
  'https://mcp.inneranimalmedia.com',
  'mcp',
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar',
  'Same OAuth tool catalog as Cursor, Claude, and ChatGPT MCP clients.',
  1,
  3,
  unixepoch()
);

INSERT OR IGNORE INTO integration_catalog (
  id, name, slug, category, auth_type,
  oauth_scopes_default, oauth_scopes_available,
  docs_url, icon_slug, icon_url, description,
  is_active, sort_order, created_at
) VALUES (
  'iam_agentsam_sdk',
  'Agent Sam SDK',
  'agentsam-sdk',
  'iam_hosted',
  'none',
  '[]',
  '[]',
  'https://www.npmjs.com/package/@inneranimalmedia/agentsam-sdk',
  'agentsam',
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/0b4355d1-1883-4819-0c62-cdd1d6289f00/avatar',
  'Build Cloudflare Workers agents with the Agent Sam SDK — docs and scaffolds.',
  1,
  4,
  unixepoch()
);
