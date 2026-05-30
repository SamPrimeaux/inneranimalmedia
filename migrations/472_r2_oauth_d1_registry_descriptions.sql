-- 472: R2 OAuth tools — D1 registry-driven descriptions (no hardcoded bucket names in copy)
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/472_r2_oauth_d1_registry_descriptions.sql

UPDATE agentsam_tools
SET handler_config = json_patch(
      COALESCE(NULLIF(trim(handler_config), ''), '{"auth_source":"platform","operation":"write"}'),
      '{"platform_owner_s3":true,"owner_bucket_registry":"r2_bucket_list,r2_bucket_bindings,project_storage"}'
    ),
    description = 'Write R2 object by bucket + key (put). Platform owner: any bucket registered in D1 (r2_bucket_list, r2_bucket_bindings, project_storage) via Worker binding or account S3. Other OAuth users: connect own R2 keys in Settings → Storage.',
    input_schema = '{"type":"object","properties":{"bucket":{"type":"string","description":"R2 bucket name (must exist in D1 R2 registry)"},"key":{"type":"string","description":"Object key path"},"content":{"type":"string","description":"File body (text or base64 for binary)"},"content_type":{"type":"string","default":"application/octet-stream"},"approval_id":{"type":"string"}},"required":["bucket","key","content"],"additionalProperties":false}',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_r2_upload', 'agentsam_r2_write', 'r2_write')
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_mcp_oauth_tool_allowlist
SET notes = 'Platform owner: D1-registered buckets only. Non-owner blocked from platform auth_source.',
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN ('agentsam_r2_write', 'agentsam_r2_upload');
