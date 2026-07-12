-- 834: Cloudflare OAuth account_identifier hygiene + registry truth
-- Callback already stores hex account_id via GET /client/v4/accounts.
-- This migration:
--   1) Marks Connor-tenant cloudflare_oauth registry rows auth_expired when
--      the only token row still has account_identifier = 'Cloudflare' (dead token).
--   2) Marks Sam-tenant cloudflare_oauth disconnected when no user_oauth_tokens
--      cloudflare row exists for that tenant's users (registry was stale "connected").
-- Live token backfill cannot run in SQL — use:
--   node scripts/heal-cloudflare-oauth-account-ids.mjs
-- after a successful reconnect (or when access_token is still valid).

UPDATE integration_registry
   SET status = 'auth_expired',
       updated_at = datetime('now')
 WHERE lower(provider_key) = 'cloudflare_oauth'
   AND tenant_id IN (
     SELECT DISTINCT t.tenant_id
       FROM user_oauth_tokens t
      WHERE lower(t.provider) = 'cloudflare'
        AND (
          lower(trim(COALESCE(t.account_identifier, ''))) = 'cloudflare'
          OR trim(COALESCE(t.account_identifier, '')) = ''
        )
   );

-- Sam / tenants with registry "connected" but zero cloudflare oauth token rows.
UPDATE integration_registry
   SET status = 'disconnected',
       updated_at = datetime('now')
 WHERE lower(provider_key) = 'cloudflare_oauth'
   AND lower(COALESCE(status, '')) = 'connected'
   AND tenant_id NOT IN (
     SELECT DISTINCT COALESCE(t.tenant_id, '')
       FROM user_oauth_tokens t
      WHERE lower(t.provider) = 'cloudflare'
        AND COALESCE(t.tenant_id, '') != ''
   )
   AND tenant_id NOT IN (
     -- Keep tenants that have a valid hex account_identifier on any user token.
     SELECT DISTINCT COALESCE(t.tenant_id, '')
       FROM user_oauth_tokens t
      WHERE lower(t.provider) = 'cloudflare'
        AND length(trim(COALESCE(t.account_identifier, ''))) = 32
        AND lower(trim(t.account_identifier)) GLOB '[0-9a-f]*'
   );
