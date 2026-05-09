-- 315: integration_catalog row for manual cloudflared / local tunnel (local_machine).
-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/315_integration_local_tunnel_catalog.sql
-- Registry seed for per-tenant rows: src/api/integrations.js REGISTRY_SEED (int_local_tunnel).
--
-- Security note: integration_registry.config_json for local_tunnel holds only the public tunnel base URL
-- and non-secret metadata (e.g. last_verified_at). Do not store API keys or PTY tokens in config_json;
-- use user_oauth_tokens / user_api_keys (encrypted) or Worker secrets (PTY_AUTH_TOKEN) instead.

INSERT OR REPLACE INTO integration_catalog (
  id, name, slug, category, auth_type, oauth_authorize_url,
  oauth_scopes_default, oauth_scopes_available,
  api_key_label, api_key_placeholder, docs_url, icon_slug, description,
  is_active, sort_order, created_at
) VALUES (
  'iam_local_tunnel',
  'Local Machine',
  'local_tunnel',
  'custom',
  'none',
  NULL,
  '[]',
  '[]',
  NULL,
  NULL,
  'https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/',
  'cloudflare',
  'Connect your local machine via cloudflared tunnel. POST { "tunnel_url": "https://…" } to /api/integrations/local_tunnel/connect.',
  1,
  34,
  unixepoch()
);
