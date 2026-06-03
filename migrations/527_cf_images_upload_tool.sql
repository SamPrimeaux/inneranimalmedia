-- 527: agentsam_cf_images_upload — Cloudflare Images (not R2)
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/527_cf_images_upload_tool.sql

INSERT OR IGNORE INTO agentsam_tools (
  id, tool_name, tool_key, display_name,
  handler_type, tool_category, domain,
  handler_key, handler_config,
  description, input_schema,
  risk_level, requires_approval,
  is_active, oauth_visible, is_global,
  workspace_scope, modes_json,
  sort_priority, dispatch_target,
  created_at, updated_at
) VALUES (
  'ast_agentsam_cf_images_upload',
  'agentsam_cf_images_upload',
  'agentsam_cf_images_upload',
  'CF Images Upload',
  'cf', 'storage.images', 'storage',
  'agentsam_cf_images_upload',
  '{"operation":"images.upload","auth_source":"workspace","provider":"cloudflare","resource":"images"}',
  'Upload an image to Cloudflare Images from a URL or base64 content. Returns the CF Images delivery URL with transform variants. Not R2 — uses the Cloudflare Images API and delivery pipeline.',
  '{"type":"object","properties":{"image_url":{"type":"string","description":"Public URL of image to upload (ChatGPT image URLs work here)"},"base64_content":{"type":"string","description":"Base64-encoded image (alternative to image_url)"},"filename":{"type":"string","description":"Optional filename when using base64_content"},"metadata":{"type":"object","description":"Optional key/value tags merged with uploader identity"}},"additionalProperties":false}',
  'medium', 0,
  1, 1, 1,
  '["*"]', '["auto","agent","debug"]',
  115, 'both',
  unixepoch(), unixepoch()
);

INSERT OR IGNORE INTO agentsam_mcp_oauth_tool_allowlist (
  client_id, tool_key, access_class, sort_order, notes, is_active, expose_on_connector, runtime_contract_key, connector_priority, updated_at
) VALUES (
  'iam_mcp_inneranimalmedia',
  'agentsam_cf_images_upload',
  'write',
  125,
  '527: CF Images upload from URL or base64',
  1,
  1,
  'agentsam_cf_images_upload',
  125,
  unixepoch()
);

UPDATE mcp_workspace_tokens
SET allowed_tools = (
  SELECT COALESCE(json_group_array(tool_key), '[]')
  FROM (
    SELECT a.tool_key
    FROM agentsam_mcp_oauth_tool_allowlist a
    INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
    WHERE a.client_id = 'iam_mcp_inneranimalmedia'
      AND COALESCE(a.is_active, 1) = 1
      AND COALESCE(t.is_active, 1) = 1
      AND COALESCE(t.is_degraded, 0) = 0
    ORDER BY a.sort_order ASC, a.tool_key ASC
  )
),
allowed_domains_json = json_set(
  COALESCE(allowed_domains_json, '{}'),
  '$.oauth_tool_access',
  COALESCE(
    (
      SELECT json_group_object(
        a.tool_key,
        CASE WHEN lower(a.access_class) = 'write' THEN 'write' ELSE 'read' END
      )
      FROM agentsam_mcp_oauth_tool_allowlist a
      INNER JOIN agentsam_tools t ON t.tool_key = a.tool_key
      WHERE a.client_id = 'iam_mcp_inneranimalmedia'
        AND COALESCE(a.is_active, 1) = 1
        AND COALESCE(t.is_active, 1) = 1
        AND COALESCE(t.is_degraded, 0) = 0
    ),
    '{}'
  )
)
WHERE lower(COALESCE(token_type, '')) = 'oauth'
  AND COALESCE(is_active, 1) = 1
  AND COALESCE(revoked_at, 0) = 0;
