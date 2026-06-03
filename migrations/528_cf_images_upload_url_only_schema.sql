-- 528: agentsam_cf_images_upload — URL-only input_schema (no base64)
--
-- Run:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=migrations/528_cf_images_upload_url_only_schema.sql

UPDATE agentsam_tools
SET
  description = 'Upload an image to Cloudflare Images from a public HTTPS URL. Returns the CF Images delivery URL with transform variants. Not R2 — uses the Cloudflare Images API. Base64 upload is not supported; pass image_url only.',
  input_schema = '{"type":"object","properties":{"image_url":{"type":"string","description":"Public HTTPS URL of the image to upload (required). ChatGPT temporary image URLs are supported."},"metadata":{"type":"object","description":"Optional key/value tags merged with uploader identity"}},"required":["image_url"],"additionalProperties":false}',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_cf_images_upload';

UPDATE agentsam_mcp_oauth_tool_allowlist
SET notes = '528: CF Images upload — URL only (no base64)',
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key = 'agentsam_cf_images_upload';
