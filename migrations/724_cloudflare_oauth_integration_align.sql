-- 724: Align Cloudflare OAuth integration catalog + registry metadata with live OAuth client scopes.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/724_cloudflare_oauth_integration_align.sql

UPDATE integration_catalog
SET
  oauth_scopes_default = '["account-settings.read","zone.read","workers-scripts.write","d1.read","workers-r2.read"]',
  oauth_scopes_available = '["account-settings.read","zone.read","workers-scripts.write","workers-scripts.read","d1.read","d1.write","workers-r2.read","workers-r2-bucket-item.read","workers-kv-storage.read","pages.read"]',
  description = 'Connect your Cloudflare account — Workers, D1, R2, KV, Pages, and account settings',
  docs_url = 'https://developers.cloudflare.com/fundamentals/oauth/authorizing-an-application/',
  sort_order = 10
WHERE slug = 'cloudflare';

-- Ensure registry rows exist for all tenants (idempotent).
INSERT OR IGNORE INTO integration_registry (
  id, tenant_id, provider_key, display_name, category, auth_type, status,
  scopes_json, config_json, secret_binding_name, sort_order, is_enabled
)
SELECT
  'int_cloudflare_oauth_' || substr(tenant_id, 1, 12),
  tenant_id,
  'cloudflare_oauth',
  'Cloudflare',
  'storage',
  'oauth2',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM user_oauth_tokens u
      WHERE lower(u.provider) = 'cloudflare'
      LIMIT 1
    ) THEN 'connected'
    ELSE 'disconnected'
  END,
  '["account-settings.read","zone.read","workers-scripts.write","d1.read","workers-r2.read"]',
  '{}',
  'CLOUDFLARE_OAUTH_CLIENT_ID',
  10,
  1
FROM (
  SELECT DISTINCT tenant_id FROM integration_registry WHERE tenant_id IS NOT NULL AND tenant_id != ''
) AS tenants;

-- Mark connected when a Cloudflare OAuth token exists for any user in the tenant workspace.
UPDATE integration_registry
SET
  status = 'connected',
  updated_at = datetime('now')
WHERE provider_key = 'cloudflare_oauth'
  AND status != 'connected'
  AND EXISTS (
    SELECT 1 FROM user_oauth_tokens u
    WHERE lower(u.provider) = 'cloudflare'
    LIMIT 1
  );
