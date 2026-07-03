-- 767: Stripe Connect OAuth catalog + integration_registry alignment.
-- Allowlist tables (agentsam_browser_trusted_origin, agentsam_fetch_domain_allowlist,
-- agentsam_mcp_allowlist) are already populated in D1 — do not re-seed here.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/767_stripe_browser_trust_oauth.sql

-- Stripe integration registry row (disconnected until OAuth completes).
INSERT OR IGNORE INTO integration_registry (
  id, tenant_id, provider_key, display_name, category, auth_type, status,
  config_json, sort_order, is_enabled, updated_at
)
VALUES (
  'int_stripe_tenant_sam',
  'tenant_sam_primeaux',
  'stripe',
  'Stripe',
  'payment',
  'oauth2',
  'disconnected',
  '{"mcp_server_url":"https://mcp.stripe.com"}',
  40,
  1,
  datetime('now')
);

UPDATE integration_registry
SET
  config_json = json_set(
    COALESCE(NULLIF(config_json, ''), '{}'),
    '$.mcp_server_url',
    'https://mcp.stripe.com'
  ),
  updated_at = datetime('now')
WHERE tenant_id = 'tenant_sam_primeaux'
  AND lower(provider_key) = 'stripe';

-- Align catalog: Connect OAuth uses read_write scope.
UPDATE integration_catalog
SET
  oauth_scopes_default = '["read_write"]',
  oauth_scopes_available = '["read_only","read_write"]',
  oauth_authorize_url = 'https://connect.stripe.com/oauth/authorize',
  description = 'Connect Stripe — API access, MCP at mcp.stripe.com, and Browser Run for dashboard.stripe.com'
WHERE lower(slug) = 'stripe';
