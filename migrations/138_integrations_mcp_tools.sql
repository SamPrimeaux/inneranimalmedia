-- 138: Register Google Drive, GitHub, and Cloudflare Images MCP tools (BUILTIN)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/138_integrations_mcp_tools.sql
-- Purpose: Agent can call gdrive_list, gdrive_fetch, github_repos, github_file, cf_images_list, cf_images_upload, cf_images_delete; executed via worker BUILTIN.

INSERT OR IGNORE INTO mcp_registered_tools (
  id,
  tool_name,
  tool_category,
  mcp_service_url,
  description,
  input_schema,
  requires_approval,
  enabled,
  created_at,
  updated_at
) VALUES
  (
    'gdrive_list',
    'gdrive_list',
    'integrations',
    'BUILTIN',
    'List files and folders in Google Drive',
    '{"folder_id": "string (optional, default root)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  ),
  (
    'gdrive_fetch',
    'gdrive_fetch',
    'integrations',
    'BUILTIN',
    'Fetch file content from Google Drive by file id',
    '{"file_id": "string (required)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  ),
  (
    'github_repos',
    'github_repos',
    'integrations',
    'BUILTIN',
    'List GitHub repositories for the connected user',
    '{}',
    0,
    1,
    unixepoch(),
    unixepoch()
  ),
  (
    'github_file',
    'github_file',
    'integrations',
    'BUILTIN',
    'Get file content from a GitHub repo (owner/repo and path)',
    '{"repo": "string (required, e.g. owner/repo)", "path": "string (required)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  ),
  (
    'cf_images_list',
    'cf_images_list',
    'integrations',
    'BUILTIN',
    'List images in Cloudflare Images account',
    '{"page": "number (optional)", "per_page": "number (optional)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  ),
  (
    'cf_images_upload',
    'cf_images_upload',
    'integrations',
    'BUILTIN',
    'Upload an image to Cloudflare Images by URL',
    '{"url": "string (required)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  ),
  (
    'cf_images_delete',
    'cf_images_delete',
    'integrations',
    'BUILTIN',
    'Delete an image from Cloudflare Images by id',
    '{"id": "string (required)"}',
    0,
    1,
    unixepoch(),
    unixepoch()
  );
