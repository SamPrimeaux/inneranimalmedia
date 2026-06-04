-- 548: agentsam_kv_manage — cf/kv.manage executor + superadmin uses platform CLOUDFLARE_API_TOKEN.
-- Customers: workspace BYOK (user_api_keys provider=cloudflare). Superadmin: Wrangler token bypass in resolveCredential.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/548_kv_manage_cf_executor_platform_token.sql

UPDATE agentsam_tools
SET
  handler_type = 'cf',
  tool_category = 'storage.kv.manage',
  handler_config = '{"operation":"kv.manage","auth_source":"workspace","provider":"cloudflare","resource":"kv","credential_lane":"byok_or_superadmin_platform"}',
  description = 'List/read/write/delete Workers KV keys via Cloudflare API. Superadmin: platform CLOUDFLARE_API_TOKEN + account id. Customers: connect Cloudflare API token in Settings → Keys for this workspace.',
  updated_at = unixepoch()
WHERE tool_key = 'agentsam_kv_manage'
  AND COALESCE(is_active, 1) = 1;
