-- 471: Platform-owner MCP R2 — companionscpas bucket + OAuth tool config refresh
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/471_platform_owner_r2_oauth_companionscpas.sql

INSERT OR IGNORE INTO r2_bucket_list (bucket_name, creation_date, account_id, last_synced_at)
VALUES ('companionscpas', datetime('now'), 'ede6590ac0d2fb7daf155b35653457b2', datetime('now'));

UPDATE workspaces
SET r2_prefix = 'companionscpas/',
    updated_at = unixepoch()
WHERE id = 'ws_companionscpas'
  AND (r2_prefix IS NULL OR trim(r2_prefix) = '');

UPDATE agentsam_tools
SET handler_config = json_patch(
      COALESCE(NULLIF(trim(handler_config), ''), '{"binding":"ASSETS","auth_source":"platform","operation":"write"}'),
      '{"platform_owner_s3":true,"owner_bucket_registry":"r2_bucket_list","default_bucket":"inneranimalmedia"}'
    ),
    description = 'Write R2 object by bucket + key (put). Platform owner: all Worker-bound buckets plus account buckets in r2_bucket_list (e.g. companionscpas) via S3. Other OAuth users: connect own R2 keys.',
    input_schema = '{"type":"object","properties":{"bucket":{"type":"string","description":"R2 bucket (inneranimalmedia, companionscpas, iam-platform, iam-docs, tools, inneranimalmedia-autorag, …)"},"key":{"type":"string","description":"Object key path"},"content":{"type":"string","description":"File body (text or base64 for binary)"},"content_type":{"type":"string","default":"application/octet-stream"},"approval_id":{"type":"string","description":"Required for non-owner writes; owner may omit when policy allows"}},"required":["bucket","key","content"],"additionalProperties":false}',
    updated_at = unixepoch()
WHERE tool_key IN ('agentsam_r2_upload', 'agentsam_r2_write', 'r2_write')
  AND COALESCE(is_active, 1) = 1;

UPDATE agentsam_mcp_oauth_tool_allowlist
SET is_active = 1,
    expose_on_connector = 1,
    notes = 'Platform owner: all bound + r2_bucket_list buckets (companionscpas). Non-owner blocked.',
    updated_at = unixepoch()
WHERE client_id = 'iam_mcp_inneranimalmedia'
  AND tool_key IN ('agentsam_r2_write', 'agentsam_r2_upload');
